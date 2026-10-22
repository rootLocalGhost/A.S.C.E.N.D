import { Component, createSignal, onMount, For, Show } from "solid-js";
import { state, setState, runCommand, log } from "../stateStore";

export const DashboardTab: Component = () => {
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [info, setInfo] = createSignal({
    model: "...",
    brand: "...",
    version: "...",
    build: "...",
    cpu: "...",
    battery: "...",
    ramText: "...",
    ramPercent: 0,
    resolution: "...",
    density: "...",
    ip: "...",
    mac: "...",
  });

  const refreshDeviceList = async () => {
    const res = await runCommand("adb", ["devices"], false, "adb-devices");
    if (!res) return;
    const [data] = res;
    const lines = data.split("\n").slice(1);
    const newDeviceList: string[] = [];
    lines.forEach((line) => {
      if (line.trim() && line.includes("device")) {
        newDeviceList.push(line.split("\t")[0].trim());
      }
    });

    setState("currentDeviceList", newDeviceList);

    if (newDeviceList.length > 0) {
      if (!state.currentDevice || !newDeviceList.includes(state.currentDevice)) {
        setState("currentDevice", newDeviceList[0]);
      }
      fetchDashboardData();
    } else {
      setState("currentDevice", null);
      clearDashboard();
    }
  };

  const clearDashboard = () => {
    setInfo({
      model: "...",
      brand: "...",
      version: "...",
      build: "...",
      cpu: "...",
      battery: "...",
      ramText: "...",
      ramPercent: 0,
      resolution: "...",
      density: "...",
      ip: "...",
      mac: "...",
    });
  };

  const fetchDashboardData = async () => {
    if (!state.currentDevice) return;

    clearDashboard();

    // 1. Props
    const resProps = await runCommand("adb", ["shell", "getprop"], true);
    if (resProps) {
      const data = resProps[0];
      const getProp = (key: string) =>
        (data.match(new RegExp(`\\[${key}\\]: \\[(.*?)\\]`)) || [])[1];
      const model = getProp("ro.product.model") || "N/A";
      const brand = getProp("ro.product.brand") || "N/A";
      const rel = getProp("ro.build.version.release") || "?";
      const sdk = getProp("ro.build.version.sdk") || "?";
      const build = getProp("ro.build.display.id") || "N/A";
      setInfo((prev) => ({
        ...prev,
        model,
        brand,
        version: `Android ${rel} (API ${sdk})`,
        build,
      }));
    }

    // 2. Battery
    const resBatt = await runCommand("adb", ["shell", "dumpsys", "battery"], true);
    if (resBatt) {
      const data = resBatt[0];
      const level = (data.match(/level: (\d+)/) || [])[1];
      const statusNum = (data.match(/status: (\d+)/) || [])[1];
      const statusMap: Record<string, string> = {
        "2": "Charging",
        "3": "Discharging",
        "4": "Not Charging",
        "5": "Full",
      };
      setInfo((prev) => ({
        ...prev,
        battery: level ? `${level}% (${statusMap[statusNum] || "Unknown"})` : "N/A",
      }));
    }

    // 3. Network
    const resNet = await runCommand(
      "adb",
      ["shell", "ip", "addr", "show", "wlan0"],
      true
    );
    if (resNet) {
      const data = resNet[0];
      const ip = (data.match(/inet (\d+\.\d+\.\d+\.\d+)/) || [])[1] || "N/A";
      const mac = (data.match(/link\/ether ([\da-fA-F:]+)/) || [])[1] || "N/A";
      setInfo((prev) => ({ ...prev, ip, mac }));
    }

    // 4. CPU
    const resCpu = await runCommand("adb", ["shell", "dumpsys", "cpuinfo"], true);
    if (resCpu) {
      const data = resCpu[0];
      const load = (data.match(/Load: ([\d.]+)/) || [])[1] || "N/A";
      setInfo((prev) => ({ ...prev, cpu: load }));
    }

    // 5. RAM
    const resRam = await runCommand("adb", ["shell", "cat", "/proc/meminfo"], true);
    if (resRam) {
      const data = resRam[0];
      const totalRamKB = parseInt((data.match(/MemTotal:\s+(\d+) kB/) || [])[1]);
      const availableRamKB = parseInt(
        (data.match(/MemAvailable:\s+(\d+) kB/) || [])[1]
      );
      if (totalRamKB && availableRamKB) {
        const usedRamKB = totalRamKB - availableRamKB;
        const percentage = parseFloat(((usedRamKB / totalRamKB) * 100).toFixed(1));
        const usedGb = (usedRamKB / 1024 / 1024).toFixed(2);
        const totalGb = (totalRamKB / 1024 / 1024).toFixed(2);
        setInfo((prev) => ({
          ...prev,
          ramText: `${usedGb} GB / ${totalGb} GB`,
          ramPercent: percentage,
        }));
      }
    }

    // 6. Screen Size & Density
    const resSize = await runCommand("adb", ["shell", "wm", "size"], true);
    if (resSize) {
      const resolution =
        (resSize[0].match(/Physical size: ([\dx]+)/) || [])[1] || "N/A";
      setInfo((prev) => ({ ...prev, resolution }));
    }

    const resDensity = await runCommand("adb", ["shell", "wm", "density"], true);
    if (resDensity) {
      const den = (resDensity[0].match(/Physical density: (\d+)/) || [])[1];
      setInfo((prev) => ({ ...prev, density: den ? `${den} dpi` : "N/A" }));
    }
  };

  onMount(() => {
    refreshDeviceList();
  });

  return (
    <div id="dashboard-tab" class={`tab-content ${state.activeTab === "dashboard-tab" ? "active" : ""}`}>
      <div class="dashboard-grid">
        <div class="card" id="device-control-card">
          <div class="custom-dropdown">
            <div
              class={`dropdown-selected ${dropdownOpen() ? "open" : ""}`}
              onClick={() => setDropdownOpen(!dropdownOpen())}
            >
              <span id="selected-device-text">
                {state.currentDevice || (state.currentDeviceList.length > 0 ? "Select device..." : "Searching for devices...")}
              </span>
              <i class="fa-solid fa-chevron-down" />
            </div>
            <div class={`dropdown-menu ${dropdownOpen() ? "open" : ""}`}>
              <For each={state.currentDeviceList}>
                {(deviceId) => (
                  <div
                    class="dropdown-item"
                    onClick={() => {
                      setState("currentDevice", deviceId);
                      setDropdownOpen(false);
                      fetchDashboardData();
                    }}
                  >
                    {deviceId}
                  </div>
                )}
              </For>
            </div>
          </div>
          <button
            id="refresh-devices-btn"
            class="btn-secondary"
            title="Refresh All Data"
            onClick={() => refreshDeviceList()}
          >
            <i class="fa-solid fa-arrows-rotate" /> Refresh
          </button>
        </div>

        <div class="card info-card">
          <div class="card-header">
            <i class="fa-solid fa-mobile-screen-button" /> Device Info
          </div>
          <div class="card-content">
            <div class="info-line">
              <span>Model:</span>
              <strong>{info().model}</strong>
            </div>
            <div class="info-line">
              <span>Brand:</span>
              <strong>{info().brand}</strong>
            </div>
            <div class="info-line">
              <span>Android Version:</span>
              <strong>{info().version}</strong>
            </div>
            <div class="info-line">
              <span>Build:</span>
              <strong>{info().build}</strong>
            </div>
          </div>
        </div>

        <div class="card info-card">
          <div class="card-header">
            <i class="fa-solid fa-microchip" /> System Status
          </div>
          <div class="card-content">
            <div class="info-line">
              <span>CPU Load:</span>
              <strong>{info().cpu}</strong>
            </div>
            <div class="info-line">
              <span>Battery:</span>
              <strong>{info().battery}</strong>
            </div>
            <div class="progress-bar-container">
              <div class="info-line">
                <span>RAM Usage:</span>
                <strong>{info().ramText}</strong>
              </div>
              <div class="progress-bar">
                <div
                  class="progress-bar-fill"
                  style={{ width: `${info().ramPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div class="card info-card">
          <div class="card-header">
            <i class="fa-solid fa-display" /> Screen
          </div>
          <div class="card-content">
            <div class="info-line">
              <span>Resolution:</span>
              <strong>{info().resolution}</strong>
            </div>
            <div class="info-line">
              <span>Density:</span>
              <strong>{info().density}</strong>
            </div>
          </div>
        </div>

        <div class="card info-card">
          <div class="card-header">
            <i class="fa-solid fa-wifi" /> Network
          </div>
          <div class="card-content">
            <div class="info-line">
              <span>WLAN IP:</span>
              <strong>{info().ip}</strong>
            </div>
            <div class="info-line">
              <span>MAC Address:</span>
              <strong>{info().mac}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
