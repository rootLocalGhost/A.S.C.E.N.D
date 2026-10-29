import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export async function executeCommand(
  command: string,
  args: string[],
  commandKey: string,
  timeoutMs?: number
): Promise<[string, string]> {
  return await invoke<[string, string]>("execute_command", {
    command,
    args,
    commandKey,
    timeoutMs,
  });
}

export async function spawnProcess(
  command: string,
  args: string[]
): Promise<number> {
  return await invoke<number>("spawn_process", { command, args });
}

export async function stopProcess(pid: number): Promise<boolean> {
  return await invoke<boolean>("stop_process", { pid });
}

export async function processRunning(pid: number): Promise<boolean> {
  return await invoke<boolean>("process_running", { pid });
}

export interface ToolStatus {
  adb: string | null;
  scrcpy: string | null;
  fastboot: string | null;
  adbPath: string | null;
  scrcpyPath: string | null;
  fastbootPath: string | null;
}

export async function checkTools(): Promise<ToolStatus> {
  return await invoke<ToolStatus>("check_tools");
}

export async function getDebloatDb(): Promise<any[]> {
  return await invoke<any[]>("get_debloat_db");
}

export async function readFileBase64(path: string): Promise<string> {
  return await invoke<string>("read_file_base64", { path });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invoke("write_text_file", { path, contents });
}

export async function copyFile(from: string, to: string): Promise<void> {
  await invoke("copy_file", { from, to });
}

export async function saveFileDialog(
  defaultName: string,
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<string | null> {
  const result = await save({
    defaultPath: defaultName,
    filters,
  });
  return result ?? null;
}

export async function openFileDialog(options?: {
  multiple?: boolean;
  directory?: boolean;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<string | string[] | null> {
  const result = await open({
    multiple: options?.multiple ?? false,
    directory: options?.directory ?? false,
    defaultPath: options?.defaultPath,
    filters: options?.filters,
  });
  return (result as string | string[] | null) ?? null;
}

export interface SystemInfo {
  os: "windows" | "linux" | "macos" | "unknown";
  arch: string;
  recommendedZipUrl: string;
  recommendedZipFilename: string;
  platformToolsDir: string;
  adbAvailable: boolean;
}

export interface SetupProgress {
  percentage: number;
  downloaded: number;
  total: number;
  stage: "downloading" | "extracting" | "complete" | "error";
  message: string;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  return await invoke<SystemInfo>("get_system_info");
}

export async function extractPlatformToolsZip(zipPath: string): Promise<string> {
  return await invoke<string>("extract_platform_tools_zip", { zipPath });
}

export async function downloadPlatformTools(url?: string): Promise<string> {
  return await invoke<string>("download_platform_tools", { url });
}

