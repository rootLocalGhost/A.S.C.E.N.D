import { join, tempDir } from "@tauri-apps/api/path";
import { copyFile, executeCommand, readFileBase64, saveFileDialog } from "./tauriApi";
import { log, runCommand, setState, state, toast } from "./stateStore";

export interface AdbResult {
  ok: boolean;
  message: string;
}

/**
 * Runs an ADB command that is part of the connection flow.
 *
 * `adb connect` and `adb pair` can exit successfully while still reporting a
 * failure in their output, so the text is inspected instead of only the exit
 * status.
 */
async function runAdbDirect(
  args: string[],
  label: string,
  timeout = 60_000
): Promise<AdbResult> {
  log(`adb ${args.join(" ")}`, "CMD");

  try {
    const [output] = await executeCommand("adb", args, "connection", timeout);
    const text = (output || "").trim();

    if (text.startsWith("ERROR:")) {
      const message = text.replace(/^ERROR:\s*/i, "").trim() || `${label} failed.`;
      log(message, "ERROR");
      return { ok: false, message };
    }

    if (text) log(text, "INFO");

    const failed =
      /(?:^|\n)\s*(?:error|failed|cannot|unable|unknown|no devices|device offline|unauthorized)\b/i.test(
        text
      ) || /failed to (?:connect|pair|authenticate)/i.test(text);

    return {
      ok: !failed,
      message: text || `${label} completed.`,
    };
  } catch (error: any) {
    const message = error?.message || String(error);
    log(`${label} failed: ${message}`, "ERROR");
    return { ok: false, message };
  }
}

/** Pairs with Android 11+ wireless debugging using its temporary pairing port. */
export async function pairWirelessDevice(
  ip: string,
  port: string,
  code: string
): Promise<AdbResult> {
  const host = ip.trim().split(":")[0];
  return runAdbDirect(["pair", `${host}:${port.trim()}`, code.trim()], "Pairing");
}

/** Connects to an already-enabled wireless debugging endpoint. */
export async function connectWirelessDevice(ip: string, port: string): Promise<AdbResult> {
  const host = ip.trim();
  const address = host.includes(":") ? host : `${host}:${port.trim() || "5555"}`;
  return runAdbDirect(["connect", address], "Connect");
}

export async function disconnectWirelessDevice(address: string): Promise<AdbResult> {
  return runAdbDirect(["disconnect", address.trim()], "Disconnect", 20_000);
}

/** Reads the device's Wi-Fi IPv4 address over the current USB connection. */
export async function detectDeviceWifiIp(): Promise<string | null> {
  const serial = state.currentDevice;
  if (!serial) return null;

  const run = async (args: string[]) => {
    const [output] = await executeCommand(
      "adb",
      ["-s", serial, ...args],
      "wireless-ip",
      15_000
    );
    return output.startsWith("ERROR:") ? "" : output;
  };

  const wlan = await run(["shell", "ip", "-f", "inet", "addr", "show", "wlan0"]);
  const direct = wlan.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)?.[1];
  if (direct) return direct;

  // Some devices expose Wi-Fi on a different interface (or wlan0 is hidden).
  const all = await run(["shell", "ip", "-f", "inet", "addr", "show"]);
  const candidates = [...all.matchAll(/inet\s+(\d+\.\d+\.\d+\.\d+)/g)].map(
    (match) => match[1]
  );
  return candidates.find((address) => address !== "127.0.0.1") || null;
}

/** Switches a USB-connected device to TCP/IP mode. */
export async function enableWirelessOnUsb(port = "5555"): Promise<AdbResult> {
  const serial = state.currentDevice;
  if (!serial) {
    return {
      ok: false,
      message: "Connect a device over USB before enabling wireless ADB.",
    };
  }

  return runAdbDirect(["-s", serial, "tcpip", port], "Enabling wireless ADB");
}

export async function captureScreenshot(mode: "preview" | "save" = "preview") {
  if (!state.currentDevice) {
    toast("Connect a device first", "warning");
    return;
  }

  const name = `ascend_${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  const remotePath = `/data/local/tmp/${name}`;

  const capture = await runCommand("adb", ["shell", "screencap", "-p", remotePath], {
    label: "Capturing screenshot",
    timeout: 60_000,
  });
  if (!capture) return;

  try {
    if (mode === "save") {
      const destination = await saveFileDialog(name, [
        { name: "PNG image", extensions: ["png"] },
      ]);
      if (!destination) {
        await runCommand("adb", ["shell", "rm", remotePath], { background: true, quiet: true });
        return;
      }
      const pulled = await runCommand("adb", ["pull", remotePath, destination], {
        label: "Downloading screenshot",
      });
      if (pulled) {
        log(`Screenshot saved to ${destination}`, "SUCCESS");
        toast("Screenshot saved", "success");
      }
      return;
    }

    const localPath = await join(await tempDir(), name);
    const pulled = await runCommand("adb", ["pull", remotePath, localPath], {
      label: "Downloading screenshot",
    });
    if (!pulled) return;

    const dataUrl = await readFileBase64(localPath);
    setState("screenshotPreview", { path: localPath, name, dataUrl });
  } catch (error: any) {
    log(`Screenshot failed: ${error?.message || error}`, "ERROR");
    toast("Could not load the screenshot preview", "error");
  } finally {
    // Keep the device tidy; failure here is not worth surfacing.
    await runCommand("adb", ["shell", "rm", remotePath], { background: true, quiet: true });
  }
}

export async function enableWirelessAdb() {
  if (!state.currentDevice) {
    toast("Connect a device first", "warning");
    return;
  }

  const result = await runCommand("adb", ["tcpip", "5555"], { label: "Enabling wireless ADB" });
  if (!result) return;

  const ipResult = await runCommand(
    "adb",
    ["shell", "ip", "-f", "inet", "addr", "show", "wlan0"],
    { background: true, quiet: true }
  );
  const ip = ipResult?.[0].match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)?.[1];
  const message = ip
    ? `Wireless ADB enabled. Connect with ${ip}:5555`
    : "Wireless ADB enabled on port 5555. Unplug USB, then connect to the device IP.";
  log(message, "SUCCESS");
  toast(message, "success", 6000);
}

export async function saveScreenshotPreview() {
  const preview = state.screenshotPreview;
  if (!preview) return;
  const destination = await saveFileDialog(preview.name, [
    { name: "PNG image", extensions: ["png"] },
  ]);
  if (!destination) return;

  try {
    await copyFile(preview.path, destination);
    toast("Screenshot saved", "success");
  } catch (error: any) {
    log(`Could not save screenshot: ${error?.message || error}`, "ERROR");
    toast("Could not save screenshot", "error");
  }
}
