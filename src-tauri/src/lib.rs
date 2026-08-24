mod db;
mod scanner;
mod storage;

use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_window_state::{Builder as WindowStateBuilder, StateFlags};

fn reconcile_registered_folders(conn: &mut rusqlite::Connection) -> Result<usize, String> {
    let roots = storage::mounted_volume_roots();
    let folders = db::changes::get_folder_records(conn).map_err(|error| error.to_string())?;
    let mut relocated = 0;

    for folder in folders {
        if storage::folder_is_available(&folder.path) {
            let location = storage::describe_folder(&folder.path, &roots);
            if location.volume_id != folder.volume_id
                || location.relative_path != folder.relative_path
            {
                db::changes::update_folder_location(conn, folder.id, &location)
                    .map_err(|error| error.to_string())?;
            }
            continue;
        }

        if let Some((new_path, location)) = storage::resolve_relocated_folder(
            &folder.path,
            folder.volume_id.as_deref(),
            folder.relative_path.as_deref(),
            &roots,
            storage::folder_is_available,
        ) {
            db::changes::relocate_folder(conn, folder.id, &folder.path, &new_path, &location)
                .map_err(|error| error.to_string())?;
            relocated += 1;
        }
    }

    Ok(relocated)
}

#[tauri::command]
async fn scan_folder(app: AppHandle, path: String, recursive: bool) -> Result<usize, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");

    let path = storage::normalize_path(&path);
    if !Path::new(&path).is_dir() {
        return Err(format!("The media folder is unavailable: {path}"));
    }

    {
        let mut conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
        db::migrate_schema(&conn).map_err(|e| e.to_string())?;
        reconcile_registered_folders(&mut conn)?;
        let roots = storage::mounted_volume_roots();
        let location = storage::describe_folder(&path, &roots);
        db::changes::add_or_relocate_folder(&mut conn, &path, &location)
            .map_err(|e| e.to_string())?;
    }

    // 2. Run scan
    let count = tauri::async_runtime::spawn_blocking(move || {
        scanner::scan_directory(&path, &db_path, recursive)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(count)
}

#[tauri::command]
fn get_folders(app: AppHandle) -> Result<Vec<db::Folder>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let mut conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::migrate_schema(&conn).map_err(|e| e.to_string())?;
    reconcile_registered_folders(&mut conn)?;
    db::changes::get_folders(&conn).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
fn remove_folder(app: AppHandle, path: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let mut conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    let path = storage::normalize_path(&path);
    db::changes::remove_folder(&mut conn, &path).map_err(|e| e.to_string())
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
fn get_app_preferences(app: AppHandle) -> Result<Option<String>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::get_app_preferences(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_app_preferences(app: AppHandle, preferences: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::save_app_preferences(&conn, &preferences).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_media_dimensions(app: AppHandle, id: i64, width: i32, height: i32) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::update_media_dimensions(&conn, id, width, height).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_media_metadata(
    app: AppHandle,
    id: i64,
    width: Option<i32>,
    height: Option<i32>,
    duration_sec: Option<f64>,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("xcroller.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::changes::update_media_metadata(&conn, id, width, height, duration_sec)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn allow_directories(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;
    for path in paths {
        let normalized = storage::normalize_path(&path);
        if !storage::folder_is_available(&normalized) {
            continue;
        }
        let _ = app.fs_scope().allow_directory(&normalized, true);
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
        .plugin(
            WindowStateBuilder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
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
            let mut conn = rusqlite::Connection::open(&db_path).expect("failed to open db");
            conn.execute(db::SCHEMA_MEDIA, [])
                .expect("failed to create media table");
            conn.execute(db::SCHEMA_FOLDERS, [])
                .expect("failed to create folders table");
            conn.execute(db::SCHEMA_FEEDS, [])
                .expect("failed to create feeds table");
            conn.execute(db::SCHEMA_SETTINGS, [])
                .expect("failed to create settings table");
            conn.execute_batch(db::SCHEMA_INDICES)
                .expect("failed to create indices");
            db::migrate_schema(&conn).expect("failed to migrate database schema");
            let _ = reconcile_registered_folders(&mut conn);

            // Allow existing folders in fs scope for asset protocol
            if let Ok(folders) = db::changes::get_folders(&conn) {
                use tauri_plugin_fs::FsExt;
                for folder in folders {
                    if !folder.is_available {
                        continue;
                    }
                    let normalized = storage::normalize_path(&folder.path);
                    let _ = app.fs_scope().allow_directory(&normalized, true);
                    if normalized != folder.path {
                        let _ = app.fs_scope().allow_directory(&folder.path, true);
                    }
                }
            }

            // Backfill missing metadata in background
            let db_path_clone = db_path.clone();
            let app_handle = app.handle().clone();
            let _metadata_task = tauri::async_runtime::spawn_blocking(move || {
                if scanner::backfill_metadata(&db_path_clone).is_ok() {
                    let _ = app_handle.emit("metadata-backfill-complete", ());
                }
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
            update_media_metadata,
            get_feeds,
            save_feed,
            delete_feed,
            get_app_preferences,
            save_app_preferences,
            allow_directories
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
