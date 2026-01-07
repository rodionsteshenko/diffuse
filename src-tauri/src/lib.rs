mod commands;

use std::sync::Mutex;
use tauri::Manager;

pub struct CliArgs {
    pub left_path: Option<String>,
    pub right_path: Option<String>,
}

#[tauri::command]
fn get_cli_args(state: tauri::State<Mutex<CliArgs>>) -> Result<(Option<String>, Option<String>), String> {
    let args = state.lock().map_err(|e| format!("Failed to lock state: {}", e))?;
    Ok((args.left_path.clone(), args.right_path.clone()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            // Store CLI args in app state
            app.manage(Mutex::new(CliArgs {
                left_path: left_path.clone(),
                right_path: right_path.clone(),
            }));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::get_absolute_path,
            commands::watch_files,
            get_cli_args
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
