import { createStore } from "solid-js/store";
import { executeCommand, getDebloatDb, checkTools, type ToolStatus } from "./tauriApi";
import { loadPreferences, savePreferences, type Preferences } from "./preferences";
import { parseDevices, type ParsedDevice } from "./utils";

export interface LogEntry {
  time: string;
  type: "INFO" | "ERROR" | "SUCCESS" | "CMD";
  message: string;
}

export interface Toast {
  id: number;
  message: string;
  type: "info" | "success" | "error" | "warning";
}

const storedPreferences = loadPreferences();

export const [state, setState] = createStore({
  currentDevice: null as string | null,
  currentDeviceList: [] as string[],
  deviceInfo: {} as Record<string, ParsedDevice>,
  isBusy: false,
  busyLabel: "",
  activeTab: "dashboard-tab",
  isSidebarCollapsed: storedPreferences.sidebarCollapsed,
  debloatDB: {} as Record<string, any>,
  debloatDBLoaded: false,
  currentAppFilter: "all" as "all" | "user" | "system",
  currentDevicePath: "/sdcard/",
  fileViewMode: "list" as "list" | "icon",
  devToggles: {
    layout: false,
    overdraw: false,
    pointer: false,
  },
  logs: [] as LogEntry[],
  toasts: [] as Toast[],
  preferences: storedPreferences as Preferences,
  tools: {
    adb: null,
    scrcpy: null,
    fastboot: null,
    adbPath: null,
    scrcpyPath: null,
    fastbootPath: null,
  } as ToolStatus,
  toolsLoaded: false,
  logDrawerOpen: storedPreferences.logDrawerOpen,
  paletteOpen: false,
  connectOpen: false,
  connectTab: "usb" as "usb" | "wireless",
  toolsSetupOpen: false,
  scrcpyPid: null as number | null,
  debloaterSelection: [] as string[],
  screenshotPreview: null as { path: string; name: string; dataUrl: string } | null,
});

const MAX_LOGS = 800;

export function log(
  message: string,
  type: "INFO" | "ERROR" | "SUCCESS" | "CMD" = "INFO"
) {
  const entry: LogEntry = {
    time: new Date().toLocaleTimeString(),
    type,
    message,
  };
  setState("logs", (prev) => {
    const next = [...prev, entry];
    return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
  });
}

let toastCounter = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function toast(
  message: string,
  type: Toast["type"] = "info",
  duration = 4200
) {
  if (!state.preferences.toasts && type === "success") return;
  const id = ++toastCounter;
  setState("toasts", (prev) => [...prev.slice(-3), { id, message, type }]);

  const timer = setTimeout(() => dismissToast(id), duration);
  toastTimers.set(id, timer);
  return id;
}

export function dismissToast(id: number) {
  const timer = toastTimers.get(id);
  if (timer) clearTimeout(timer);
  toastTimers.delete(id);
  setState("toasts", (prev) => prev.filter((entry) => entry.id !== id));
}

export function setActiveTab(tab: string) {
  setState("activeTab", tab);
}

export function openConnect(tab: "usb" | "wireless" = "usb") {
  setState("connectTab", tab);
  setState("connectOpen", true);
}

export function openToolsSetup() {
  setState("toolsSetupOpen", true);
}

export function closeToolsSetup() {
  setState("toolsSetupOpen", false);
}

export function updatePreference<K extends keyof Preferences>(
  key: K,
  value: Preferences[K]
) {
  setState("preferences", key, value as any);
  savePreferences(state.preferences);

  if (key === "sidebarCollapsed") {
    setState("isSidebarCollapsed", value as boolean);
  }
  if (key === "logDrawerOpen") {
    setState("logDrawerOpen", value as boolean);
  }
}

export function toggleSidebar() {
  updatePreference("sidebarCollapsed", !state.isSidebarCollapsed);
}

export interface RunOptions {
  background?: boolean;
  quiet?: boolean;
  key?: string;
  timeout?: number;
  logOutput?: boolean;
  label?: string;
}

