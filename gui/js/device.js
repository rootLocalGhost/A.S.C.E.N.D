// device.js
import { state } from "./state.js";
import { runCommand } from "./adb.js";
import { $, selAll, log } from "./utils.js";
import { showConfirmModal } from "./modals.js";

export function initDeviceControls() {
  selAll('[id^="reboot-"]').forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const cmd = e.currentTarget.dataset.cmd;
      if (await showConfirmModal(`Are you sure you want to ${cmd}?`)) {
        runCommand("adb", [...cmd.split(" ")]);
      }
    });
  });

  $("enable-wireless-btn")?.addEventListener("click", () => {
    runCommand("adb", ["tcpip", "5555"]);
    log(
      "Enabled wireless ADB on port 5555. Connect to your device's IP address.",
      "SUCCESS"
    );
  });
  $("connect-ip-btn")?.addEventListener("click", () => {
    const ip = $("device-ip").value.trim();
    if (ip) {
      runCommand("adb", ["connect", `${ip}:5555`]);
    }
  });

  $("screenshot-btn")?.addEventListener("click", async () => {
    const remotePath = `/sdcard/screenshot_${Date.now()}.png`;
    const destination = await window.electronAPI.saveFile(
      remotePath.split("/").pop()
    );
    if (!destination) return;
    if (/[\0\r\n]/.test(destination)) {
      log("Invalid destination path for screenshot.", "ERROR");
      return;
    }

    log("Taking screenshot...", "INFO");
    runCommand("adb", ["shell", "screencap", "-p", remotePath]);
    setTimeout(() => {
      log("Downloading screenshot...", "INFO");
      runCommand("adb", ["pull", remotePath, destination]);
      setTimeout(() => {
        runCommand("adb", ["shell", "rm", remotePath], true);
        log(`Screenshot saved to ${destination}`, "SUCCESS");
      }, 2000);
    }, 1500);
  });

  $("set-screen-props")?.addEventListener("click", () => {
    const res = $("set-resolution").value;
    const den = $("set-density").value;
    if (res) runCommand("adb", ["shell", "wm", "size", res]);
    if (den)
      setTimeout(() => runCommand("adb", ["shell", "wm", "density", den]), 200);
  });

  $("reset-screen-props")?.addEventListener("click", async () => {
    if (
      await showConfirmModal(
        "Are you sure you want to reset screen properties to default?"
      )
    ) {
      runCommand("adb", ["shell", "wm", "size", "reset"]);
      setTimeout(
        () => runCommand("adb", ["shell", "wm", "density", "reset"]),
        200
      );
    }
  });

  const toggleMap = {
    "toggle-layout-bounds": "layout",
    "toggle-gpu-overdraw": "overdraw",
    "toggle-pointer-location": "pointer",
  };
  Object.entries(toggleMap).forEach(([id, key]) => {
    $(id)?.addEventListener("click", (e) => {
      state.devToggles[key] = !state.devToggles[key];
      const prop =
        key === "overdraw" ? "debug.hwui.show_overdraw" : `debug.hwui.${key}`;
      e.currentTarget.classList.toggle("active", state.devToggles[key]);
      runCommand("adb", [
        "shell",
        "setprop",
        prop,
        state.devToggles[key] ? (key === "overdraw" ? "show" : "1") : "false",
      ]);
      setTimeout(
        () =>
          runCommand(
            "adb",
            ["shell", "service", "call", "activity", "1599295570"],
            true
          ),
        200
      );
    });
  });

  const quickCmdDropdown = $("quick-command-dropdown");
  const quickCmdMenu = quickCmdDropdown?.querySelector(".dropdown-menu");
  const quickCmdText = $("selected-command-text");
  const quickCmds = {
    "Battery Stats": "dumpsys battery",
    "Display Info": "dumpsys display",
    "Memory Info": "dumpsys meminfo",
    "Active Services": "dumpsys activity services",
    "Get All Props": "getprop",
  };
  if (quickCmdDropdown && quickCmdMenu && quickCmdText) {
    Object.entries(quickCmds).forEach(([name, cmd]) => {
      const item = document.createElement("div");
      item.className = "dropdown-item";
      item.textContent = name;
      item.addEventListener("click", () => {
        quickCmdText.textContent = name;
        quickCmdDropdown.dataset.value = cmd;
      });
      quickCmdMenu.appendChild(item);
    });

    quickCmdDropdown
      .querySelector(".dropdown-selected")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        quickCmdMenu.classList.toggle("open");
      });
  }
  $("run-quick-command")?.addEventListener("click", () => {
    const cmd = quickCmdDropdown?.dataset.value;
    if (cmd) runCommand("adb", ["shell", ...cmd.split(" ")], false, "dumpsys");
  });
}

export function checkAllToggleStates() {
  if (!state.currentDevice) return;
  Object.keys(state.devToggles).forEach((key) => checkToggleState(key, true));
}

function checkToggleState(stateKey, isBackgroundTask = false) {
  const propMap = {
    layout: "debug.hwui.layout",
    overdraw: "debug.hwui.show_overdraw",
    pointer: "debug.hwui.pointer_location",
  };
  runCommand(
    "adb",
    ["shell", "getprop", propMap[stateKey]],
    isBackgroundTask,
    `toggle-${stateKey}`
  );
}

export function parseToggleState(msg, commandKey) {
  const key = commandKey.split("-")[1];
  state.devToggles[key] =
    msg.includes("true") || msg.includes("1") || msg.includes("show");
  const buttonId = `toggle-${key
    .replace("overdraw", "gpu-overdraw")
    .replace("pointer", "pointer-location")
    .replace("layout", "layout-bounds")}`;
  $(buttonId)?.classList.toggle("active", state.devToggles[key]);
}
