// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DebloatItem {
    pub id: String,
    pub name: Option<String>,
    pub list: Option<String>,
    pub description: Option<String>,
    pub safety: Option<String>,
    pub removal: Option<String>,
    pub dependencies: Option<Vec<String>>,
    pub needed_by: Option<Vec<String>>,
    pub labels: Option<Vec<String>>,
}

#[derive(Default)]
struct ProcessRegistry(Mutex<HashMap<u32, tokio::process::Child>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolStatus {
    adb: Option<String>,
    scrcpy: Option<String>,
    fastboot: Option<String>,
    adb_path: Option<String>,
    scrcpy_path: Option<String>,
    fastboot_path: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SetupProgress {
    percentage: f64,
    downloaded: u64,
    total: u64,
    stage: String, // "downloading" | "extracting" | "complete" | "error"
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    os: String,
    arch: String,
    recommended_zip_url: String,
    recommended_zip_filename: String,
    platform_tools_dir: String,
    adb_available: bool,
}

static DEBLOAT_DB: OnceLock<Vec<DebloatItem>> = OnceLock::new();

fn push_unique(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}

/// Directory where downloaded or extracted platform tools should reside.
fn get_platform_tools_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    if let Ok(dir) = env::var("ASCEND_BIN_DIR") {
        let p = PathBuf::from(dir);
        if p.exists() {
            return p;
        }
    }
    if let Ok(app_data) = app_handle.path().app_data_dir() {
        return app_data.join("platform-tools");
    }
    if let Ok(local_data) = app_handle.path().app_local_data_dir() {
        return local_data.join("platform-tools");
    }
    let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_root.join("../bin")
}

/// Directories that may contain the bundled or extracted `bin/` and `platform-tools/` folders.
fn asset_roots(app_handle: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    // 1. Extracted platform-tools directory in user app data
    let platform_dir = get_platform_tools_dir(app_handle);
    push_unique(&mut roots, platform_dir.clone());
    if let Some(parent) = platform_dir.parent() {
        push_unique(&mut roots, parent.to_path_buf());
    }

    if let Ok(app_data) = app_handle.path().app_data_dir() {
        push_unique(&mut roots, app_data.join("platform-tools"));
        push_unique(&mut roots, app_data.join("bin"));
        push_unique(&mut roots, app_data);
    }
    if let Ok(local_data) = app_handle.path().app_local_data_dir() {
        push_unique(&mut roots, local_data.join("platform-tools"));
        push_unique(&mut roots, local_data.join("bin"));
        push_unique(&mut roots, local_data);
    }

    // 2. Tauri resource directory (bundled resources)
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        if res_dir.join("_up_").exists() {
            push_unique(&mut roots, res_dir.join("_up_"));
        }
        push_unique(&mut roots, res_dir);
    }

    // 3. Current working directory and parent
    if let Ok(cwd) = env::current_dir() {
        push_unique(&mut roots, cwd.clone());
        if let Some(parent) = cwd.parent() {
            push_unique(&mut roots, parent.to_path_buf());
        }
        if let Some(grandparent) = cwd.parent().and_then(|path| path.parent()) {
            push_unique(&mut roots, grandparent.to_path_buf());
        }
    }

    // 4. Project root during development
    let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    push_unique(&mut roots, manifest_root.clone());
    push_unique(&mut roots, manifest_root.join(".."));

    // 5. Executable directory and ancestors
    if let Ok(exe) = env::current_exe() {
        let mut current = exe.parent().map(PathBuf::from);
        for _ in 0..6 {
            match current {
                Some(dir) => {
                    push_unique(&mut roots, dir.clone());
                    current = dir.parent().map(PathBuf::from);
                }
                None => break,
            }
        }
    }

    roots
}

fn find_asset_in_roots(roots: &[PathBuf], relative: &str) -> Option<PathBuf> {
    for root in roots {
        let candidate = root.join(relative);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn find_asset(app_handle: &tauri::AppHandle, relative: &str) -> Option<PathBuf> {
    find_asset_in_roots(&asset_roots(app_handle), relative)
}

fn resolve_binary_path(app_handle: &tauri::AppHandle, command: &str) -> PathBuf {
    let bin_filename = if cfg!(windows) && !command.ends_with(".exe") {
        format!("{}.exe", command)
    } else {
        command.to_string()
    };

    // Optional escape hatch for portable installs or custom toolchains.
    if let Ok(dir) = env::var("ASCEND_BIN_DIR") {
        let candidate = PathBuf::from(dir).join(&bin_filename);
        if candidate.is_file() {
            return candidate;
        }
    }

    for relative in [
        format!("platform-tools/{bin_filename}"),
        format!("bin/{bin_filename}"),
        format!("_up_/platform-tools/{bin_filename}"),
        format!("_up_/bin/{bin_filename}"),
        format!("resources/platform-tools/{bin_filename}"),
        format!("resources/bin/{bin_filename}"),
        bin_filename.clone(),
    ] {
        if let Some(path) = find_asset(app_handle, &relative) {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o755));
            }
            return path;
        }
    }

    // Last resort: let the OS resolve the tool from PATH.
    PathBuf::from(bin_filename)
}

