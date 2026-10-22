import { Component, createSignal, For, onMount, createEffect } from "solid-js";
import { state, setState, runCommand, log } from "../stateStore";
import { saveFileDialog } from "../tauriApi";

interface DeviceTabProps {
  onShowConfirm: (msg: string) => Promise<boolean>;
}

export const DeviceTab: Component<DeviceTabProps> = (props) => {
  const [deviceIp, setDeviceIp] = createSignal("");
  const [resolution, setResolution] = createSignal("");
  const [density, setDensity] = createSignal("");
  const [quickCmd, setQuickCmd] = createSignal("");
  const [quickCmdName, setQuickCmdName] = createSignal("Select a quick command...");
  const [quickCmdOpen, setQuickCmdOpen] = createSignal(false);
  const [dumpsysOutput, setDumpsysOutput] = createSignal("");

  const quickCmds: Record<string, string> = {
    "Battery Stats": "dumpsys battery",
    "Display Info": "dumpsys display",
    "Memory Info": "dumpsys meminfo",
    "Active Services": "dumpsys activity services",
    "Get All Props": "getprop",
  };

  const checkToggles = async () => {
    if (!state.currentDevice) return;
    const propMap = {
      layout: "debug.hwui.layout",
      overdraw: "debug.hwui.show_overdraw",
      pointer: "debug.hwui.pointer_location",
    };

    for (const [key, prop] of Object.entries(propMap)) {
      const res = await runCommand("adb", ["shell", "getprop", prop], true);
      if (res) {
        const msg = res[0];
        const val =
          msg.includes("true") || msg.includes("1") || msg.includes("show");
        setState("devToggles", key as "layout" | "overdraw" | "pointer", val);
      }
    }
  };

  createEffect(() => {
    if (state.activeTab === "device-tab" && state.currentDevice) {
      checkToggles();
    }
  });

  const handleReboot = async (cmd: string) => {
    if (await props.onShowConfirm(`Are you sure you want to ${cmd}?`)) {
      runCommand("adb", cmd.split(" "));
    }
  };

  const handleEnableWireless = () => {
    runCommand("adb", ["tcpip", "5555"]);
    log(
      "Enabled wireless ADB on port 5555. Connect to your device's IP address.",
      "SUCCESS"
    );
  };

  const handleConnectIp = () => {
    if (deviceIp()) {
      runCommand("adb", ["connect", `${deviceIp()}:5555`]);
    }
  };

  const handleScreenshot = async () => {
    const defaultName = `screenshot_${Date.now()}.png`;
    const destination = await saveFileDialog(defaultName);
    if (!destination) return;

    const remotePath = `/sdcard/${defaultName}`;
    log("Taking screenshot...", "INFO");
    await runCommand("adb", ["shell", "screencap", "-p", remotePath]);
    log("Downloading screenshot...", "INFO");
    await runCommand("adb", ["pull", remotePath, destination]);
    await runCommand("adb", ["shell", "rm", remotePath], true);
    log(`Screenshot saved to ${destination}`, "SUCCESS");
  };

  const handleSetScreenProps = () => {
    if (resolution()) runCommand("adb", ["shell", "wm", "size", resolution()]);
    if (density()) runCommand("adb", ["shell", "wm", "density", density()]);
  };

  const handleResetScreenProps = async () => {
    if (
      await props.onShowConfirm(
        "Are you sure you want to reset screen properties to default?"
      )
    ) {
      await runCommand("adb", ["shell", "wm", "size", "reset"]);
      await runCommand("adb", ["shell", "wm", "density", "reset"]);
    }
  };

  const handleToggleDev = async (key: "layout" | "overdraw" | "pointer") => {
    const newVal = !state.devToggles[key];
    setState("devToggles", key, newVal);

    const prop =
      key === "overdraw" ? "debug.hwui.show_overdraw" : `debug.hwui.${key}`;
    const val = newVal ? (key === "overdraw" ? "show" : "1") : "false";

    await runCommand("adb", ["shell", "setprop", prop, val]);
    await runCommand(
      "adb",
      ["shell", "service", "call", "activity", "1599295570"],
      true
    );
  };

  const handleRunQuickCommand = async () => {
    if (!quickCmd()) return;
    const res = await runCommand("adb", ["shell", ...quickCmd().split(" ")]);
    if (res) {
      setDumpsysOutput(res[0]);
    }
  };

  return (
    <div
      id="device-tab"
      class={`tab-content ${state.activeTab === "device-tab" ? "active" : ""}`}
    >
      <div class="controls-grid device-grid">
        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-power-off" /> Power Control
          </div>
          <div class="card-content button-grid-2">
            <button
              class="btn-secondary"
              onClick={() => handleReboot("reboot")}
            >
              Reboot
            </button>
            <button
              class="btn-secondary"
              onClick={() => handleReboot("reboot recovery")}
            >
              Reboot Recovery
            </button>
            <button
              class="btn-secondary"
              onClick={() => handleReboot("reboot bootloader")}
            >
              Reboot Bootloader
            </button>
            <button
              class="btn-secondary"
              onClick={() => handleReboot("reboot userspace")}
            >
              Reboot Safe Mode
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-wifi" /> Wireless ADB
          </div>
          <div class="card-content">
            <input
              type="text"
              id="device-ip"
              placeholder="Device IP Address"
              value={deviceIp()}
              onInput={(e) => setDeviceIp(e.currentTarget.value)}
            />
            <div class="button-grid-2">
              <button class="btn-secondary" onClick={handleEnableWireless}>
                Enable Wireless
              </button>
              <button class="btn-primary" onClick={handleConnectIp}>
                Connect
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-camera" /> Screen & Display
          </div>
          <div class="card-content">
            <button class="btn-primary" onClick={handleScreenshot}>
              <i class="fa-solid fa-camera-retro" /> Take Screenshot
            </button>
            <div class="input-grid-2">
              <input
                type="text"
                placeholder="Resolution (1080x1920)"
                value={resolution()}
                onInput={(e) => setResolution(e.currentTarget.value)}
              />
              <input
                type="text"
                placeholder="Density (420)"
                value={density()}
                onInput={(e) => setDensity(e.currentTarget.value)}
              />
            </div>
            <div class="button-grid-2">
              <button class="btn-secondary" onClick={handleSetScreenProps}>
                Set Properties
              </button>
              <button class="btn-danger" onClick={handleResetScreenProps}>
                Reset Properties
              </button>
            </div>
          </div>
        </div>

        <div class="card card-full-width">
          <div class="card-header">
            <i class="fa-solid fa-terminal" /> Advanced Tools
          </div>
          <div class="card-content">
            <div class="button-grid-3">
              <button
                class={`btn-secondary toggle-btn ${state.devToggles.layout ? "active" : ""}`}
                onClick={() => handleToggleDev("layout")}
              >
                Toggle Layout Bounds
              </button>
              <button
                class={`btn-secondary toggle-btn ${state.devToggles.overdraw ? "active" : ""}`}
                onClick={() => handleToggleDev("overdraw")}
              >
                Toggle GPU Overdraw
              </button>
              <button
                class={`btn-secondary toggle-btn ${state.devToggles.pointer ? "active" : ""}`}
                onClick={() => handleToggleDev("pointer")}
              >
                Toggle Pointer Location
              </button>
            </div>

            <div class="dumpsys-controls">
              <div class="custom-dropdown">
                <div
                  class={`dropdown-selected ${quickCmdOpen() ? "open" : ""}`}
                  onClick={() => setQuickCmdOpen(!quickCmdOpen())}
                >
                  <span id="selected-command-text">{quickCmdName()}</span>
                  <i class="fa-solid fa-chevron-down" />
                </div>
                <div class={`dropdown-menu ${quickCmdOpen() ? "open" : ""}`}>
                  <For each={Object.entries(quickCmds)}>
                    {([name, cmd]) => (
                      <div
                        class="dropdown-item"
                        onClick={() => {
                          setQuickCmdName(name);
                          setQuickCmd(cmd);
                          setQuickCmdOpen(false);
                        }}
                      >
                        {name}
                      </div>
                    )}
                  </For>
                </div>
              </div>
              <button class="btn-primary" onClick={handleRunQuickCommand}>
                Run
              </button>
            </div>

            <textarea
              id="dumpsys-output"
              readonly
              placeholder="Command output will appear here..."
              value={dumpsysOutput()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
