import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export async function executeCommand(
  command: string,
  args: string[],
  commandKey: string
): Promise<[string, string]> {
  return await invoke<[string, string]>("execute_command", {
    command,
    args,
    commandKey,
  });
}

export async function getDebloatDb(): Promise<any[]> {
  return await invoke<any[]>("get_debloat_db");
}

export async function saveFileDialog(defaultName: string): Promise<string | null> {
  const result = await save({
    defaultPath: defaultName,
  });
  return result;
}

export async function openFileDialog(): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: false,
  });
  if (Array.isArray(result)) return result[0] || null;
  return result;
}
