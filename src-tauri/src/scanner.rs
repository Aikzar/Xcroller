use rusqlite::{params, Connection};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

pub fn scan_directory(folder_path: &str, db_path: &Path, recursive: bool) -> Result<usize, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute("PRAGMA synchronous = OFF", []).ok();
    conn.execute("PRAGMA journal_mode = WAL", []).ok();

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
                        if ext_str == "mp4" || ext_str == "mov" {
                            if let Ok(file) = fs::File::open(path) {
                                let size = file.metadata().map(|m| m.len()).unwrap_or(0);
                                if let Ok(reader) = mp4::Mp4Reader::read_header(file, size) {
                                    duration_sec = Some(reader.duration().as_secs_f64());
                                }
                            }
                        }
                        "video"
                    } else {
                        if let Ok(dims) = image::image_dimensions(path) {
                            width = Some(dims.0 as i32);
                            height = Some(dims.1 as i32);
                        }
                        "image"
                    };

                    conn.execute(
                        "INSERT OR IGNORE INTO media_items (path, file_type, size_bytes, created_at, width, height, duration_sec) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![
                            path.to_string_lossy(),
                            file_type,
                            size as i64,
                            created as i64,
                            width,
                            height,
                            duration_sec
                        ],
                    ).ok();

                    count += 1;
                }
            }
        }
    }

    Ok(count)
}

pub fn backfill_metadata(db_path: &Path) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, path, file_type FROM media_items WHERE (width IS NULL AND file_type = 'image') OR (duration_sec IS NULL AND file_type = 'video')"
    ).map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for item in items.filter_map(Result::ok) {
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
            if ext == "mp4" || ext == "mov" {
                if let Ok(file) = fs::File::open(path) {
                    let size = file.metadata().map(|m| m.len()).unwrap_or(0);
                    if let Ok(reader) = mp4::Mp4Reader::read_header(file, size) {
                        duration_sec = Some(reader.duration().as_secs_f64());
                    }
                }
            }
        } else {
            if let Ok(dims) = image::image_dimensions(path) {
                width = Some(dims.0 as i32);
                height = Some(dims.1 as i32);
            }
        }

        if width.is_some() || duration_sec.is_some() {
            conn.execute(
                "UPDATE media_items SET width = ?1, height = ?2, duration_sec = ?3 WHERE id = ?4",
                params![width, height, duration_sec, id],
            )
            .ok();
        }
    }

    Ok(())
}
