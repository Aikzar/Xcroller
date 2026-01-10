use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Folder {
    pub id: i64,
    pub path: String,
    pub is_active: bool,
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
    is_active BOOLEAN DEFAULT 1
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

pub const SCHEMA_INDICES: &str = "
CREATE INDEX IF NOT EXISTS idx_media_created ON media_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_starred ON media_items(starred);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_items(file_type);
";

#[derive(Serialize, Deserialize, Debug, Clone)]
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

pub mod changes {
    use super::*;
    use rusqlite::{params, Connection, Result};

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
            if !paths.is_empty() {
                let mut folder_likes = Vec::new();
                for p in paths {
                    // Escape single quotes for SQLite
                    let escaped = p.replace("'", "''");
                    folder_likes.push(format!("path LIKE '{}%'", escaped));
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
            if min_d > 0.0 {
                where_clauses.push(format!(
                    "(duration_sec >= {} OR duration_sec IS NULL)",
                    min_d
                ));
            }
        }
        if let Some(max_d) = filters.max_duration {
            if max_d > 0.0 {
                where_clauses.push(format!(
                    "(duration_sec <= {} OR duration_sec IS NULL)",
                    max_d
                ));
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
                })
            })?
            .filter_map(Result::ok)
            .collect();
        Ok(folders)
    }

    pub fn add_folder(conn: &Connection, path: &str) -> Result<()> {
        conn.execute(
            "INSERT OR IGNORE INTO folders (path) VALUES (?1)",
            params![path],
        )?;
        Ok(())
    }

    pub fn remove_folder(conn: &Connection, path: &str) -> Result<()> {
        conn.execute("DELETE FROM folders WHERE path = ?1", params![path])?;
        let like_query = format!("{}\\%", path);
        conn.execute(
            "DELETE FROM media_items WHERE path LIKE ?1 OR path = ?2",
            params![like_query, path],
        )?;
        Ok(())
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

    pub fn clear_favorites(conn: &Connection) -> Result<()> {
        conn.execute("UPDATE media_items SET starred = 0", [])?;
        Ok(())
    }
}
