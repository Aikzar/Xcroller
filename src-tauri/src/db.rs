use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Folder {
    pub id: i64,
    pub path: String,
    pub is_active: bool,
    pub is_available: bool,
}

#[derive(Debug, Clone)]
pub struct FolderRecord {
    pub id: i64,
    pub path: String,
    pub volume_id: Option<String>,
    pub relative_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MediaItem {
    pub id: Option<i64>,
    pub path: String,
    pub file_type: String, // "image" or "video"
    pub size_bytes: i64,
    pub created_at: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub duration_sec: Option<f64>,
    pub starred: bool,
}

pub const SCHEMA_MEDIA: &str = "
CREATE TABLE IF NOT EXISTS media_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    file_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_sec REAL,
    starred BOOLEAN DEFAULT 0
);
";

pub const SCHEMA_FOLDERS: &str = "
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    volume_id TEXT,
    relative_path TEXT
);
";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Feed {
    pub id: Option<i64>,
    pub name: String,
    pub folder_paths: String,  // JSON: Vec<String>
    pub filter_config: String, // JSON: FilterOptions
}

pub const SCHEMA_FEEDS: &str = "
CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    folder_paths TEXT NOT NULL,
    filter_config TEXT NOT NULL
);
";

pub const SCHEMA_SETTINGS: &str = "
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
";

pub const SCHEMA_INDICES: &str = "
CREATE INDEX IF NOT EXISTS idx_media_created ON media_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_starred ON media_items(starred);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_items(file_type);
CREATE INDEX IF NOT EXISTS idx_media_duration ON media_items(duration_sec);
";

