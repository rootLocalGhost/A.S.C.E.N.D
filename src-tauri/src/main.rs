// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command as StdCommand;
use tauri::Manager;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct DebloatItem {
    pub id: String,
    pub name: Option<String>,
    pub list: Option<String>,
    pub description: Option<String>,
    pub safety: Option<String>,
    pub removal: Option<String>,
}

fn resolve_resource_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        res_dir
    } else {
        env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    }
}

fn resolve_binary_path(app_handle: &tauri::AppHandle, command: &str) -> PathBuf {
    let res_dir = resolve_resource_dir(app_handle);
    let bin_filename = if cfg!(windows) && !command.ends_with(".exe") {
        format!("{}.exe", command)
    } else {
        command.to_string()
    };

    let candidates = [
        res_dir.join("bin").join(&bin_filename),
        res_dir.join(&bin_filename),
        PathBuf::from("bin").join(&bin_filename),
        PathBuf::from(&bin_filename),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return candidate.clone();
        }
    }

    PathBuf::from(bin_filename)
}

#[tauri::command]
async fn execute_command(
    app_handle: tauri::AppHandle,
    command: String,
    args: Vec<String>,
    command_key: String,
) -> Result<(String, String), String> {
    let executable = resolve_binary_path(&app_handle, &command);

    let mut cmd = StdCommand::new(&executable);
    cmd.args(&args);

    #[cfg(target_os = "windows")]
    {
        // CREATE_NO_WINDOW flag for Windows process execution
        cmd.creation_flags(0x08000000);
    }

    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            if output.status.success() {
                Ok((stdout, command_key))
            } else {
                let err_msg = if !stderr.trim().is_empty() {
                    stderr
                } else if !stdout.trim().is_empty() {
                    stdout
                } else {
                    format!("Command failed with exit code: {:?}", output.status.code())
                };
                Ok((format!("ERROR: {}", err_msg), command_key))
            }
        }
        Err(e) => Ok((
            format!("ERROR: Failed to start command '{:?}': {}", executable, e),
            command_key,
        )),
    }
}

#[tauri::command]
async fn get_debloat_db(app_handle: tauri::AppHandle) -> Result<Vec<DebloatItem>, String> {
    let res_dir = resolve_resource_dir(&app_handle);
    let candidates = [
        res_dir.join("data").join("debloat_db.json"),
        res_dir.join("debloat_db.json"),
        PathBuf::from("data").join("debloat_db.json"),
    ];

    let mut db_path = None;
    for candidate in &candidates {
        if candidate.exists() {
            db_path = Some(candidate.clone());
            break;
        }
    }

    let path = db_path.ok_or_else(|| "debloat_db.json not found".to_string())?;
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let items: Vec<DebloatItem> = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    Ok(items)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![execute_command, get_debloat_db])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_debloat_item_deserialization() {
        let json_data = r#"[
            {
                "id": "com.example.app",
                "name": "Example App",
                "list": "OEM",
                "description": "An example app description.",
                "safety": "Recommended",
                "removal": "Recommended"
            }
        ]"#;

        let items: Result<Vec<DebloatItem>, _> = serde_json::from_str(json_data);
        assert!(items.is_ok());
        let items = items.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "com.example.app");
        assert_eq!(items[0].name.as_deref(), Some("Example App"));
    }
}
