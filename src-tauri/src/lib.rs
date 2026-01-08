mod commands;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct CliArgs {
    pub left_path: Option<String>,
    pub right_path: Option<String>,
}

pub struct AppState {
    pub original_working_dir: PathBuf,
}

#[tauri::command]
fn get_cli_args(state: tauri::State<Mutex<CliArgs>>) -> Result<(Option<String>, Option<String>), String> {
    let args = state.lock().map_err(|e| format!("Failed to lock state: {}", e))?;
    Ok((args.left_path.clone(), args.right_path.clone()))
}

#[tauri::command]
fn get_original_working_dir(state: tauri::State<Mutex<AppState>>) -> Result<String, String> {
    let app_state = state.lock().map_err(|e| format!("Failed to lock state: {}", e))?;
    app_state.original_working_dir
        .to_str()
        .ok_or_else(|| "Path contains invalid UTF-8".to_string())
        .map(|s| s.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Store the original working directory before Tauri might change it
    let original_working_dir = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    // Parse command-line arguments directly
    let args: Vec<String> = std::env::args().collect();

    // args[0] is the program name, args[1] and args[2] are the file paths
    let left_path = if args.len() > 1 {
        Some(args[1].clone())
    } else {
        None
    };

    let right_path = if args.len() > 2 {
        Some(args[2].clone())
    } else {
        None
    };

    let original_working_dir_clone = original_working_dir.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            // Store CLI args in app state
            app.manage(Mutex::new(CliArgs {
                left_path: left_path.clone(),
                right_path: right_path.clone(),
            }));

            // Store original working directory
            app.manage(Mutex::new(AppState {
                original_working_dir: original_working_dir_clone.clone(),
            }));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::get_absolute_path,
            commands::watch_files,
            commands::close_app,
            commands::check_lm_studio_available,
            commands::send_lm_studio_message,
            get_cli_args,
            get_original_working_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