let busyCount = 0;

function pushBusy(label?: string) {
  busyCount += 1;
  setState("isBusy", true);
  if (label) setState("busyLabel", label);
}

function popBusy() {
  busyCount = Math.max(0, busyCount - 1);
  if (busyCount === 0) setState("isBusy", false);
}

const DEVICE_ARG_HEADS = new Set([
  "shell",
  "pull",
  "push",
  "reboot",
  "screencap",
  "logcat",
  "install",
  "uninstall",
  "forward",
  "reverse",
  "emu",
  "wait-for-device",
  "tcpip",
  "root",
  "unroot",
  "backup",
  "restore",
  "sideload",
  "get-state",
  "get-serialno",
]);

function needsDevice(command: string, args: string[]): boolean {
  if (command === "scrcpy") return true;
  if (command !== "adb") return false;
  return args.some((arg) => DEVICE_ARG_HEADS.has(arg));
}

function defaultTimeout(command: string, args: string[]): number {
  if (["pull", "push", "install", "uninstall"].some((arg) => args.includes(arg))) {
    return 300_000;
  }
  if (args.includes("screencap") || args.includes("logcat")) return 120_000;
  return command === "adb" ? 60_000 : 120_000;
}

export async function runCommand(
  command: string,
  args: string[] = [],
  options: RunOptions | boolean = {},
  legacyKey?: string | null
): Promise<[string, string] | null> {
  const opts: RunOptions =
    typeof options === "boolean"
      ? { background: options, key: legacyKey || undefined }
      : options;

  const deviceRequired = needsDevice(command, args);

  if (deviceRequired && !state.currentDevice) {
    if (!opts.quiet) {
      log("No device selected. Command aborted.", "ERROR");
      toast("Connect and select a device first.", "warning");
    }
    return null;
  }

  let finalArgs = args;
  if (deviceRequired && state.currentDevice) {
    if (command === "scrcpy") {
      finalArgs = ["-s", state.currentDevice, ...args];
    } else if (command === "adb") {
      finalArgs = ["-s", state.currentDevice, ...args];
    }
  }

  const preview = `${command} ${finalArgs.join(" ")}`;
  if (!opts.quiet) {
    log(preview.length > 220 ? `${preview.slice(0, 220)}…` : preview, "CMD");
  }

  if (!opts.background) pushBusy(opts.label);

  try {
    const res = await executeCommand(
      command,
      finalArgs,
      opts.key || "",
      opts.timeout ?? defaultTimeout(command, finalArgs)
    );
    const [output] = res;
    const trimmed = (output || "").trim();

    if (trimmed.startsWith("ERROR:")) {
      const message = trimmed.replace(/^ERROR:\s*/i, "").trim() || "Command failed.";
      if (!opts.quiet) {
        log(message, "ERROR");
        toast(message.length > 160 ? `${message.slice(0, 160)}…` : message, "error");
      }
      return null;
    }

    if (opts.logOutput && trimmed) {
      log(trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}…` : trimmed, "INFO");
    }

    return res;
  } catch (err: any) {
    const message = err?.message || String(err);
    if (!opts.quiet) {
      log(`Execution error: ${message}`, "ERROR");
      toast("Command could not be started. Check the bundled tools.", "error");
    }
    return null;
  } finally {
    if (!opts.background) popBusy();
  }
}

let monitorTimer: ReturnType<typeof setInterval> | undefined;
let monitorBusy = false;
let knownDevices = new Set<string>();

export async function refreshDevices(options: { quiet?: boolean } = {}): Promise<ParsedDevice[]> {
  const res = await runCommand("adb", ["devices", "-l"], {
    background: true,
    quiet: options.quiet ?? true,
    key: "adb-devices",
    timeout: 12_000,
  });

  if (!res) return [];

  const devices = parseDevices(res[0]);
  const serials = devices.filter((d) => d.state !== "offline").map((d) => d.serial);

  const info: Record<string, ParsedDevice> = {};
  devices.forEach((device) => {
    info[device.serial] = device;
  });

  setState("currentDeviceList", serials);
  setState("deviceInfo", info);

  const current = state.currentDevice;
  if (serials.length === 0) {
    if (current) {
      log("Device disconnected.", "ERROR");
      toast("Device disconnected", "warning");
    }
    setState("currentDevice", null);
  } else if (!current || !serials.includes(current)) {
    const online = devices.find((d) => d.state === "device") || devices[0];
    setState("currentDevice", online.serial);
    if (online.state !== "device") {
      log(`Device ${online.serial} is ${online.state}.`, "ERROR");
      toast(
        online.state === "unauthorized"
          ? "Device unauthorized — accept the USB debugging prompt."
          : `Device is ${online.state}.`,
        "warning",
        6000
      );
    } else if (knownDevices.size > 0 && !knownDevices.has(online.serial)) {
      toast("Device connected", "success");
    }
  }

  const newSerials = new Set(serials);
  if (knownDevices.size > 0) {
    knownDevices.forEach((serial) => {
      if (!newSerials.has(serial)) {
        log(`Device ${serial} disconnected.`, "ERROR");
      }
    });
  }
  knownDevices = newSerials;

  return devices;
}

export function selectDevice(serial: string) {
  setState("currentDevice", serial);
  const device = state.deviceInfo[serial];
  if (device && device.state !== "device") {
    toast(`Device is ${device.state}.`, "warning");
  }
}

export function startDeviceMonitor() {
  if (monitorTimer) return;

  const tick = async () => {
    if (monitorBusy || !state.preferences.deviceMonitor) return;
    monitorBusy = true;
    try {
      await refreshDevices({ quiet: true });
    } finally {
      monitorBusy = false;
    }
  };

  void tick();
  monitorTimer = setInterval(tick, 5000);
}

export function stopDeviceMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = undefined;
}

let dbPromise: Promise<void> | null = null;

export function ensureDebloatDb(): Promise<void> {
  if (state.debloatDBLoaded) return Promise.resolve();
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    try {
      const rawDb = await getDebloatDb();
      const formattedDB: Record<string, any> = {};
      if (Array.isArray(rawDb)) {
        for (const item of rawDb) {
          if (item && item.id) {
            formattedDB[item.id] = {
              name: item.name || undefined,
              description: item.description || "No description available.",
              safety: item.safety || item.removal || "unknown",
              list: item.list || "Unknown",
              removal: item.removal || item.safety || "unknown",
              dependencies: item.needed_by || item.dependencies || [],
              neededBy: item.neededBy || item.needed_by || [],
              labels: item.labels || [],
            };
          }
        }
      }
      setState("debloatDB", formattedDB);
      setState("debloatDBLoaded", true);
      log(`Loaded debloat database (${Object.keys(formattedDB).length} packages).`, "INFO");
    } catch (err: any) {
      log(`Failed to load debloat database: ${err?.message || err}`, "ERROR");
    }
  })();

  return dbPromise;
}

let toolsPromise: Promise<ToolStatus> | null = null;

export function loadTools(force = false): Promise<ToolStatus> {
  if (state.toolsLoaded && !force) return Promise.resolve(state.tools);
  if (toolsPromise && !force) return toolsPromise;

  toolsPromise = checkTools()
    .then((tools) => {
      setState("tools", tools);
      setState("toolsLoaded", true);
      const missing = [
        ["ADB", tools.adb],
        ["Scrcpy", tools.scrcpy],
        ["Fastboot", tools.fastboot],
      ]
        .filter(([, version]) => !version)
        .map(([name]) => name);
      if (missing.length) {
        log(
          `Bundled tools not detected: ${missing.join(", ")}. Check the bin folder.`,
          "ERROR"
        );
      }
      return tools;
    })
    .catch((error: any) => {
      log(`Could not check the bundled toolchain: ${error?.message || error}`, "ERROR");
      setState("toolsLoaded", true);
      return state.tools;
    });

  return toolsPromise;
}
