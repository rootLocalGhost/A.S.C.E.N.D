import { createStore } from "solid-js/store";
import { executeCommand } from "./tauriApi";
import { isAdbDeviceCommand } from "./utils";

export interface LogEntry {
  time: string;
  type: "INFO" | "ERROR" | "SUCCESS" | "CMD";
  message: string;
}

export const [state, setState] = createStore({
  currentDevice: null as string | null,
  currentDeviceList: [] as string[],
  isBusy: false,
  activeTab: "dashboard-tab",
  isSidebarCollapsed: false,
  debloatDB: {} as Record<string, any>,
  currentAppFilter: "all" as "all" | "user" | "system",
  currentDevicePath: "/sdcard/",
  fileViewMode: "list" as "list" | "icon",
  devToggles: {
    layout: false,
    overdraw: false,
    pointer: false,
  },
  logs: [] as LogEntry[],
});

export function log(message: string, type: "INFO" | "ERROR" | "SUCCESS" | "CMD" = "INFO") {
  const entry: LogEntry = {
    time: new Date().toLocaleTimeString(),
    type,
    message,
  };
  setState("logs", (prev) => [...prev, entry]);
}

export async function runCommand(
  command: string,
  args: string[] = [],
  isBackgroundTask = false,
  commandKey: string | null = null
): Promise<[string, string] | null> {
  const isDeviceCommand = command === "adb" && isAdbDeviceCommand(args);

  if (isDeviceCommand && !state.currentDevice) {
    log("No device selected. Command aborted.", "ERROR");
    return null;
  }

  const finalArgs = isDeviceCommand
    ? ["-s", state.currentDevice!, ...args]
    : args;

  if (!isBackgroundTask) {
    setState("isBusy", true);
  }

  try {
    const res = await executeCommand(command, finalArgs, commandKey || "");
    const [output, key] = res;
    const msg = output.replace(/^ERROR:/i, "").trim();

    if (output.startsWith("ERROR:")) {
      log(msg, "ERROR");
    } else if (msg && !isBackgroundTask) {
      log(msg, "INFO");
    }

    return res;
  } catch (err: any) {
    log(`Execution error: ${err.message || err}`, "ERROR");
    return null;
  } finally {
    if (!isBackgroundTask) {
      setState("isBusy", false);
    }
  }
}