fn extract_zip_archive(zip_path: &Path, target_dir: &Path) -> Result<usize, String> {
    let file = fs::File::open(zip_path).map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to parse zip archive: {}", e))?;

    fs::create_dir_all(target_dir).map_err(|e| format!("Failed to create destination directory: {}", e))?;

    let mut count = 0;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Zip entry error: {}", e))?;
        let enclosed = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };

        // If the zip contains top-level "platform-tools", strip it so files land directly in target_dir
        let rel_path = if enclosed.starts_with("platform-tools") {
            enclosed.strip_prefix("platform-tools").unwrap_or(&enclosed).to_path_buf()
        } else {
            enclosed
        };

        if rel_path.as_os_str().is_empty() {
            continue;
        }

        let outpath = target_dir.join(rel_path);

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| format!("Failed to create directory {}: {}", outpath.display(), e))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| format!("Failed to create parent directory {}: {}", p.display(), e))?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| format!("Failed to create file {}: {}", outpath.display(), e))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("Failed to write {}: {}", outpath.display(), e))?;
            count += 1;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = file.unix_mode() {
                    let _ = fs::set_permissions(&outpath, fs::Permissions::from_mode(mode | 0o755));
                } else {
                    let fname = outpath.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if matches!(fname, "adb" | "fastboot" | "mke2fs" | "make_f2fs" | "make_f2fs_casefold" | "etc1tool" | "sqlite3" | "hprof-conv") {
                        let _ = fs::set_permissions(&outpath, fs::Permissions::from_mode(0o755));
                    }
                }
            }
        }
    }

    Ok(count)
}

fn prepare_command(executable: &PathBuf, args: &[String]) -> Command {
    let mut cmd = Command::new(executable);
    cmd.args(args).stdin(Stdio::null()).kill_on_drop(true);

    #[cfg(target_os = "windows")]
    {
        // CREATE_NO_WINDOW: don't flash a console window for every adb call.
        cmd.creation_flags(0x08000000);
    }

    cmd
}

#[tauri::command]
async fn execute_command(
    app_handle: tauri::AppHandle,
    command: String,
    args: Vec<String>,
    command_key: String,
    timeout_ms: Option<u64>,
) -> Result<(String, String), String> {
    let executable = resolve_binary_path(&app_handle, &command);
    let mut cmd = prepare_command(&executable, &args);

    let timeout = Duration::from_millis(timeout_ms.unwrap_or(60_000).clamp(1_000, 900_000));

    match tokio::time::timeout(timeout, cmd.output()).await {
        Err(_) => Ok((
            format!(
                "ERROR: Command timed out after {}s: {} {}",
                timeout.as_secs(),
                command,
                args.join(" ")
            ),
            command_key,
        )),
        Ok(Err(e)) => Ok((
            format!(
                "ERROR: Failed to start command '{}': {}",
                executable.display(),
                e
            ),
            command_key,
        )),
        Ok(Ok(output)) => {
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
                Ok((format!("ERROR: {}", err_msg.trim()), command_key))
            }
        }
    }
}

/// Spawns a long-running GUI process (e.g. scrcpy) and tracks it so the UI can stop it.
#[tauri::command]
async fn spawn_process(
    app_handle: tauri::AppHandle,
    state: State<'_, ProcessRegistry>,
    command: String,
    args: Vec<String>,
) -> Result<u32, String> {
    let executable = resolve_binary_path(&app_handle, &command);
    let mut cmd = prepare_command(&executable, &args);
    cmd.stdout(Stdio::null()).stderr(Stdio::null());

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start '{}': {}", executable.display(), e))?;
    let pid = child.id().ok_or("Could not read process id")?;

    if let Ok(mut registry) = state.0.lock() {
        // Drop handles for processes that exited on their own.
        registry.retain(|_, tracked| matches!(tracked.try_wait(), Ok(None)));
        registry.insert(pid, child);
    }

    Ok(pid)
}

#[tauri::command]
async fn process_running(state: State<'_, ProcessRegistry>, pid: u32) -> Result<bool, String> {
    let mut registry = state.0.lock().map_err(|e| e.to_string())?;

    let finished = match registry.get_mut(&pid) {
        Some(child) => match child.try_wait() {
            Ok(Some(_)) => true,
            Ok(None) => return Ok(true),
            Err(_) => true,
        },
        None => return Ok(false),
    };

    if finished {
        registry.remove(&pid);
    }

    Ok(false)
}