pub fn migrate_schema(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(folders)")?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    if !columns.iter().any(|column| column == "volume_id") {
        conn.execute("ALTER TABLE folders ADD COLUMN volume_id TEXT", [])?;
    }
    if !columns.iter().any(|column| column == "relative_path") {
        conn.execute("ALTER TABLE folders ADD COLUMN relative_path TEXT", [])?;
    }

    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct FilterOptions {
    pub media_type: Option<String>,  // "image", "video", or "all"
    pub orientation: Option<String>, // "horizontal", "vertical", "square", or "all"
    pub min_width: Option<i32>,
    pub min_height: Option<i32>,
    pub min_duration: Option<f64>,
    pub max_duration: Option<f64>,
    pub min_size: Option<i64>,
    pub max_size: Option<i64>,
    pub extensions: Option<Vec<String>>,
    pub folder_paths: Option<Vec<String>>, // Added for feed-specific logic
    pub favorites_only: Option<bool>,
    pub sort_by: Option<String>, // "created_at", "size_bytes", "resolution", "duration_sec", "random"
    pub sort_order: Option<String>, // "asc", "desc"
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    #[test]
    fn duration_range_excludes_unknown_and_out_of_range_media() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(SCHEMA_MEDIA)
            .expect("create media table");

        let rows = [
            ("C:/media/short.mp4", "video", Some(10.0)),
            ("C:/media/long.mp4", "video", Some(35.0)),
            ("C:/media/unknown.webm", "video", None),
            ("C:/media/photo.jpg", "image", None),
        ];
        for (path, file_type, duration) in rows {
            conn.execute(
                "INSERT INTO media_items
                 (path, file_type, size_bytes, created_at, duration_sec)
                 VALUES (?1, ?2, 1, 1, ?3)",
                params![path, file_type, duration],
            )
            .expect("insert fixture");
        }

        let items = changes::get_media(
            &conn,
            50,
            0,
            FilterOptions {
                media_type: Some("video".to_string()),
                min_duration: Some(5.0),
                max_duration: Some(20.0),
                ..FilterOptions::default()
            },
        )
        .expect("query duration range");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "C:/media/short.mp4");
    }

    #[test]
    fn app_preferences_round_trip_as_one_record() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(SCHEMA_SETTINGS)
            .expect("create settings table");

        assert_eq!(changes::get_app_preferences(&conn).unwrap(), None);

        let preferences = r#"{"columns":7,"hoverVolume":0.1,"activeFeedId":"favorites"}"#;
        changes::save_app_preferences(&conn, preferences).unwrap();

        assert_eq!(
            changes::get_app_preferences(&conn).unwrap().as_deref(),
            Some(preferences)
        );
    }

    #[test]
    fn legacy_folder_schema_migrates_idempotently() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(
            "CREATE TABLE folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                is_active BOOLEAN DEFAULT 1
            );",
        )
        .unwrap();

        migrate_schema(&conn).unwrap();
        migrate_schema(&conn).unwrap();

        let columns = {
            let mut stmt = conn.prepare("PRAGMA table_info(folders)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .collect::<rusqlite::Result<Vec<_>>>()
                .unwrap()
        };
        assert!(columns.contains(&"volume_id".to_string()));
        assert!(columns.contains(&"relative_path".to_string()));
    }

    #[test]
    fn empty_or_special_character_folder_filters_never_leak_other_media() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(SCHEMA_MEDIA)
            .expect("create media table");
        for path in [
            "F:/Media_100/inside.mp4",
            "F:/Media_100/sub/inside.mp4",
            "F:/MediaX100/outside.mp4",
            "F:/MediaA100/outside.mp4",
        ] {
            conn.execute(
                "INSERT INTO media_items (path, file_type, size_bytes, created_at) VALUES (?1, 'video', 1, 1)",
                params![path],
            )
            .unwrap();
        }

        let offline = changes::get_media(
            &conn,
            50,
            0,
            FilterOptions {
                folder_paths: Some(Vec::new()),
                ..FilterOptions::default()
            },
        )
        .unwrap();
        assert!(offline.is_empty());

        let filtered = changes::get_media(
            &conn,
            50,
            0,
            FilterOptions {
                folder_paths: Some(vec!["F:/Media_100".into()]),
                ..FilterOptions::default()
            },
        )
        .unwrap();
        assert_eq!(filtered.len(), 2);
        assert!(filtered
            .iter()
            .all(|item| item.path.starts_with("F:/Media_100/")));
    }

    #[test]
    fn drive_relocation_preserves_index_favorites_and_saved_feeds_at_scale() {
        let mut conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(&format!(
            "{SCHEMA_MEDIA}{SCHEMA_FOLDERS}{SCHEMA_FEEDS}{SCHEMA_SETTINGS}"
        ))
        .expect("create schema");

        conn.execute(
            "INSERT INTO folders (path, is_active, volume_id, relative_path)
             VALUES ('F:/Archive', 1, 'external-drive', 'Archive')",
            [],
        )
        .unwrap();
        let folder_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO folders (path, is_active) VALUES ('H:/Archive', 0)",
            [],
        )
        .unwrap();

        let transaction = conn.transaction().unwrap();
        for index in 0..1_000 {
            transaction
                .execute(
                    "INSERT INTO media_items
                     (path, file_type, size_bytes, created_at, width, starred)
                     VALUES (?1, 'video', 1, ?2, 1920, ?3)",
                    params![
                        format!("F:/Archive/set-{}/clip-{index}.mp4", index % 10),
                        index,
                        index == 7
                    ],
                )
                .unwrap();
        }
        transaction.commit().unwrap();
        conn.execute(
            "INSERT INTO media_items
             (path, file_type, size_bytes, created_at, width, duration_sec)
             VALUES ('H:/Archive/set-0/clip-0.mp4', 'video', 1, 1, NULL, 4.0)",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO feeds (name, folder_paths, filter_config) VALUES (?1, ?2, ?3)",
            params![
                "External",
                r#"["F:/Archive"]"#,
                r#"{"folder_paths":["F:/Archive"],"note":"F:/Archive-old is separate"}"#
            ],
        )
        .unwrap();
        changes::save_app_preferences(
            &conn,
            r#"{"lastFolder":"F:/Archive","unrelated":"F:/Archive-old"}"#,
        )
        .unwrap();

        changes::relocate_folder(
            &mut conn,
            folder_id,
            "F:/Archive",
            "H:/Archive",
            &crate::storage::FolderLocation {
                volume_id: Some("external-drive".into()),
                relative_path: Some("Archive".into()),
            },
        )
        .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM media_items WHERE path LIKE 'H:/Archive/%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1_000);
        let starred: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM media_items WHERE starred = 1 AND path LIKE 'H:/Archive/%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(starred, 1);
        let merged: (Option<i32>, Option<f64>) = conn
            .query_row(
                "SELECT width, duration_sec FROM media_items
                 WHERE path = 'H:/Archive/set-0/clip-0.mp4'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(merged, (Some(1920), Some(4.0)));
        let folder: (i64, bool) = conn
            .query_row(
                "SELECT COUNT(*), MAX(is_active) FROM folders WHERE path = 'H:/Archive'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(folder, (1, true));

        let feed = changes::get_feeds(&conn).unwrap().remove(0);
        assert!(feed.folder_paths.contains("H:/Archive"));
        assert!(feed.filter_config.contains("H:/Archive"));
        assert!(feed.filter_config.contains("F:/Archive-old"));
        let preferences = changes::get_app_preferences(&conn).unwrap().unwrap();
        assert!(preferences.contains("H:/Archive"));
        assert!(preferences.contains("F:/Archive-old"));
    }
}

