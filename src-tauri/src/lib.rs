mod db;
mod scanner;

use tauri::{AppHandle, Manager};

fn normalize_path(path: &str) -> String {
    // Basic normalization: replace backslashes and trim whitespace
    let mut normalized = path.replace('\\', "/").trim().to_string();

    // Strip UNC prefix which can break webview protocols
    if normalized.starts_with("//?/") {
        normalized = normalized[4..].to_string();
    }

    // Ensure Windows drive letter is consistent (e.g., C:/ instead of c:/)
    // convertFileSrc often returns capitalized drive letters on Windows
    if normalized.len() > 2 && normalized.chars().nth(1) == Some(':') {
        let drive = normalized
            .chars()
            .next()
            .unwrap()
            .to_uppercase()
            .next()
            .unwrap();
        normalized = format!("{}:{}", drive, &normalized[2..]);
    }

    normalized
}

#[tauri::command]
async fn scan_folder(app: AppHandle, path: String, recursive: bool) -> Result<usize, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    
    // Normalize path first
    let path = normalize_path(&path);

    // 1. Add to folders table
    {
        let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
        db::changes::add_folder(&conn, &path).map_err(|e| e.to_string())?;
    }

    // 2. Run scan
    let count =
        tauri::async_runtime::spawn_blocking(move || scanner::scan_directory(&path, &db_path, recursive))
            .await
            .map_err(|e| e.to_string())??;

    Ok(count)
}

#[tauri::command]
fn get_folders(app: AppHandle) -> Result<Vec<db::Folder>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::get_folders(&conn).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn remove_folder(app: AppHandle, path: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let path = normalize_path(&path);
    db::changes::remove_folder(&conn, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_media(
    app: AppHandle,
    limit: i64,
    offset: i64,
    filters: db::FilterOptions,
) -> Result<Vec<db::MediaItem>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::get_media(&conn, limit, offset, filters).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_star(app: AppHandle, id: i64) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::toggle_star(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_favorites(app: AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::clear_favorites(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_feeds(app: AppHandle) -> Result<Vec<db::Feed>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::get_feeds(&conn).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn save_feed(app: AppHandle, feed: db::Feed) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::save_feed(&conn, feed).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn delete_feed(app: AppHandle, id: i64) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::delete_feed(&conn, id).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn update_media_dimensions(app: AppHandle, id: i64, width: i32, height: i32) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::update_media_dimensions(&conn, id, width, height).map_err(|e| e.to_string())
}

#[tauri::command]
fn allow_directories(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;
    for path in paths {
        let normalized = normalize_path(&path);
        app.fs_scope()
            .allow_directory(&normalized, true)
            .map_err(|e| e.to_string())?;
        // Also allow the original just in case
        if normalized != path {
            let _ = app.fs_scope().allow_directory(&path, true);
        }
    }
    Ok(())
}

#[tauri::command]
async fn export_starred(app: AppHandle, target_path: String) -> Result<usize, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");

    let items: Vec<String> = {
        let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
        db::changes::get_starred_items(&conn).map_err(|e| e.to_string())?
    };

    let count = items.len();
    if count == 0 {
        return Ok(0);
    }

    // Copy files in parallel
    // Need to use blocking task for IO
    tauri::async_runtime::spawn_blocking(move || {
        use rayon::prelude::*;
        use std::fs;
        use std::path::Path;

        items.par_iter().for_each(|src_path_str| {
            let src_path = Path::new(src_path_str);
            if let Some(file_name) = src_path.file_name() {
                let dest_path = Path::new(&target_path).join(file_name);
                if let Err(e) = fs::copy(src_path, dest_path) {
                    eprintln!("Failed to copy {:?}: {}", src_path, e);
                }
            }
        });
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(count)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
            let db_path = app_dir.join("xcroller.db");

            // Init DB
            let conn = rusqlite::Connection::open(&db_path).expect("failed to open db");
            conn.execute(db::SCHEMA_MEDIA, [])
                .expect("failed to create media table");
            conn.execute(db::SCHEMA_FOLDERS, [])
                .expect("failed to create folders table");
            conn.execute(db::SCHEMA_FEEDS, [])
                .expect("failed to create feeds table");
            conn.execute(db::SCHEMA_INDICES, [])
                .expect("failed to create indices");

            // Allow existing folders in fs scope for asset protocol
            if let Ok(folders) = db::changes::get_folders(&conn) {
                use tauri_plugin_fs::FsExt;
                for folder in folders {
                    let normalized = normalize_path(&folder.path);
                    let _ = app.fs_scope().allow_directory(&normalized, true);
                    if normalized != folder.path {
                        let _ = app.fs_scope().allow_directory(&folder.path, true);
                    }
                }
            }

            // Backfill missing metadata in background
            let db_path_clone = db_path.clone();
            tauri::async_runtime::spawn(async move {
                let _ = scanner::backfill_metadata(&db_path_clone);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            get_folders,
            remove_folder,
            get_media,
            toggle_star,
            clear_favorites,
            export_starred,
            update_media_dimensions,
            get_feeds,
            save_feed,
            delete_feed,
            allow_directories
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
