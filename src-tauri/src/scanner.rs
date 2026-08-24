use rusqlite::{params, Connection};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

fn video_duration(path: &Path, extension: &str) -> Option<f64> {
    match extension {
        "mp4" | "mov" => {
            let file = fs::File::open(path).ok()?;
            let size = file.metadata().ok()?.len();
            mp4::Mp4Reader::read_header(file, size)
                .ok()
                .map(|reader| reader.duration().as_secs_f64())
                .filter(|duration| duration.is_finite() && *duration > 0.0)
        }
        "webm" | "mkv" => matroska::get_from::<_, matroska::Info>(path)
            .ok()
            .flatten()
            .and_then(|info| info.duration)
            .map(|duration| duration.as_secs_f64())
            .filter(|duration| duration.is_finite() && *duration > 0.0),
        _ => None,
    }
}

pub fn scan_directory(folder_path: &str, db_path: &Path, recursive: bool) -> Result<usize, String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute("PRAGMA synchronous = OFF", []).ok();
    conn.execute("PRAGMA journal_mode = WAL", []).ok();

    let transaction = conn.transaction().map_err(|e| e.to_string())?;
    let mut insert = transaction
        .prepare(
            "INSERT INTO media_items
         (path, file_type, size_bytes, created_at, width, height, duration_sec)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(path) DO UPDATE SET
             file_type = excluded.file_type,
             size_bytes = excluded.size_bytes,
             created_at = excluded.created_at,
             width = COALESCE(excluded.width, media_items.width),
             height = COALESCE(excluded.height, media_items.height),
             duration_sec = COALESCE(excluded.duration_sec, media_items.duration_sec)",
        )
        .map_err(|e| e.to_string())?;

    let mut count = 0;
    let supported_exts = [
        "jpg", "jpeg", "png", "gif", "webp", "mp4", "webm", "mov", "mkv",
    ];

    let walker = WalkDir::new(folder_path);
    let walker = if !recursive {
        walker.max_depth(1)
    } else {
        walker
    };

    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if supported_exts.contains(&ext_str.as_str()) {
                    let metadata = fs::metadata(path).ok();
                    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                    let created = metadata
                        .as_ref()
                        .and_then(|m| m.created().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    let mut width = None;
                    let mut height = None;
                    let mut duration_sec = None;

                    let is_video = ["mp4", "webm", "mov", "mkv"].contains(&ext_str.as_str());
                    let file_type = if is_video {
                        duration_sec = video_duration(path, &ext_str);
                        "video"
                    } else {
                        if let Ok(dims) = image::image_dimensions(path) {
                            width = Some(dims.0 as i32);
                            height = Some(dims.1 as i32);
                        }
                        "image"
                    };

                    insert
                        .execute(params![
                            path.to_string_lossy(),
                            file_type,
                            size as i64,
                            created as i64,
                            width,
                            height,
                            duration_sec
                        ])
                        .map_err(|e| e.to_string())?;

                    count += 1;
                }
            }
        }
    }

    drop(insert);
    transaction.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

pub fn backfill_metadata(db_path: &Path) -> Result<(), String> {
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let items: Vec<(i64, String, String)> = {
        let mut stmt = conn.prepare(
            "SELECT id, path, file_type FROM media_items WHERE (width IS NULL AND file_type = 'image') OR (duration_sec IS NULL AND file_type = 'video')"
        ).map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let mut updates = Vec::new();
    for item in items {
        let (id, path_str, file_type) = item;
        let path = Path::new(&path_str);
        if !path.exists() {
            continue;
        }

        let mut width = None;
        let mut height = None;
        let mut duration_sec = None;

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if file_type == "video" {
            duration_sec = video_duration(path, &ext);
        } else {
            if let Ok(dims) = image::image_dimensions(path) {
                width = Some(dims.0 as i32);
                height = Some(dims.1 as i32);
            }
        }

        if width.is_some() || duration_sec.is_some() {
            updates.push((id, width, height, duration_sec));
        }
    }

    let transaction = conn.transaction().map_err(|e| e.to_string())?;
    for (id, width, height, duration_sec) in updates {
        transaction
            .execute(
                "UPDATE media_items
             SET width = COALESCE(?1, width),
                 height = COALESCE(?2, height),
                 duration_sec = COALESCE(?3, duration_sec)
             WHERE id = ?4",
                params![width, height, duration_sec, id],
            )
            .map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())?;

    Ok(())
}