#[tauri::command]
async fn stop_process(state: State<'_, ProcessRegistry>, pid: u32) -> Result<bool, String> {
    let tracked = state.0.lock().ok().and_then(|mut reg| reg.remove(&pid));
    let mut found = false;

    if let Some(mut child) = tracked {
        found = true;
        let _ = child.kill().await;
    }

    #[cfg(target_os = "windows")]
    {
        // Make sure helper processes spawned by scrcpy are cleaned up too.
        let status = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if let Ok(status) = status {
            found = found || status.success();
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if let Ok(status) = status {
            found = found || status.success();
        }
    }

    Ok(found)
}

async fn tool_version(
    app_handle: &tauri::AppHandle,
    command: &str,
) -> (Option<String>, Option<String>) {
    let executable = resolve_binary_path(app_handle, command);
    let resolved_path = if executable.is_file() {
        Some(
            executable
                .canonicalize()
                .unwrap_or_else(|_| executable.clone())
                .display()
                .to_string(),
        )
    } else {
        None
    };

    let mut cmd = prepare_command(&executable, &["--version".to_string()]);

    let version = match tokio::time::timeout(Duration::from_secs(5), cmd.output()).await {
        Ok(Ok(output)) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout);
            text.lines()
                .next()
                .map(|line| line.trim().to_string())
                .filter(|line| !line.is_empty())
        }
        _ => None,
    };

    (version, resolved_path)
}

#[tauri::command]
async fn check_tools(app_handle: tauri::AppHandle) -> Result<ToolStatus, String> {
    let ((adb, adb_path), (scrcpy, scrcpy_path), (fastboot, fastboot_path)) = tokio::join!(
        tool_version(&app_handle, "adb"),
        tool_version(&app_handle, "scrcpy"),
        tool_version(&app_handle, "fastboot")
    );

    Ok(ToolStatus {
        adb,
        scrcpy,
        fastboot,
        adb_path,
        scrcpy_path,
        fastboot_path,
    })
}

#[tauri::command]
async fn get_debloat_db(app_handle: tauri::AppHandle) -> Result<Vec<DebloatItem>, String> {
    if let Some(cache) = DEBLOAT_DB.get() {
        return Ok(cache.clone());
    }

    let path = find_asset(&app_handle, "data/debloat_db.json")
        .or_else(|| find_asset(&app_handle, "debloat_db.json"))
        .ok_or_else(|| "debloat_db.json not found".to_string())?;
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let items: Vec<DebloatItem> = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let _ = DEBLOAT_DB.set(items.clone());
    Ok(items)
}

/// Reads a small image (screenshot preview) and returns it as a data URL.
#[tauri::command]
async fn read_file_base64(path: String) -> Result<String, String> {
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > 40 * 1024 * 1024 {
        return Err("File is too large to preview (max 40 MB)".to_string());
    }

    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let ext = PathBuf::from(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => "image/png",
    };

    Ok(format!("data:{};base64,{}", mime, BASE64.encode(bytes)))
}

#[tauri::command]
async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
async fn copy_file(from: String, to: String) -> Result<(), String> {
    fs::copy(from, to).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_system_info(app_handle: tauri::AppHandle) -> Result<SystemInfo, String> {
    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "unknown"
    };

    let arch = env::consts::ARCH.to_string();

    let (url, filename) = match os {
        "linux" => (
            "https://dl.google.com/android/repository/platform-tools-latest-linux.zip",
            "platform-tools-latest-linux.zip",
        ),
        "macos" => (
            "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip",
            "platform-tools-latest-darwin.zip",
        ),
        _ => (
            "https://dl.google.com/android/repository/platform-tools-latest-windows.zip",
            "platform-tools-latest-windows.zip",
        ),
    };

    let target_dir = get_platform_tools_dir(&app_handle);
    let adb_path = resolve_binary_path(&app_handle, "adb");
    let adb_available = adb_path.is_file();

    Ok(SystemInfo {
        os: os.to_string(),
        arch,
        recommended_zip_url: url.to_string(),
        recommended_zip_filename: filename.to_string(),
        platform_tools_dir: target_dir.display().to_string(),
        adb_available,
    })
}

