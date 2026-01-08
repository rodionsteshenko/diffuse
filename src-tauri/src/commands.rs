use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use notify::{Watcher, RecursiveMode};
use tauri::{AppHandle, Emitter, Manager};
use crate::AppState;
use serde_json::Value;

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
pub fn get_absolute_path(
    path: String,
    app: AppHandle,
) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    let absolute = if path_buf.is_absolute() {
        path_buf
    } else {
        // Use the original working directory from when the command was invoked
        let base_dir = match app.try_state::<Mutex<AppState>>() {
            Some(state) => {
                let state = state.lock().map_err(|e| format!("Failed to lock state: {}", e))?;
                state.original_working_dir.clone()
            }
            None => {
                // Fallback to current directory if state not available
                std::env::current_dir()
                    .map_err(|e| format!("Failed to get current directory: {}", e))?
            }
        };
        
        base_dir.join(&path_buf)
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
                    #[cfg(debug_assertions)]
                    println!("File event received: {:?}", event);
                    // Debounce: only emit after a short delay
                    std::thread::sleep(Duration::from_millis(100));

                    // Check which file changed
                    for path in event.paths {
                        #[cfg(debug_assertions)]
                        let path_str = path.to_string_lossy().to_string();
                        #[cfg(debug_assertions)]
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
                            #[cfg(debug_assertions)]
                            println!("Emitting file-changed for LEFT: {}", left_canonical_str);
                            app.emit("file-changed", left_canonical_str.clone()).ok();
                        } else if canonical_path_str == right_canonical_str {
                            #[cfg(debug_assertions)]
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

#[tauri::command]
pub fn close_app(app: AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    println!("🚪 Closing app window via Escape key");

    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn check_lm_studio_available() -> Result<bool, String> {
    #[cfg(debug_assertions)]
    println!("🔍 Checking LM Studio availability at http://localhost:1234/v1/models");
    
    let client = reqwest::Client::new();
    match client
        .get("http://localhost:1234/v1/models")
        .header("Content-Type", "application/json")
        .timeout(Duration::from_secs(2))
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            #[cfg(debug_assertions)]
            println!("📡 LM Studio response status: {}", status);
            
            if status.is_success() {
                match response.json::<Value>().await {
                    Ok(data) => {
                        #[cfg(debug_assertions)]
                        println!("✅ LM Studio is available! Models: {:?}", data);
                        #[cfg(not(debug_assertions))]
                        let _ = data;
                        Ok(true)
                    }
                    Err(e) => {
                        #[cfg(debug_assertions)]
                        println!("⚠️ LM Studio responded but JSON parse failed: {}", e);
                        #[cfg(not(debug_assertions))]
                        let _ = e;
                        Ok(false)
                    }
                }
            } else {
                #[cfg(debug_assertions)]
                println!("❌ LM Studio returned status: {}", status);
                Ok(false)
            }
        }
        Err(e) => {
            #[cfg(debug_assertions)]
            println!("❌ LM Studio check failed: {}", e);
            #[cfg(not(debug_assertions))]
            let _ = e;
            Ok(false)
        }
    }
}

#[derive(serde::Deserialize)]
pub struct ChatMessage {
    role: String,
    content: String,
}

#[tauri::command]
pub async fn send_lm_studio_message(messages: Vec<ChatMessage>) -> Result<String, String> {
    #[cfg(debug_assertions)]
    println!("💬 Sending message to LM Studio with {} messages", messages.len());
    
    let client = reqwest::Client::new();
    
    // Build the request body
    let request_body = serde_json::json!({
        "model": "local-model",
        "messages": messages.iter().map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content
            })
        }).collect::<Vec<_>>(),
        "temperature": 0.7,
        "stream": false,
    });
    
    #[cfg(debug_assertions)]
    println!("📤 Request body: {}", serde_json::to_string(&request_body).unwrap_or_default());
    
    match client
        .post("http://localhost:1234/v1/chat/completions")
        .header("Content-Type", "application/json")
        .timeout(Duration::from_secs(300))
        .json(&request_body)
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            #[cfg(debug_assertions)]
            println!("📡 LM Studio chat response status: {}", status);
            
            if status.is_success() {
                match response.json::<Value>().await {
                    Ok(data) => {
                        #[cfg(debug_assertions)]
                        println!("✅ LM Studio response received");
                        // Extract the content from the response
                        if let Some(choices) = data.get("choices").and_then(|c| c.as_array()) {
                            if let Some(first_choice) = choices.get(0) {
                                if let Some(message) = first_choice.get("message") {
                                    if let Some(content) = message.get("content").and_then(|c| c.as_str()) {
                                        return Ok(content.to_string());
                                    }
                                }
                            }
                        }
                        Err("No content in response".to_string())
                    }
                    Err(e) => {
                        #[cfg(debug_assertions)]
                        println!("❌ LM Studio JSON parse error: {}", e);
                        Err(format!("Failed to parse response: {}", e))
                    }
                }
            } else {
                let error_text = response.text().await.unwrap_or_default();
                #[cfg(debug_assertions)]
                println!("❌ LM Studio returned error: {} - {}", status, error_text);
                Err(format!("LM Studio API error: {} - {}", status, error_text))
            }
        }
        Err(e) => {
            #[cfg(debug_assertions)]
            println!("❌ LM Studio request failed: {}", e);
            Err(format!("Failed to connect to LM Studio: {}", e))
        }
    }
}
