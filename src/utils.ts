export const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function parseSize(value: string | undefined | null): number {
  if (!value) return 0;
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) return parseInt(normalized, 10);
  const match = normalized.match(/^([\d.]+)\s*([KMGTP]?)B?$/i);
  if (!match) return 0;
  const units: Record<string, number> = {
    "": 1,
    K: 1024,
    M: 1024 ** 2,
    G: 1024 ** 3,
    T: 1024 ** 4,
    P: 1024 ** 5,
  };
  return Math.round(parseFloat(match[1]) * (units[match[2].toUpperCase()] || 1));
}

export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 200) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

/** Turns a package id into a human friendly label when no database name exists. */
export function friendlyPackageName(pkg: string): string {
  const known: Record<string, string> = {
    youtube: "YouTube",
    chrome: "Chrome",
    gmail: "Gmail",
    maps: "Maps",
    photos: "Photos",
    playstore: "Play Store",
    vending: "Play Store",
    settings: "Settings",
    camera: "Camera",
    gallery: "Gallery",
    launcher: "Launcher",
    calendar: "Calendar",
    contacts: "Contacts",
    messages: "Messages",
    phone: "Phone",
    clock: "Clock",
    calculator: "Calculator",
    files: "Files",
    music: "Music",
    videos: "Videos",
    weather: "Weather",
    facebook: "Facebook",
    instagram: "Instagram",
    whatsapp: "WhatsApp",
    netflix: "Netflix",
    spotify: "Spotify",
    twitter: "X / Twitter",
    tiktok: "TikTok",
    snapchat: "Snapchat",
    telegram: "Telegram",
  };

  const segments = pkg.split(".").filter(Boolean);
  const last = (segments[segments.length - 1] || pkg).toLowerCase();
  if (known[last]) return known[last];

  return last
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isDeviceError(output: string): boolean {
  return /^(error:|error\b|exception|failure|failed|unknown command|no devices|device offline|unauthorized)/i.test(
    output.trim()
  );
}

/** Escapes text so `adb shell input text` receives it literally. */
export function escapeAdbText(text: string): string {
  return text.replace(/ /g, "%s").replace(/'/g, "'\\''");
}

/** Escapes file paths for use inside adb shell single/double quotes. */
export function escapeShellPath(path: string): string {
  return path.replace(/'/g, "'\\''");
}

/** Maps battery status code from dumpsys battery to human readable text. */
export function formatBatteryStatus(statusNum?: string): string {
  const statusMap: Record<string, string> = {
    "2": "Charging",
    "3": "Discharging",
    "4": "Not Charging",
    "5": "Full",
  };
  return (statusNum && statusMap[statusNum]) || "Unknown";
}

/** Determines whether ADB command args target a specific device. */
export function isAdbDeviceCommand(args: string[]): boolean {
  if (!args || args.length === 0) return false;
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

/** Quotes an arbitrary argument for a remote (device) shell command. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatUptime(raw: string): string {
  const match = raw.match(/up\s+([^,]+(?:,\s*\d+:\d+)?)/);
  return match ? match[1].trim() : raw.trim() || "—";
}

export interface ParsedDevice {
  serial: string;
  state: string;
  model?: string;
  product?: string;
}

export function parseDevices(output: string): ParsedDevice[] {
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...rest] = line.split(/\s+/);
      const attrs: Record<string, string> = {};
      rest.forEach((part) => {
        const idx = part.indexOf(":");
        if (idx > 0) attrs[part.slice(0, idx)] = part.slice(idx + 1);
      });
      return {
        serial,
        state: state || "unknown",
        model: attrs.model?.replace(/_/g, " "),
        product: attrs.product,
      };
    })
    .filter((device) => !/^List of devices/i.test(device.serial));
}

export function deviceStateLabel(state: string): string {
  switch (state) {
    case "device":
      return "Online";
    case "unauthorized":
      return "Unauthorized";
    case "offline":
      return "Offline";
    case "recovery":
      return "Recovery";
    case "bootloader":
      return "Bootloader";
    default:
      return state;
  }
}

export function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "/";
}

export function dirname(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return "/" + parts.join("/");
}

export function joinPath(...parts: string[]): string {
  const joined = parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return "/" + joined;
}

export const textExtensions = new Set([
  "txt",
  "log",
  "json",
  "xml",
  "md",
  "ini",
  "conf",
  "cfg",
  "csv",
  "html",
  "css",
  "js",
  "ts",
  "sh",
  "prop",
]);

export function fileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

export function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
