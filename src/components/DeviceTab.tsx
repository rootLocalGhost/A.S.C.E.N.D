import {
  Component,
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { state, setState, runCommand, refreshDevices, log, loadTools, toast, openConnect } from "../stateStore";
import {
  captureScreenshot,
  connectWirelessDevice,
  detectDeviceWifiIp,
  disconnectWirelessDevice,
  enableWirelessAdb,
  pairWirelessDevice,
} from "../actions";
import { saveFileDialog, writeTextFile } from "../tauriApi";
import { deviceStateLabel } from "../utils";
import { CopyButton, ToggleSwitch } from "./ui";

interface DeviceTabProps {
  onShowConfirm: (msg: string) => Promise<boolean>;
}

const QUICK_COMMANDS: Array<{ name: string; command: string; icon: string }> = [
  { name: "Battery stats", command: "dumpsys battery", icon: "fa-solid fa-battery-half" },
  { name: "Display info", command: "dumpsys display", icon: "fa-solid fa-display" },
  { name: "Memory info", command: "dumpsys meminfo", icon: "fa-solid fa-memory" },
  { name: "Active services", command: "dumpsys activity services", icon: "fa-solid fa-layer-group" },
  { name: "Wi-Fi status", command: "dumpsys wifi | head -n 120", icon: "fa-solid fa-wifi" },
  { name: "Bluetooth status", command: "dumpsys bluetooth_manager | head -n 120", icon: "fa-brands fa-bluetooth" },
  { name: "Storage usage", command: "df -h /data /sdcard", icon: "fa-solid fa-hard-drive" },
  { name: "Installed packages", command: "pm list packages", icon: "fa-brands fa-android" },
  { name: "All system properties", command: "getprop", icon: "fa-solid fa-list" },
  { name: "Kernel info", command: "uname -a", icon: "fa-solid fa-microchip" },
  { name: "Doze / device idle", command: "dumpsys deviceidle", icon: "fa-solid fa-moon" },
  { name: "Top processes", command: "top -b -n 1 | head -n 40", icon: "fa-solid fa-ranking-star" },
];

interface ScreenProps {
  resolution: string;
  density: string;
}

export const DeviceTab: Component<DeviceTabProps> = (props) => {
  const [deviceIp, setDeviceIp] = createSignal("");
  const [connectPort, setConnectPort] = createSignal("5555");
  const [pairPort, setPairPort] = createSignal("");
  const [pairCode, setPairCode] = createSignal("");
  const [resolution, setResolution] = createSignal("");
  const [density, setDensity] = createSignal("");
  const [currentScreen, setCurrentScreen] = createSignal<ScreenProps>({
    resolution: "—",
    density: "—",
  });
  const [quickIndex, setQuickIndex] = createSignal(0);
  const [quickOutput, setQuickOutput] = createSignal("");
  const [quickRunning, setQuickRunning] = createSignal(false);
  const [customCommand, setCustomCommand] = createSignal("");
  const [togglesLoading, setTogglesLoading] = createSignal(false);
  const [acting, setActing] = createSignal<string | null>(null);

  const quick = () => QUICK_COMMANDS[quickIndex()];

  const checkToggles = async () => {
    if (!state.currentDevice) return;
    setTogglesLoading(true);
    const script =
      "echo __LAYOUT__; getprop debug.hwui.layout; echo __OVERDRAW__; getprop debug.hwui.show_overdraw; echo __POINTER__; getprop debug.hwui.pointer_location";
    const res = await runCommand("adb", ["shell", script], {
      background: true,
      quiet: true,
      timeout: 15_000,
    });
    if (res) {
      const value = (tag: string) => {
        const match = res[0].match(new RegExp(`__${tag}__\\r?\\n([^\\r\\n]*)`));
        const raw = (match?.[1] || "").trim().toLowerCase();
        return raw === "1" || raw === "true" || raw === "show";
      };
      setState("devToggles", {
        layout: value("LAYOUT"),
        overdraw: value("OVERDRAW"),
        pointer: value("POINTER"),
      });
    }
    setTogglesLoading(false);
  };

  const loadScreen = async () => {
    if (!state.currentDevice) return;
    const res = await runCommand("adb", ["shell", "wm size; wm density"], {
      background: true,
      quiet: true,
      timeout: 15_000,
    });
    if (res) {
      const size = res[0].match(/Physical size:\s*([\dx]+)/)?.[1] || "—";
      const den = res[0].match(/Physical density:\s*(\d+)/)?.[1];
      setCurrentScreen({ resolution: size, density: den ? `${den} dpi` : "—" });
    }
  };

  createEffect(() => {
    if (state.activeTab === "device-tab" && state.currentDevice) {
      void checkToggles();
      void loadScreen();
      void loadTools();
    }
  });

  onMount(() => {
    const onScreenshot = () => void captureScreenshot("preview");
    const onWireless = () => void enableWirelessAdb();
    const onRefresh = () => {
      void loadScreen();
      void checkToggles();
    };
    window.addEventListener("ascend:screenshot", onScreenshot);
    window.addEventListener("ascend:wireless", onWireless);
    window.addEventListener("ascend:refresh", onRefresh);
    onCleanup(() => {
      window.removeEventListener("ascend:screenshot", onScreenshot);
      window.removeEventListener("ascend:wireless", onWireless);
      window.removeEventListener("ascend:refresh", onRefresh);
    });
  });

  const handleReboot = async (cmd: string, label: string) => {
    if (await props.onShowConfirm(`${label}? The device will disconnect.`)) {
      const res = await runCommand("adb", ["reboot", ...cmd.split(" ").filter(Boolean)]);
      if (res) toast(`${label} requested`, "success");
    }
  };

  const handlePower = async () => {
    if (await props.onShowConfirm("Power off the device?")) {
      const res = await runCommand("adb", ["shell", "reboot", "-p"]);
      if (res) toast("Power off requested", "success");
    }
  };

  const handleWake = async (wake: boolean) => {
    const res = await runCommand("adb", ["shell", "input", "keyevent", wake ? "224" : "223"], {
      background: true,
      quiet: true,
    });
    if (res) toast(wake ? "Screen wake sent" : "Screen sleep sent", "success", 1800);
    else toast(wake ? "Could not wake the screen" : "Could not sleep the screen", "warning");
  };

  const detectIp = async () => {
    if (!state.currentDevice) return;
    const ip = await detectDeviceWifiIp();
    if (ip) {
      setDeviceIp(ip);
      toast(`Device IP detected: ${ip}`, "success");
    } else {
      toast("Could not detect a Wi-Fi IP. Is Wi-Fi connected?", "warning");
    }
  };

  const handleConnect = async () => {
    const ip = deviceIp().trim();
    const port = connectPort().trim() || "5555";
    if (!ip) {
      toast("Enter the device IP address or detect it automatically", "warning");
      return;
    }
    setActing("connect");
    const result = await connectWirelessDevice(ip, port);
    setActing(null);
    if (result.ok) {
      toast(`Connected to ${ip}:${port}`, "success");
      await refreshDevices({ quiet: false });
    } else {
      toast(result.message, "error", 6000);
    }
  };

  const handleDisconnect = async () => {
    const target = deviceIp().trim() || state.currentDevice || "";
    if (!target) return;
    if (!target.includes(":")) {
      toast("Enter the network address shown in Wireless debugging to disconnect it.", "info");
      return;
    }
    setActing("disconnect");
    const result = await disconnectWirelessDevice(target);
    setActing(null);
    if (result.ok) {
      toast("Device disconnected", "info");
      await refreshDevices({ quiet: true });
    } else {
      toast(result.message, "warning");
    }
  };

  const handlePair = async () => {
    const ip = deviceIp().trim();
    const port = pairPort().trim();
    const code = pairCode().trim();
    if (!ip || !port || !code) {
      toast("Enter the pairing IP, port, and code shown on the device", "warning");
      return;
    }
    setActing("pair");
    const result = await pairWirelessDevice(ip, port, code);
    setActing(null);
    if (result.ok) {
      toast("Paired successfully. Now connect using the normal port (usually 5555).", "success", 6000);
      setPairPort("");
      setPairCode("");
    } else {
      toast(result.message, "error", 6000);
    }
  };

  const handleSetScreenProps = async () => {
    if (!resolution() && !density()) {
      toast("Enter a resolution, density, or both", "warning");
      return;
    }
    if (resolution() && !/^\d+x\d+$/.test(resolution().trim())) {
      toast("Resolution must look like 1080x1920", "warning");
      return;
    }
    if (density() && !/^\d+$/.test(density().trim())) {
      toast("Density must be a number such as 420", "warning");
      return;
    }
    if (!(await props.onShowConfirm("Apply the new screen size/density? Some apps may need a restart."))) {
      return;
    }
    let failed = false;
    if (resolution()) {
      const res = await runCommand("adb", ["shell", "wm", "size", resolution().trim()], {
        quiet: true,
      });
      if (!res) failed = true;
    }
    if (density()) {
      const res = await runCommand("adb", ["shell", "wm", "density", density().trim()], {
        quiet: true,
      });
      if (!res) failed = true;
    }
    if (failed) {
      toast("Could not update every screen property. Check the console.", "error");
      await loadScreen();
      return;
    }
    toast("Screen properties updated", "success");
    await loadScreen();
  };

  const handleResetScreenProps = async () => {
    if (!(await props.onShowConfirm("Reset screen size and density to the device defaults?"))) return;
    const size = await runCommand("adb", ["shell", "wm", "size", "reset"], { quiet: true });
    const density = await runCommand("adb", ["shell", "wm", "density", "reset"], { quiet: true });
    if (!size || !density) {
      toast("Could not reset screen properties", "error");
    } else {
      toast("Screen properties reset", "success");
    }
    await loadScreen();
  };

  const handleToggleDev = async (key: "layout" | "overdraw" | "pointer") => {
    const previous = state.devToggles[key];
    const newVal = !previous;
    setState("devToggles", key, newVal);

    const prop =
      key === "overdraw" ? "debug.hwui.show_overdraw" : `debug.hwui.${key}`;
    const val = newVal ? (key === "overdraw" ? "show" : "1") : "false";

    const res = await runCommand("adb", ["shell", "setprop", prop, val], { quiet: true });
    if (!res) {
      setState("devToggles", key, previous);
      toast("Could not change the developer overlay", "error");
      return;
    }
    await runCommand("adb", ["shell", "service", "call", "activity", "1599295570"], {
      background: true,
      quiet: true,
    });
    void checkToggles();
  };

  const runQuickCommand = async (command?: string) => {
    const cmd = (command ?? quick().command).trim();
    if (!cmd) return;
    setQuickRunning(true);
    setQuickOutput("");
    const res = await runCommand("adb", ["shell", cmd], {
      timeout: 120_000,
      label: "Running command",
    });
    if (res) {
      setQuickOutput(res[0] || "(no output)");
      log(`Command finished: ${cmd}`, "SUCCESS");
    } else {
      setQuickOutput("Command failed. Check the console for details.");
    }
    setQuickRunning(false);
  };

  const runCustomCommand = async () => {
    const command = customCommand().trim();
    if (!command) return;
    await runQuickCommand(command);
  };

  const saveOutput = async () => {
    if (!quickOutput()) return;
    const destination = await saveFileDialog(`device-output-${Date.now()}.txt`, [
      { name: "Text file", extensions: ["txt"] },
    ]);
    if (!destination) return;
    try {
      await writeTextFile(destination, quickOutput());
      toast("Output saved", "success");
    } catch {
      toast("Could not save output", "error");
    }
  };

  const serverAction = async (action: "kill" | "start") => {
    setActing(action);
    if (action === "kill") {
      const res = await runCommand("adb", ["kill-server"], { quiet: true });
      if (res) toast("ADB server stopped", "info");
      else toast("Could not stop the ADB server", "error");
    } else {
      const res = await runCommand("adb", ["start-server"], {
        background: true,
        quiet: true,
      });
      if (!res) {
        toast("Could not start the ADB server", "error");
      } else {
        await refreshDevices({ quiet: false });
        toast("ADB server started", "success");
      }
    }
    setActing(null);
  };

  return (
    <div
      id="device-tab"
      class={`tab-content ${state.activeTab === "device-tab" ? "active" : ""}`}
    >
      <div class="card connect-banner">
        <div class="connect-banner-main">
          <span
            class={`connect-banner-icon ${
              state.currentDevice
                ? state.deviceInfo[state.currentDevice]?.state === "device"
                  ? "online"
                  : "warning"
                : "offline"
            }`}
          >
            <i class="fa-solid fa-plug-circle-plus" />
          </span>
          <div>
            <strong>
              {state.currentDevice
                ? state.deviceInfo[state.currentDevice]?.model || state.currentDevice
                : "No device connected"}
            </strong>
            <span>
              {state.currentDevice
                ? `${deviceStateLabel(
                    state.deviceInfo[state.currentDevice]?.state || "unknown"
                  )} · Add another device or switch to wireless debugging.`
                : "Use the guided USB setup or pair over Wi-Fi from the same network."}
            </span>
          </div>
        </div>
        <div class="connect-banner-actions">
          <button class="btn-primary" onClick={() => openConnect("usb")}>
            <i class="fa-brands fa-usb" /> USB setup
          </button>
          <button class="btn-secondary" onClick={() => openConnect("wireless")}>
            <i class="fa-solid fa-wifi" /> Wireless pairing
          </button>
          <button
            class="icon-btn"
            title="Refresh connected devices"
            aria-label="Refresh connected devices"
            onClick={() => void refreshDevices({ quiet: false })}
          >
            <i class="fa-solid fa-arrows-rotate" />
          </button>
        </div>
      </div>

      <div class="controls-grid device-grid">
        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-power-off" /> Power & Device
          </div>
          <div class="card-content">
            <div class="button-grid-2">
              <button class="btn-secondary" onClick={() => void handleReboot("", "Reboot")}>
                <i class="fa-solid fa-rotate-right" /> Reboot
              </button>
              <button
                class="btn-secondary"
                onClick={() => void handleReboot("recovery", "Reboot to recovery")}
              >
                <i class="fa-solid fa-screwdriver-wrench" /> Recovery
              </button>
              <button
                class="btn-secondary"
                onClick={() => void handleReboot("bootloader", "Reboot to bootloader")}
              >
                <i class="fa-brands fa-android" /> Bootloader
              </button>
              <button
                class="btn-secondary"
                onClick={() => void handleReboot("userspace", "Soft reboot")}
              >
                <i class="fa-solid fa-shield" /> Soft reboot
              </button>
            </div>
            <div class="button-grid-3">
              <button class="btn-secondary small" onClick={() => void handleWake(true)}>
                <i class="fa-solid fa-sun" /> Wake
              </button>
              <button class="btn-secondary small" onClick={() => void handleWake(false)}>
                <i class="fa-solid fa-moon" /> Sleep
              </button>
              <button class="btn-danger small" onClick={() => void handlePower()}>
                <i class="fa-solid fa-power-off" /> Power off
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-wifi" /> Wireless ADB
          </div>
          <div class="card-content">
            <div class="input-inline">
              <input
                type="text"
                id="device-ip"
                placeholder="Device IP (192.168.1.42)"
                value={deviceIp()}
                onInput={(event) => setDeviceIp(event.currentTarget.value)}
              />
              <button class="icon-btn" title="Detect IP from device" aria-label="Detect IP" onClick={detectIp}>
                <i class="fa-solid fa-location-crosshairs" />
              </button>
            </div>

            <div class="input-inline">
              <input
                type="text"
                placeholder="Port"
                value={connectPort()}
                onInput={(event) => setConnectPort(event.currentTarget.value)}
                aria-label="ADB connect port"
              />
              <button
                class="btn-secondary"
                onClick={() => void enableWirelessAdb()}
                title="Run adb tcpip 5555 and show the connect address"
              >
                <i class="fa-solid fa-tower-broadcast" /> Enable
              </button>
              <button
                class="btn-primary"
                onClick={() => void handleConnect()}
                disabled={acting() === "connect"}
              >
                {acting() === "connect" ? <i class="fa-solid fa-circle-notch fa-spin" /> : <i class="fa-solid fa-link" />}
                Connect
              </button>
            </div>

            <div class="pair-row">
              <span class="pair-label">Android 11+ pairing</span>
              <input
                type="text"
                placeholder="Pair port"
                value={pairPort()}
                onInput={(event) => setPairPort(event.currentTarget.value)}
                aria-label="Wireless debugging pairing port"
              />
              <input
                type="text"
                placeholder="6-digit code"
                value={pairCode()}
                onInput={(event) => setPairCode(event.currentTarget.value)}
                aria-label="Wireless debugging pairing code"
              />
              <button class="btn-secondary" onClick={() => void handlePair()} disabled={acting() === "pair"}>
                Pair
              </button>
            </div>

            <button class="link-btn" onClick={() => void handleDisconnect()}>
              <i class="fa-solid fa-link-slash" /> Disconnect from this address
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-camera" /> Screen & Display
          </div>
          <div class="card-content">
            <div class="button-grid-2">
              <button class="btn-primary" onClick={() => void captureScreenshot("preview")}>
                <i class="fa-solid fa-camera" /> Preview
              </button>
              <button class="btn-secondary" onClick={() => void captureScreenshot("save")}>
                <i class="fa-solid fa-download" /> Save to file
              </button>
            </div>

            <div class="current-screen">
              <span>
                Current: <strong>{currentScreen().resolution}</strong>
              </span>
              <span>
                Density: <strong>{currentScreen().density}</strong>
              </span>
            </div>

            <div class="input-grid-2">
              <input
                type="text"
                placeholder="Resolution (1080x1920)"
                value={resolution()}
                onInput={(event) => setResolution(event.currentTarget.value)}
              />
              <input
                type="text"
                placeholder="Density (420)"
                value={density()}
                onInput={(event) => setDensity(event.currentTarget.value)}
              />
            </div>
            <div class="button-grid-2">
              <button class="btn-secondary" onClick={() => void handleSetScreenProps()}>
                Set properties
              </button>
              <button class="btn-danger" onClick={() => void handleResetScreenProps()}>
                Reset defaults
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-terminal" /> ADB Tools
          </div>
          <div class="card-content">
            <div class="tool-status-row">
              <span
                class={`tool-status ${state.tools.adb ? "ok" : "missing"}`}
                title={state.tools.adbPath || "ADB was not detected in the bundled bin folder."}
              >
                <span class={`status-dot ${state.tools.adb ? "online" : "offline"}`} />
                {state.tools.adb || "ADB not found"}
              </span>
              <span
                class={`tool-status ${state.tools.fastboot ? "ok" : "missing"}`}
                title={state.tools.fastbootPath || "Fastboot was not detected in the bundled bin folder."}
              >
                <span class={`status-dot ${state.tools.fastboot ? "online" : "offline"}`} />
                {state.tools.fastboot ? "fastboot" : "fastboot missing"}
              </span>
            </div>
            <div class="button-grid-2">
              <button
                class="btn-secondary"
                onClick={() => void serverAction("kill")}
                disabled={acting() === "kill"}
              >
                <i class="fa-solid fa-stop" /> Stop server
              </button>
              <button
                class="btn-secondary"
                onClick={() => void serverAction("start")}
                disabled={acting() === "start"}
              >
                <i class="fa-solid fa-play" /> Start server
              </button>
            </div>
            <button class="btn-secondary" onClick={() => setState("logDrawerOpen", !state.logDrawerOpen)}>
              <i class="fa-solid fa-terminal" /> Open console
            </button>
          </div>
        </div>

        <div class="card card-full-width">
          <div class="card-header">
            <i class="fa-solid fa-flask" /> Developer Overlays
            <Show when={togglesLoading()}>
              <i class="fa-solid fa-circle-notch fa-spin" style={{ "margin-left": "auto" }} />
            </Show>
          </div>
          <div class="card-content">
            <div class="button-grid-3">
              <label class="toggle-card">
                <div>
                  <strong>Layout bounds</strong>
                  <span>Highlight view edges</span>
                </div>
                <ToggleSwitch
                  checked={state.devToggles.layout}
                  onChange={() => void handleToggleDev("layout")}
                  label="Toggle layout bounds"
                />
              </label>
              <label class="toggle-card">
                <div>
                  <strong>GPU overdraw</strong>
                  <span>Show overdraw regions</span>
                </div>
                <ToggleSwitch
                  checked={state.devToggles.overdraw}
                  onChange={() => void handleToggleDev("overdraw")}
                  label="Toggle GPU overdraw"
                />
              </label>
              <label class="toggle-card">
                <div>
                  <strong>Pointer location</strong>
                  <span>Show touch coordinates</span>
                </div>
                <ToggleSwitch
                  checked={state.devToggles.pointer}
                  onChange={() => void handleToggleDev("pointer")}
                  label="Toggle pointer location"
                />
              </label>
            </div>
          </div>
        </div>

        <div class="card card-full-width">
          <div class="card-header">
            <i class="fa-solid fa-terminal" /> Command Output
            <span class="header-hint">Shell commands run on {state.currentDevice || "no device"}</span>
          </div>
          <div class="card-content">
            <div class="command-runner">
              <div class="filter-select grow">
                <i class={quick().icon} />
                <select
                  value={quickIndex()}
                  onChange={(event) => setQuickIndex(parseInt(event.currentTarget.value, 10))}
                  aria-label="Quick command"
                >
                  <For each={QUICK_COMMANDS}>
                    {(item, index) => <option value={index()}>{item.name}</option>}
                  </For>
                </select>
              </div>
              <button
                class="btn-primary"
                onClick={() => void runQuickCommand()}
                disabled={quickRunning()}
              >
                <i class={`fa-solid ${quickRunning() ? "fa-circle-notch fa-spin" : "fa-play"}`} /> Run
              </button>
            </div>

            <div class="command-runner">
              <input
                type="text"
                placeholder="Custom shell command (e.g. dumpsys package com.android.settings)"
                value={customCommand()}
                onInput={(event) => setCustomCommand(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runCustomCommand();
                }}
              />
              <button class="btn-secondary" onClick={() => void runCustomCommand()} disabled={quickRunning()}>
                <i class="fa-solid fa-chevron-right" /> Run custom
              </button>
            </div>

            <textarea
              id="dumpsys-output"
              readonly
              placeholder="Command output will appear here…"
              value={quickOutput()}
              spellcheck={false}
            />

            <div class="output-actions">
              <CopyButton value={quickOutput()} label="command output" />
              <button class="icon-btn" title="Save output" aria-label="Save output" onClick={() => void saveOutput()}>
                <i class="fa-solid fa-download" />
              </button>
              <button
                class="icon-btn"
                title="Clear output"
                aria-label="Clear output"
                onClick={() => setQuickOutput("")}
              >
                <i class="fa-solid fa-eraser" />
              </button>
              <span class="output-length">{quickOutput().length.toLocaleString()} characters</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