pub mod changes {
    use super::*;
    use crate::storage::{self, FolderLocation};
    use rusqlite::{params, Connection, OptionalExtension, Result, Transaction};

    const APP_PREFERENCES_KEY: &str = "app_preferences";

    pub fn get_app_preferences(conn: &Connection) -> Result<Option<String>> {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![APP_PREFERENCES_KEY],
            |row| row.get(0),
        )
        .optional()
    }

    pub fn save_app_preferences(conn: &Connection, preferences: &str) -> Result<()> {
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![APP_PREFERENCES_KEY, preferences],
        )?;
        Ok(())
    }

    pub fn get_feeds(conn: &Connection) -> Result<Vec<Feed>> {
        let mut stmt = conn.prepare("SELECT id, name, folder_paths, filter_config FROM feeds")?;
        let feeds = stmt
            .query_map([], |row| {
                Ok(Feed {
                    id: Some(row.get(0)?),
                    name: row.get(1)?,
                    folder_paths: row.get(2)?,
                    filter_config: row.get(3)?,
                })
            })?
            .filter_map(Result::ok)
            .collect();
        Ok(feeds)
    }

    pub fn save_feed(conn: &Connection, feed: Feed) -> Result<()> {
        if let Some(id) = feed.id {
            conn.execute(
                "UPDATE feeds SET name = ?1, folder_paths = ?2, filter_config = ?3 WHERE id = ?4",
                params![feed.name, feed.folder_paths, feed.filter_config, id],
            )?;
        } else {
            conn.execute(
                "INSERT INTO feeds (name, folder_paths, filter_config) VALUES (?1, ?2, ?3)",
                params![feed.name, feed.folder_paths, feed.filter_config],
            )?;
        }
        Ok(())
    }

    pub fn delete_feed(conn: &Connection, id: i64) -> Result<()> {
        conn.execute("DELETE FROM feeds WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_media(
        conn: &Connection,
        limit: i64,
        offset: i64,
        filters: FilterOptions,
    ) -> Result<Vec<MediaItem>> {
        let mut query = "SELECT id, path, file_type, size_bytes, created_at, width, height, duration_sec, starred FROM media_items".to_string();
        let mut where_clauses = Vec::new();

        if let Some(true) = filters.favorites_only {
            where_clauses.push("starred = 1".to_string());
        }

        // Feed / Folder constraints
        if let Some(paths) = filters.folder_paths {
            if paths.is_empty() {
                // An explicitly empty source list means every configured source
                // is offline. Never fall back to returning stale media globally.
                where_clauses.push("1 = 0".to_string());
            } else {
                let mut folder_likes = Vec::new();
                for p in paths {
                    let escaped = storage::normalize_path(&p)
                        .replace('\\', "\\\\")
                        .replace('%', "\\%")
                        .replace('_', "\\_")
                        .replace('\'', "''");
                    folder_likes.push(format!(
                        "(path = '{escaped}' OR path LIKE '{escaped}/%' ESCAPE '\\')"
                    ));
                }
                where_clauses.push(format!("({})", folder_likes.join(" OR ")));
            }
        }

        if let Some(mt) = filters.media_type {
            if mt != "all" {
                where_clauses.push(format!("file_type = '{}'", mt));
            }
        }

        if let Some(orient) = filters.orientation {
            match orient.as_str() {
                "horizontal" => where_clauses.push("width > height".to_string()),
                "vertical" => where_clauses.push("width < height".to_string()),
                "square" => where_clauses.push("width = height".to_string()),
                _ => {}
            }
        }

        if let Some(min_w) = filters.min_width {
            where_clauses.push(format!("width >= {}", min_w));
        }
        if let Some(min_h) = filters.min_height {
            where_clauses.push(format!("height >= {}", min_h));
        }
        if let Some(min_d) = filters.min_duration {
            if min_d >= 0.0 {
                where_clauses.push(format!("duration_sec >= {}", min_d));
            }
        }
        if let Some(max_d) = filters.max_duration {
            if max_d >= 0.0 {
                where_clauses.push(format!("duration_sec <= {}", max_d));
            }
        }
        if let Some(min_s) = filters.min_size {
            where_clauses.push(format!("size_bytes >= {}", min_s));
        }
        if let Some(max_s) = filters.max_size {
            where_clauses.push(format!("size_bytes <= {}", max_s));
        }

        if let Some(exts) = filters.extensions {
            if !exts.is_empty() {
                let mut ext_clauses = Vec::new();
                for ext in exts {
                    let escaped_ext = ext.to_lowercase().replace("'", "''");
                    ext_clauses.push(format!("path LIKE '%.{}'", escaped_ext));
                }
                where_clauses.push(format!("({})", ext_clauses.join(" OR ")));
            }
        }

        if !where_clauses.is_empty() {
            query.push_str(" WHERE ");
            query.push_str(&where_clauses.join(" AND "));
        }

        // Sorting
        let sort_col = match filters.sort_by.as_deref() {
            Some("size_bytes") => "size_bytes",
            Some("resolution") => "(width * height)",
            Some("duration_sec") => "duration_sec",
            Some("filename") => "path",
            Some("random") => "RANDOM()",
            _ => "created_at",
        };

        let order = if filters.sort_order.as_deref() == Some("asc") {
            "ASC"
        } else {
            "DESC"
        };

        if sort_col == "RANDOM()" {
            query.push_str(" ORDER BY RANDOM()");
        } else {
            query.push_str(&format!(" ORDER BY {} {}", sort_col, order));
        }

        query.push_str(" LIMIT ?1 OFFSET ?2");

        let mut stmt = conn.prepare(&query)?;
        let items = stmt
            .query_map(params![limit, offset], |row| {
                Ok(MediaItem {
                    id: Some(row.get(0)?),
                    path: row.get(1)?,
                    file_type: row.get(2)?,
                    size_bytes: row.get(3)?,
                    created_at: row.get(4)?,
                    width: row.get(5).ok(),
                    height: row.get(6).ok(),
                    duration_sec: row.get(7).ok(),
                    starred: row.get(8)?,
                })
            })?
            .filter_map(Result::ok)
            .collect();
        Ok(items)
    }

    pub fn get_folders(conn: &Connection) -> Result<Vec<Folder>> {
        let mut stmt = conn.prepare("SELECT id, path, is_active FROM folders")?;
        let folders = stmt
            .query_map([], |row| {
                Ok(Folder {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    is_active: row.get(2)?,
                    is_available: false,
                })
            })?
            .filter_map(Result::ok)
            .map(|mut folder| {
                folder.is_available = storage::folder_is_available(&folder.path);
                folder
            })
            .collect();
        Ok(folders)
    }

    pub fn get_folder_records(conn: &Connection) -> Result<Vec<FolderRecord>> {
        let mut stmt =
            conn.prepare("SELECT id, path, volume_id, relative_path FROM folders ORDER BY id")?;
        let records = stmt
            .query_map([], |row| {
                Ok(FolderRecord {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    volume_id: row.get(2)?,
                    relative_path: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(records)
    }

    pub fn update_folder_location(
        conn: &Connection,
        id: i64,
        location: &FolderLocation,
    ) -> Result<()> {
        conn.execute(
            "UPDATE folders SET volume_id = ?1, relative_path = ?2 WHERE id = ?3",
            params![location.volume_id, location.relative_path, id],
        )?;
        Ok(())
    }

    pub fn add_or_relocate_folder(
        conn: &mut Connection,
        path: &str,
        location: &FolderLocation,
    ) -> Result<()> {
        let path = storage::normalize_path(path);
        let existing = get_folder_records(conn)?.into_iter().find(|folder| {
            folder.path.eq_ignore_ascii_case(&path)
                || (location.volume_id.is_some()
                    && folder.volume_id == location.volume_id
                    && folder.relative_path == location.relative_path)
        });

        if let Some(folder) = existing {
            if !folder.path.eq_ignore_ascii_case(&path) {
                relocate_folder(conn, folder.id, &folder.path, &path, location)?;
            } else {
                update_folder_location(conn, folder.id, location)?;
            }
        } else {
            conn.execute(
                "INSERT INTO folders (path, volume_id, relative_path) VALUES (?1, ?2, ?3)",
                params![path, location.volume_id, location.relative_path],
            )?;
        }

        Ok(())
    }

    pub fn relocate_folder(
        conn: &mut Connection,
        folder_id: i64,
        old_path: &str,
        new_path: &str,
        location: &FolderLocation,
    ) -> Result<()> {
        let transaction = conn.transaction()?;
        relocate_media_rows(&transaction, old_path, new_path)?;
        rewrite_saved_paths(&transaction, old_path, new_path)?;

        let duplicate: Option<(i64, bool)> = transaction
            .query_row(
                "SELECT id, is_active FROM folders WHERE path = ?1 AND id != ?2",
                params![new_path, folder_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        if let Some((duplicate_id, duplicate_active)) = duplicate {
            let current_active: bool = transaction.query_row(
                "SELECT is_active FROM folders WHERE id = ?1",
                params![folder_id],
                |row| row.get(0),
            )?;
            transaction.execute(
                "UPDATE folders
                 SET is_active = ?1, volume_id = ?2, relative_path = ?3
                 WHERE id = ?4",
                params![
                    duplicate_active || current_active,
                    location.volume_id,
                    location.relative_path,
                    duplicate_id
                ],
            )?;
            transaction.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])?;
        } else {
            transaction.execute(
                "UPDATE folders
                 SET path = ?1, volume_id = ?2, relative_path = ?3
                 WHERE id = ?4",
                params![
                    new_path,
                    location.volume_id,
                    location.relative_path,
                    folder_id
                ],
            )?;
        }

        transaction.commit()
    }

    fn relocate_media_rows(
        transaction: &Transaction<'_>,
        old_path: &str,
        new_path: &str,
    ) -> Result<()> {
        let mut stmt = transaction.prepare(
            "SELECT id, path, starred, width, height, duration_sec FROM media_items ORDER BY id",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, bool>(2)?,
                    row.get::<_, Option<i32>>(3)?,
                    row.get::<_, Option<i32>>(4)?,
                    row.get::<_, Option<f64>>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>>>()?;
        drop(stmt);

        for (id, path, starred, width, height, duration) in rows {
            let Some(replacement) = storage::replace_path_prefix(&path, old_path, new_path) else {
                continue;
            };

            let duplicate_id: Option<i64> = transaction
                .query_row(
                    "SELECT id FROM media_items WHERE path = ?1 AND id != ?2",
                    params![replacement, id],
                    |row| row.get(0),
                )
                .optional()?;

            if let Some(duplicate_id) = duplicate_id {
                transaction.execute(
                    "UPDATE media_items
                     SET starred = starred OR ?1,
                         width = COALESCE(width, ?2),
                         height = COALESCE(height, ?3),
                         duration_sec = COALESCE(duration_sec, ?4)
                     WHERE id = ?5",
                    params![starred, width, height, duration, duplicate_id],
                )?;
                transaction.execute("DELETE FROM media_items WHERE id = ?1", params![id])?;
            } else {
                transaction.execute(
                    "UPDATE media_items SET path = ?1 WHERE id = ?2",
                    params![replacement, id],
                )?;
            }
        }

        Ok(())
    }

    fn rewrite_json_paths(value: &mut serde_json::Value, old_path: &str, new_path: &str) {
        match value {
            serde_json::Value::String(path) => {
                if let Some(replacement) = storage::replace_path_prefix(path, old_path, new_path) {
                    *path = replacement;
                }
            }
            serde_json::Value::Array(values) => {
                for value in values {
                    rewrite_json_paths(value, old_path, new_path);
                }
            }
            serde_json::Value::Object(values) => {
                for value in values.values_mut() {
                    rewrite_json_paths(value, old_path, new_path);
                }
            }
            _ => {}
        }
    }

    fn rewrite_json_column(
        transaction: &Transaction<'_>,
        table: &str,
        id_column: &str,
        value_column: &str,
        old_path: &str,
        new_path: &str,
    ) -> Result<()> {
        let query = format!("SELECT {id_column}, {value_column} FROM {table}");
        let mut stmt = transaction.prepare(&query)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>>>()?;
        drop(stmt);

        for (id, serialized) in rows {
            let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&serialized) else {
                continue;
            };
            let original = value.clone();
            rewrite_json_paths(&mut value, old_path, new_path);
            if value != original {
                let update =
                    format!("UPDATE {table} SET {value_column} = ?1 WHERE {id_column} = ?2");
                transaction.execute(&update, params![value.to_string(), id])?;
            }
        }

        Ok(())
    }

    fn rewrite_saved_paths(
        transaction: &Transaction<'_>,
        old_path: &str,
        new_path: &str,
    ) -> Result<()> {
        rewrite_json_column(
            transaction,
            "feeds",
            "id",
            "folder_paths",
            old_path,
            new_path,
        )?;
        rewrite_json_column(
            transaction,
            "feeds",
            "id",
            "filter_config",
            old_path,
            new_path,
        )?;

        let preferences: Option<String> = transaction
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![APP_PREFERENCES_KEY],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(serialized) = preferences {
            if let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&serialized) {
                let original = value.clone();
                rewrite_json_paths(&mut value, old_path, new_path);
                if value != original {
                    transaction.execute(
                        "UPDATE app_settings SET value = ?1 WHERE key = ?2",
                        params![value.to_string(), APP_PREFERENCES_KEY],
                    )?;
                }
            }
        }

        Ok(())
    }

    pub fn remove_folder(conn: &mut Connection, path: &str) -> Result<()> {
        let path = storage::normalize_path(path);
        let transaction = conn.transaction()?;

        let media_rows = {
            let mut stmt = transaction.prepare("SELECT id, path FROM media_items")?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>>>()?;
            rows
        };
        for (id, media_path) in media_rows {
            if storage::is_path_within(&media_path, &path) {
                transaction.execute("DELETE FROM media_items WHERE id = ?1", params![id])?;
            }
        }

        transaction.execute("DELETE FROM folders WHERE path = ?1", params![path])?;

        let feeds = {
            let mut stmt = transaction.prepare("SELECT id, folder_paths FROM feeds")?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>>>()?;
            rows
        };
        for (id, serialized) in feeds {
            let Ok(mut paths) = serde_json::from_str::<Vec<String>>(&serialized) else {
                continue;
            };
            let original_len = paths.len();
            paths.retain(|candidate| {
                !storage::normalize_path(candidate).eq_ignore_ascii_case(&path)
            });
            if paths.len() != original_len {
                transaction.execute(
                    "UPDATE feeds SET folder_paths = ?1 WHERE id = ?2",
                    params![serde_json::to_string(&paths).unwrap_or_default(), id],
                )?;
            }
        }

        transaction.commit()
    }

    pub fn toggle_star(conn: &Connection, id: i64) -> Result<bool> {
        let currently_starred: bool = conn
            .query_row(
                "SELECT starred FROM media_items WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        let new_status = !currently_starred;
        conn.execute(
            "UPDATE media_items SET starred = ?1 WHERE id = ?2",
            params![new_status, id],
        )?;
        Ok(new_status)
    }

    pub fn get_starred_items(conn: &Connection) -> Result<Vec<String>> {
        let mut stmt = conn.prepare("SELECT path FROM media_items WHERE starred = 1")?;
        let paths = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(Result::ok)
            .collect();
        Ok(paths)
    }

    pub fn update_media_dimensions(
        conn: &Connection,
        id: i64,
        width: i32,
        height: i32,
    ) -> Result<()> {
        conn.execute(
            "UPDATE media_items SET width = ?1, height = ?2 WHERE id = ?3",
            params![width, height, id],
        )?;
        Ok(())
    }

    pub fn update_media_metadata(
        conn: &Connection,
        id: i64,
        width: Option<i32>,
        height: Option<i32>,
        duration_sec: Option<f64>,
    ) -> Result<()> {
        conn.execute(
            "UPDATE media_items
             SET width = COALESCE(?1, width),
                 height = COALESCE(?2, height),
                 duration_sec = COALESCE(?3, duration_sec)
             WHERE id = ?4",
            params![width, height, duration_sec, id],
        )?;
        Ok(())
    }

    pub fn clear_favorites(conn: &Connection) -> Result<()> {
        conn.execute("UPDATE media_items SET starred = 0", [])?;
        Ok(())
    }
}
