// dashboard.js
import { state } from "./state.js";
import { runCommand, refreshView } from "./adb.js";
import { $, sel, selAll, log } from "./utils.js";

export function initDashboard() {
  $("refresh-devices-btn")?.addEventListener("click", () => {
    runCommand("adb", ["devices"], false, "adb-devices");
  });

  const dropdown = sel("#device-dropdown");
  dropdown
    ?.querySelector(".dropdown-selected")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.querySelector(".dropdown-menu").classList.toggle("open");
      dropdown.querySelector(".dropdown-selected").classList.toggle("open");
    });

  document.addEventListener("click", () => {
    dropdown?.querySelector(".dropdown-menu").classList.remove("open");
    dropdown?.querySelector(".dropdown-selected").classList.remove("open");
  });
}

export function populateDeviceList(data) {
  const newDeviceList = [];
  const lines = data.split("\n").slice(1);
  lines.forEach((line) => {
    if (line.trim() && line.includes("device")) {
      newDeviceList.push(line.split("\t")[0].trim());
    }
  });

  if (JSON.stringify(newDeviceList) === JSON.stringify(state.currentDeviceList))
    return;

  state.currentDeviceList = newDeviceList;
  const dropdownMenu = sel("#device-dropdown .dropdown-menu");
  const selectedText = $("selected-device-text");
  dropdownMenu.innerHTML = "";

  if (state.currentDeviceList.length > 0) {
    state.currentDeviceList.forEach((deviceId) => {
      const item = document.createElement("div");
      item.className = "dropdown-item";
      item.textContent = deviceId;
      item.addEventListener("click", () => {
        const dropdownContainer = sel("#device-dropdown");
        dropdownContainer
          .querySelector(".dropdown-menu")
          .classList.remove("open");
        dropdownContainer
          .querySelector(".dropdown-selected")
          .classList.remove("open");

        if (state.currentDevice === deviceId) return;
        selectedText.textContent = deviceId;
        state.currentDevice = deviceId;
        refreshView();
      });
      dropdownMenu.appendChild(item);
    });

    if (!state.currentDeviceList.includes(state.currentDevice)) {
      state.currentDevice = state.currentDeviceList[0];
      refreshView();
    }
    selectedText.textContent = state.currentDevice;
  } else {
    state.currentDevice = null;
    selectedText.textContent = "No devices found";
    clearDashboard();
  }
}

export function getDashboardData() {
  if (!state.currentDevice) return;
  clearDashboard();
  const commands = {
    "dashboard-props": ["shell", "getprop"],
    "dashboard-battery": ["shell", "dumpsys", "battery"],
    "dashboard-network": ["shell", "ip", "addr", "show", "wlan0"],
    "dashboard-cpu": ["shell", "dumpsys", "cpuinfo"],
    "dashboard-ram": ["shell", "cat", "/proc/meminfo"],
    "dashboard-screenSize": ["shell", "wm", "size"],
    "dashboard-screenDensity": ["shell", "wm", "density"],
  };
  for (const key in commands) {
    runCommand("adb", commands[key], true, key);
  }
}

export function updateDashboardData(data, commandKey) {
  try {
    if (commandKey === "dashboard-props") {
      const getProp = (key) =>
        (data.match(new RegExp(`\\[${key}\\]: \\[(.*?)\\]`)) || [])[1];
      $("info-model").textContent = getProp("ro.product.model") || "N/A";
      $("info-brand").textContent = getProp("ro.product.brand") || "N/A";
      $("info-version").textContent = `Android ${
        getProp("ro.build.version.release") || "?"
      } (API ${getProp("ro.build.version.sdk") || "?"})`;
      $("info-build").textContent = getProp("ro.build.display.id") || "N/A";
    } else if (commandKey === "dashboard-battery") {
      const level = (data.match(/level: (\d+)/) || [])[1];
      const statusNum = (data.match(/status: (\d+)/) || [])[1];
      const statusMap = {
        2: "Charging",
        3: "Discharging",
        4: "Not Charging",
        5: "Full",
      };
      $("info-battery").textContent = level
        ? `${level}% (${statusMap[statusNum] || "Unknown"})`
        : "N/A";
    } else if (commandKey === "dashboard-network") {
      const ip = (data.match(/inet (\d+\.\d+\.\d+\.\d+)/) || [])[1];
      const mac = (data.match(/link\/ether ([\da-fA-F:]+)/) || [])[1];
      $("info-ip").textContent = ip || "N/A";
      $("info-mac").textContent = mac || "N/A";
    } else if (commandKey === "dashboard-cpu") {
      const load = (data.match(/Load: ([\d.]+)/) || [])[1];
      $("info-cpu").textContent = load ? `${load}` : "N/A";
    } else if (commandKey === "dashboard-ram") {
      const totalRamKB = parseInt(
        (data.match(/MemTotal:\s+(\d+) kB/) || [])[1]
      );
      const availableRamKB = parseInt(
        (data.match(/MemAvailable:\s+(\d+) kB/) || [])[1]
      );
      if (totalRamKB && availableRamKB) {
        const usedRamKB = totalRamKB - availableRamKB;
        const percentage = ((usedRamKB / totalRamKB) * 100).toFixed(1);
        $("info-ram-text").textContent = `${(usedRamKB / 1024 / 1024).toFixed(
          2
        )} GB / ${(totalRamKB / 1024 / 1024).toFixed(2)} GB`;
        $("info-ram-bar").style.width = `${percentage}%`;
      }
    } else if (commandKey === "dashboard-screenSize") {
      $("info-resolution").textContent =
        (data.match(/Physical size: ([\dx]+)/) || [])[1] || "N/A";
    } else if (commandKey === "dashboard-screenDensity") {
      const density = (data.match(/Physical density: (\d+)/) || [])[1];
      $("info-density").textContent = density ? `${density} dpi` : "N/A";
    }
  } catch (e) {
    log(
      `Error parsing dashboard data for ${commandKey}: ${e.message}`,
      "ERROR"
    );
  }
}

export function clearDashboard() {
  selAll(".info-line strong").forEach((el) => (el.textContent = "..."));
  $("info-ram-bar").style.width = "0%";
}