#[tauri::command]
async fn extract_platform_tools_zip(
    app_handle: tauri::AppHandle,
    zip_path: String,
) -> Result<String, String> {
    let zip_file = PathBuf::from(&zip_path);
    if !zip_file.is_file() {
        return Err(format!("File not found: {}", zip_path));
    }

    let target_dir = get_platform_tools_dir(&app_handle);
    let count = extract_zip_archive(&zip_file, &target_dir)?;

    Ok(format!(
        "Successfully extracted {} files to {}",
        count,
        target_dir.display()
    ))
}

#[tauri::command]
async fn download_platform_tools(
    app_handle: tauri::AppHandle,
    url: Option<String>,
) -> Result<String, String> {
    let default_url = if cfg!(target_os = "linux") {
        "https://dl.google.com/android/repository/platform-tools-latest-linux.zip"
    } else if cfg!(target_os = "macos") {
        "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"
    } else {
        "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
    };

    let download_url = url.unwrap_or_else(|| default_url.to_string());

    let _ = app_handle.emit(
        "tools-setup-progress",
        SetupProgress {
            percentage: 0.0,
            downloaded: 0,
            total: 0,
            stage: "downloading".to_string(),
            message: "Connecting to download server…".to_string(),
        },
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Server returned HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let temp_zip_path = env::temp_dir().join(format!("ascend-platform-tools-{}.zip", std::process::id()));

    let mut dest_file = tokio::fs::File::create(&temp_zip_path)
        .await
        .map_err(|e| format!("Failed to create temporary file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Error receiving download data: {}", e))?;
        dest_file
            .write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write to file: {}", e))?;

        downloaded += chunk.len() as u64;

        if last_emit.elapsed() > Duration::from_millis(80) || downloaded == total_size {
            last_emit = std::time::Instant::now();
            let percentage = if total_size > 0 {
                (downloaded as f64 / total_size as f64) * 100.0
            } else {
                0.0
            };

            let _ = app_handle.emit(
                "tools-setup-progress",
                SetupProgress {
                    percentage,
                    downloaded,
                    total: total_size,
                    stage: "downloading".to_string(),
                    message: format!(
                        "Downloading: {:.1} MB / {:.1} MB ({:.0}%)",
                        downloaded as f64 / (1024.0 * 1024.0),
                        total_size as f64 / (1024.0 * 1024.0),
                        percentage
                    ),
                },
            );
        }
    }

    dest_file.flush().await.map_err(|e| format!("Failed to flush file: {}", e))?;
    drop(dest_file);

    let _ = app_handle.emit(
        "tools-setup-progress",
        SetupProgress {
            percentage: 100.0,
            downloaded,
            total: total_size,
            stage: "extracting".to_string(),
            message: "Extracting platform tools…".to_string(),
        },
    );

    let target_dir = get_platform_tools_dir(&app_handle);
    let count = extract_zip_archive(&temp_zip_path, &target_dir)?;

    let _ = tokio::fs::remove_file(&temp_zip_path).await;

    let _ = app_handle.emit(
        "tools-setup-progress",
        SetupProgress {
            percentage: 100.0,
            downloaded,
            total: total_size,
            stage: "complete".to_string(),
            message: format!("Successfully installed {} tools to {}", count, target_dir.display()),
        },
    );

    Ok(target_dir.display().to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(ProcessRegistry::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            execute_command,
            spawn_process,
            process_running,
            stop_process,
            check_tools,
            get_debloat_db,
            read_file_base64,
            write_text_file,
            copy_file,
            get_system_info,
            extract_platform_tools_zip,
            download_platform_tools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn development_project_root_contains_bundled_assets() {
        let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");

        let binary_candidates: &[&str] = if cfg!(windows) {
            &["bin/adb.exe", "bin/adb"]
        } else {
            &["bin/adb", "bin/adb.exe"]
        };

        assert!(
            binary_candidates
                .iter()
                .any(|candidate| find_asset_in_roots(&[project_root.clone()], candidate).is_some()),
            "bundled ADB should be discoverable from the project root"
        );
        assert!(
            find_asset_in_roots(&[project_root], "data/debloat_db.json").is_some(),
            "the debloat database should be discoverable from the project root"
        );
    }

    #[test]
    fn tauri_up_resource_layout_is_discoverable() {
        let root = env::temp_dir().join(format!("ascend-assets-{}", std::process::id()));
        let bundled_root = root.join("_up_");
        let bin_dir = bundled_root.join("bin");
        fs::create_dir_all(&bin_dir).expect("create temporary resource directory");

        let binary_name = if cfg!(windows) { "adb.exe" } else { "adb" };
        fs::write(bin_dir.join(binary_name), b"test").expect("write fake binary");

        let found = find_asset_in_roots(&[bundled_root], &format!("bin/{binary_name}"));
        assert!(found.is_some(), "Tauri's _up_ resource layout should be found");

        let _ = fs::remove_dir_all(&root);
    }
}
