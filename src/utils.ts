/**
 * Safely joins path segments for Android remote file system.
 */
export function joinPath(...args: string[]): string {
  const isAbsolute = args.length > 0 && args[0].startsWith("/");
  const cleaned = args
    .map((arg) => arg.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);

  const joined = cleaned.join("/");
  return isAbsolute ? `/${joined}` : joined || "/";
}

/**
 * Escapes file paths for use inside adb shell single/double quotes.
 */
export function escapeShellPath(path: string): string {
  // Replace single quotes with '\''
  return path.replace(/'/g, "'\\''");
}

/**
 * Maps battery status code from dumpsys battery to human readable text.
 */
export function formatBatteryStatus(statusNum?: string): string {
  const statusMap: Record<string, string> = {
    "2": "Charging",
    "3": "Discharging",
    "4": "Not Charging",
    "5": "Full",
  };
  return (statusNum && statusMap[statusNum]) || "Unknown";
}

/**
 * Determines whether ADB command args target a specific device.
 */
export function isAdbDeviceCommand(args: string[]): boolean {
  if (!args || args.length === 0) return false;

  // Subcommands that require target device selection (-s <device>)
  const deviceSubcommands = [
    "shell",
    "pull",
    "push",
    "tcpip",
    "reboot",
    "screencap",
    "logcat",
    "install",
    "uninstall",
  ];

  return args.some((arg) => deviceSubcommands.includes(arg));
}
