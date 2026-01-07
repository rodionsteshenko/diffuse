use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use notify::{Watcher, RecursiveMode};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

#[tauri::command]
pub fn get_absolute_path(path: String) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    let absolute = if path_buf.is_absolute() {
        path_buf
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?
            .join(&path_buf)
    };

    // Try to canonicalize, but if the file doesn't exist, just return the absolute path
    let resolved = match absolute.canonicalize() {
        Ok(canonical) => canonical,
        Err(_) => absolute, // File might not exist yet, return the constructed absolute path
    };

    resolved
        .to_str()
        .ok_or_else(|| "Path contains invalid UTF-8".to_string())
        .map(|s| s.to_string())
}

#[tauri::command]
pub fn watch_files(
    app: AppHandle,
    left_path: String,
    right_path: String,
) -> Result<(), String> {
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();

        let mut watcher = notify::recommended_watcher(tx)
            .map_err(|e| format!("Failed to create watcher: {}", e))
            .unwrap();

        // Watch both files
        watcher
            .watch(std::path::Path::new(&left_path), RecursiveMode::NonRecursive)
            .ok();
        watcher
            .watch(std::path::Path::new(&right_path), RecursiveMode::NonRecursive)
            .ok();

        // Keep watcher alive and emit events
        loop {
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Ok(event)) => {
                    println!("File event received: {:?}", event);
                    // Debounce: only emit after a short delay
                    std::thread::sleep(Duration::from_millis(100));

                    // Check which file changed
                    for path in event.paths {
                        let path_str = path.to_string_lossy().to_string();
                        println!("Event path: {}, left: {}, right: {}", path_str, left_path, right_path);

                        // Try to canonicalize for comparison
                        let canonical_path = path.canonicalize().unwrap_or(path.clone());
                        let canonical_path_str = canonical_path.to_string_lossy().to_string();

                        let left_canonical = std::path::Path::new(&left_path).canonicalize()
                            .unwrap_or_else(|_| std::path::PathBuf::from(&left_path));
                        let right_canonical = std::path::Path::new(&right_path).canonicalize()
                            .unwrap_or_else(|_| std::path::PathBuf::from(&right_path));

                        let left_canonical_str = left_canonical.to_string_lossy().to_string();
                        let right_canonical_str = right_canonical.to_string_lossy().to_string();

                        if canonical_path_str == left_canonical_str {
                            println!("Emitting file-changed for LEFT: {}", left_canonical_str);
                            app.emit("file-changed", left_canonical_str.clone()).ok();
                        } else if canonical_path_str == right_canonical_str {
                            println!("Emitting file-changed for RIGHT: {}", right_canonical_str);
                            app.emit("file-changed", right_canonical_str.clone()).ok();
                        }
                    }
                }
                Err(_) => continue,
                _ => {}
            }
        }
    });

    Ok(())
}
