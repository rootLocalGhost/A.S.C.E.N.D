import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  state,
  refreshDevices,
  selectDevice,
  runCommand,
  updatePreference,
  openConnect,
} from "../stateStore";
import { captureScreenshot } from "../actions";
import { cx, deviceStateLabel, formatUptime } from "../utils";
import { CopyButton, EmptyState, ToggleSwitch } from "./ui";

interface DashboardInfo {
  model: string;
  brand: string;
  manufacturer: string;
  version: string;
  sdk: string;
  build: string;
  securityPatch: string;
  abi: string;
  cpu: string;
  cpuLoad: number;
  batteryLevel: number;
  batteryStatus: string;
  batteryTemp: string;
  batteryHealth: string;
  ramUsed: string;
  ramTotal: string;
  ramPercent: number;
  storageUsed: string;
  storageTotal: string;
  storagePercent: number;
  resolution: string;
  density: string;
  ip: string;
  mac: string;
  ssid: string;
  uptime: string;
}

const emptyInfo = (): DashboardInfo => ({
  model: "…",
  brand: "…",
  manufacturer: "…",
  version: "…",
  sdk: "…",
  build: "…",
  securityPatch: "…",
  abi: "…",
  cpu: "…",
  cpuLoad: 0,
  batteryLevel: 0,
  batteryStatus: "…",
  batteryTemp: "…",
  batteryHealth: "…",
  ramUsed: "…",
  ramTotal: "…",
  ramPercent: 0,
  storageUsed: "…",
  storageTotal: "…",
  storagePercent: 0,
  resolution: "…",
  density: "…",
  ip: "…",
  mac: "…",
  ssid: "…",
  uptime: "…",
});

const BATTERY_STATUS: Record<string, string> = {
  "1": "Unknown",
  "2": "Charging",
  "3": "Discharging",
  "4": "Not charging",
  "5": "Full",
};

const BATTERY_HEALTH: Record<string, string> = {
  "1": "Unknown",
  "2": "Good",
  "3": "Overheat",
  "4": "Dead",
  "5": "Over voltage",
  "6": "Failure",
  "7": "Cold",
};

const Sparkline: Component<{ values: number[]; color?: string }> = (props) => {
  const points = createMemo(() => {
    const values = props.values;
    if (values.length < 2) return "";
    const max = Math.max(...values, 1);
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * 100;
        const y = 30 - (value / max) * 27 - 1.5;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  });

  return (
    <svg class="sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points()}
        fill="none"
        stroke={props.color || "var(--red)"}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
};

const QUICK_SCRIPT = [
  "echo __PROPS__; getprop",
  "echo __BATTERY__; dumpsys battery",
  "echo __MEM__; cat /proc/meminfo",
  "echo __WM__; wm size; wm density",
  "echo __NET__; ip -f inet addr show wlan0; ip link show wlan0",
  "echo __CPU__; dumpsys cpuinfo",
  "echo __STORAGE__; df /data",
  "echo __UPTIME__; uptime",
  "echo __WIFI__; dumpsys wifi | head -n 80",
  "echo __END__",
].join("; ");

export const DashboardTab: Component = () => {
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [info, setInfo] = createSignal<DashboardInfo>(emptyInfo());
  const [loading, setLoading] = createSignal(false);
  const [lastUpdated, setLastUpdated] = createSignal<number | null>(null);
  const [history, setHistory] = createSignal<Array<{ cpu: number; ram: number }>>([]);

  let timer: ReturnType<typeof setInterval> | undefined;
  let requestSeq = 0;
  let lastDevice: string | null = null;

  const device = () =>
    state.currentDevice ? state.deviceInfo[state.currentDevice] : null;
  const online = () => device()?.state === "device";

  const closeDropdown = () => setDropdownOpen(false);

  const fetchData = async () => {
    const serial = state.currentDevice;
    if (!serial) {
      setInfo(emptyInfo());
      setHistory([]);
      setLastUpdated(null);
      return;
    }

    const seq = ++requestSeq;
    setLoading(true);

    const res = await runCommand("adb", ["shell", QUICK_SCRIPT], {
      background: true,
      quiet: true,
      key: "dashboard",
      timeout: 45_000,
    });

    if (seq !== requestSeq) return;
    setLoading(false);

    if (!res) {
      if (seq === requestSeq) setInfo((prev) => ({ ...emptyInfo(), model: prev.model }));
      return;
    }

    const data = res[0];
    const section = (tag: string) => {
      const match = data.match(
        new RegExp(`__${tag}__\\r?\\n([\\s\\S]*?)(?=\\r?\\n__[A-Z_]+__|$)`)
      );
      return match ? match[1] : "";
    };

    const props: Record<string, string> = {};
    section("PROPS").replace(/\[([^\]]+)\]:\s*\[([^\]]*)\]/g, (_, key, value) => {
      props[key] = value;
      return "";
    });

    const batteryRaw = section("BATTERY");
    const batteryLevel = parseInt(batteryRaw.match(/level:\s*(\d+)/)?.[1] || "0", 10);
    const statusCode = batteryRaw.match(/status:\s*(\d+)/)?.[1] || "1";
    const healthCode = batteryRaw.match(/health:\s*(\d+)/)?.[1] || "1";
    const temperature = batteryRaw.match(/temperature:\s*(-?\d+)/)?.[1];

    const memoryRaw = section("MEM");
    const totalRamKB = parseInt(memoryRaw.match(/MemTotal:\s+(\d+)/)?.[1] || "0", 10);
    const availableRamKB = parseInt(memoryRaw.match(/MemAvailable:\s+(\d+)/)?.[1] || "0", 10);
    const ramPercent =
      totalRamKB > 0 ? ((totalRamKB - availableRamKB) / totalRamKB) * 100 : 0;

    const wmRaw = section("WM");
    const netRaw = section("NET");
    const cpuRaw = section("CPU");
    const storageRaw = section("STORAGE");
    const wifiRaw = section("WIFI");

    const storageLine =
      storageRaw
        .split("\n")
        .map((line) => line.trim().split(/\s+/))
        .find((parts) => parts.length >= 6 && parts[parts.length - 1] === "/data") ||
      storageRaw.split("\n")[1]?.trim().split(/\s+/);

    const storageTotalKb = parseInt(storageLine?.[1] || "0", 10);
    const storageUsedKb = parseInt(storageLine?.[2] || "0", 10);

    const cpuLoad = parseFloat(cpuRaw.match(/Load:\s*([\d.]+)/)?.[1] || "0");
    const ssid =
      wifiRaw.match(/mWifiInfo\s+SSID:\s*"([^"]*)"/)?.[1] ||
      wifiRaw.match(/SSID:\s*"([^"]*)"/)?.[1] ||
      "—";

    const nextInfo: DashboardInfo = {
      model: props["ro.product.model"] || "Unknown",
      brand: props["ro.product.brand"] || "Unknown",
      manufacturer: props["ro.product.manufacturer"] || "Unknown",
      version: props["ro.build.version.release"] || "?",
      sdk: props["ro.build.version.sdk"] || "?",
      build: props["ro.build.display.id"] || "Unknown",
      securityPatch: props["ro.build.version.security_patch"] || "Unknown",
      abi: props["ro.product.cpu.abi"] || "Unknown",
      cpu: cpuLoad ? cpuLoad.toFixed(1) : "—",
      cpuLoad,
      batteryLevel,
      batteryStatus: BATTERY_STATUS[statusCode] || "Unknown",
      batteryTemp: temperature !== undefined ? `${(parseInt(temperature, 10) / 10).toFixed(1)}°C` : "—",
      batteryHealth: BATTERY_HEALTH[healthCode] || "Unknown",
      ramUsed: (totalRamKB - availableRamKB > 0
        ? ((totalRamKB - availableRamKB) / 1024 / 1024).toFixed(2)
        : "0") + " GB",
      ramTotal: (totalRamKB / 1024 / 1024).toFixed(2) + " GB",
      ramPercent: Number(ramPercent.toFixed(1)),
      storageUsed: (storageUsedKb / 1024 / 1024).toFixed(1),
      storageTotal: (storageTotalKb / 1024 / 1024).toFixed(1),
      storagePercent:
        storageTotalKb > 0
          ? Number(((storageUsedKb / storageTotalKb) * 100).toFixed(1))
          : 0,
      resolution: wmRaw.match(/Physical size:\s*([\dx]+)/)?.[1] || "—",
      density: wmRaw.match(/Physical density:\s*(\d+)/)?.[1]
        ? `${wmRaw.match(/Physical density:\s*(\d+)/)?.[1]} dpi`
        : "—",
      ip: netRaw.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)?.[1] || "—",
      mac: netRaw.match(/link\/ether\s+([\da-fA-F:]+)/)?.[1] || "—",
      ssid: ssid && ssid !== "<unknown ssid>" ? ssid : "—",
      uptime: formatUptime(section("UPTIME")),
    };

    setInfo(nextInfo);
    setLastUpdated(Date.now());
    setHistory((prev) =>
      [
        ...prev,
        {
          cpu: Number.isFinite(cpuLoad) ? cpuLoad : 0,
          ram: nextInfo.ramPercent,
        },
      ].slice(-28)
    );
  };

  const refreshAll = async () => {
    await refreshDevices({ quiet: false });
    await fetchData();
  };

  createEffect(() => {
    const serial = state.currentDevice;
    if (serial !== lastDevice) {
      lastDevice = serial;
      setHistory([]);
      setInfo(emptyInfo());
      if (serial) void fetchData();
    }
  });

  createEffect(() => {
    const active = state.activeTab === "dashboard-tab";
    const enabled = state.preferences.autoRefresh;
    const interval = Math.max(3, state.preferences.refreshInterval) * 1000;

    if (timer) clearInterval(timer);
    timer = undefined;

    if (active && enabled && state.currentDevice) {
      timer = setInterval(() => {
        void fetchData();
      }, interval);
    }
  });

  onMount(() => {
    void refreshDevices({ quiet: true });

    const onRefresh = () => void refreshAll();
    const onScreenshot = () => void captureScreenshot("preview");
    const onClick = () => closeDropdown();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDropdown();
    };

    window.addEventListener("ascend:refresh", onRefresh);
    window.addEventListener("ascend:screenshot", onScreenshot);
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);

    onCleanup(() => {
      if (timer) clearInterval(timer);
      window.removeEventListener("ascend:refresh", onRefresh);
      window.removeEventListener("ascend:screenshot", onScreenshot);
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    });
  });

  const batteryTone = () =>
    info().batteryLevel <= 20 ? "danger" : info().batteryLevel <= 45 ? "warning" : "good";

  const updatedLabel = () => {
    const stamp = lastUpdated();
    if (!stamp) return "Waiting for device";
    return `Updated ${new Date(stamp).toLocaleTimeString()}`;
  };

  return (
    <div
      id="dashboard-tab"
      class={`tab-content ${state.activeTab === "dashboard-tab" ? "active" : ""}`}
    >
      <div class="dashboard-grid">
        <div class="card device-control-card">
          <div class="custom-dropdown" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              class={`dropdown-selected ${dropdownOpen() ? "open" : ""}`}
              onClick={() => setDropdownOpen(!dropdownOpen())}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen()}
            >
              <span class="dropdown-device">
                <span
                  class={`status-dot ${state.currentDevice ? (online() ? "online" : "warning") : "offline"}`}
                />
                <span id="selected-device-text">
                  {state.currentDevice
                    ? device()?.model || state.currentDevice
                    : state.currentDeviceList.length > 0
                      ? "Select a device…"
                      : "Scanning for devices…"}
                </span>
                <Show when={state.currentDevice}>
                  <small>{state.currentDevice}</small>
                </Show>
              </span>
              <i class="fa-solid fa-chevron-down" />
            </button>

            <div class={`dropdown-menu ${dropdownOpen() ? "open" : ""}`} role="listbox">
              <Show
                when={state.currentDeviceList.length > 0}
                fallback={
                  <div class="dropdown-empty">
                    <i class="fa-solid fa-plug-circle-xmark" /> No devices detected
                  </div>
                }
              >
                <For each={state.currentDeviceList}>
                  {(serial) => {
                    const entry = () => state.deviceInfo[serial];
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={state.currentDevice === serial}
                        class={cx(
                          "dropdown-item device-option",
                          state.currentDevice === serial && "selected"
                        )}
                        onClick={() => {
                          selectDevice(serial);
                          setDropdownOpen(false);
                          void fetchData();
                        }}
                      >
                        <span
                          class={`status-dot ${entry()?.state === "device" ? "online" : "warning"}`}
                        />
                        <span class="device-option-text">
                          <strong>{entry()?.model || serial}</strong>
                          <small>
                            {serial} · {deviceStateLabel(entry()?.state || "unknown")}
                          </small>
                        </span>
                        <Show when={state.currentDevice === serial}>
                          <i class="fa-solid fa-check" />
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </Show>
            </div>
          </div>

          <div class="dashboard-controls">
            <label class="auto-refresh-toggle" title="Refresh device stats automatically">
              <span>Live</span>
              <ToggleSwitch
                checked={state.preferences.autoRefresh}
                onChange={(checked) => updatePreference("autoRefresh", checked)}
                label="Auto refresh dashboard"
              />
            </label>

            <span class="updated-label">{updatedLabel()}</span>

            <button
              id="refresh-devices-btn"
              class="btn-secondary"
              title="Refresh device list and stats"
              onClick={() => void refreshAll()}
              disabled={loading()}
            >
              <i class={`fa-solid fa-arrows-rotate ${loading() ? "fa-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <Show
          when={state.currentDevice}
          fallback={
            <div class="card dashboard-empty-card">
              <EmptyState
                icon="fa-solid fa-mobile-screen-button"
                title="No device connected"
                description="Connect over USB with a guided setup, or pair a device wirelessly from the same network."
              >
                <button class="btn-primary" onClick={() => openConnect("usb")}>
                  <i class="fa-solid fa-plug-circle-plus" /> Connect over USB
                </button>
                <button class="btn-secondary" onClick={() => openConnect("wireless")}>
                  <i class="fa-solid fa-wifi" /> Wireless pairing
                </button>
                <button class="link-btn" onClick={() => void refreshDevices({ quiet: false })}>
                  <i class="fa-solid fa-rotate" /> Scan again
                </button>
              </EmptyState>
            </div>
          }
        >
          <Show when={!online()}>
            <div class="card dashboard-warning">
              <i class="fa-solid fa-triangle-exclamation" />
              <div>
                <strong>Device is {deviceStateLabel(device()?.state || "unavailable")}</strong>
                <p>
                  {device()?.state === "unauthorized"
                    ? "Unlock the device and accept the “Allow USB debugging?” prompt."
                    : "Reconnect the cable or restart the ADB server from the command palette."}
                </p>
              </div>
              <button class="btn-secondary" onClick={() => void refreshAll()}>
                Retry
              </button>
            </div>
          </Show>

          <div class="card hero-card">
            <div class="hero-main">
              <div class="hero-kicker">
                <span class="status-dot online" /> Connected
              </div>
              <h2>{info().model}</h2>
              <p class="hero-subtitle">
                {info().manufacturer} · Android {info().version} (API {info().sdk})
              </p>
              <div class="hero-tags">
                <span class="chip"><i class="fa-solid fa-microchip" /> {info().abi}</span>
                <span class="chip"><i class="fa-solid fa-fingerprint" /> {info().build}</span>
                <span class="chip">
                  <i class="fa-solid fa-shield-halved" /> Patch {info().securityPatch}
                </span>
              </div>
              <div class="hero-actions">
                <button class="btn-primary" onClick={() => void captureScreenshot("preview")}>
                  <i class="fa-solid fa-camera" /> Screenshot
                </button>
                <button
                  class="btn-secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `Model: ${info().model}\nBrand: ${info().brand}\nAndroid: ${info().version} (API ${info().sdk})\nBuild: ${info().build}\nSerial: ${state.currentDevice}`
                    );
                  }}
                >
                  <i class="fa-regular fa-copy" /> Copy summary
                </button>
              </div>
            </div>

            <div class={`battery-ring ${batteryTone()}`} style={`--level: ${info().batteryLevel}%`}>
              <div class="battery-ring-inner">
                <strong>{info().batteryLevel}%</strong>
                <span>{info().batteryStatus}</span>
              </div>
            </div>
          </div>

          <div class="card info-card">
            <div class="card-header">
              <i class="fa-solid fa-microchip" /> System
            </div>
            <div class="card-content">
              <div class="info-line">
                <span>CPU load</span>
                <strong>{info().cpu}</strong>
              </div>
              <Sparkline values={history().map((entry) => entry.cpu)} />
              <div class="info-line">
                <span>Battery temp</span>
                <strong>{info().batteryTemp}</strong>
              </div>
              <div class="info-line">
                <span>Battery health</span>
                <strong>{info().batteryHealth}</strong>
              </div>
              <div class="info-line">
                <span>Uptime</span>
                <strong title={info().uptime}>{info().uptime}</strong>
              </div>
            </div>
          </div>

          <div class="card info-card">
            <div class="card-header">
              <i class="fa-solid fa-memory" /> Memory & Storage
            </div>
            <div class="card-content">
              <div class="info-line">
                <span>RAM</span>
                <strong>
                  {info().ramUsed} / {info().ramTotal}
                </strong>
              </div>
              <div class="progress-bar">
                <div class="progress-bar-fill" style={{ width: `${info().ramPercent}%` }} />
              </div>
              <Sparkline values={history().map((entry) => entry.ram)} color="#22d3ee" />

              <div class="info-line" style={{ "margin-top": "6px" }}>
                <span>Storage (/data)</span>
                <strong>
                  {info().storageUsed} / {info().storageTotal} GB
                </strong>
              </div>
              <div class="progress-bar">
                <div
                  class="progress-bar-fill storage"
                  style={{ width: `${info().storagePercent}%` }}
                />
              </div>
            </div>
          </div>

          <div class="card info-card">
            <div class="card-header">
              <i class="fa-solid fa-wifi" /> Network
            </div>
            <div class="card-content">
              <div class="info-line">
                <span>Wi-Fi</span>
                <strong title={info().ssid}>{info().ssid}</strong>
              </div>
              <div class="info-line">
                <span>IP address</span>
                <span class="info-value-with-copy">
                  <strong>{info().ip}</strong>
                  <CopyButton value={info().ip} label="IP address" />
                </span>
              </div>
              <div class="info-line">
                <span>MAC address</span>
                <span class="info-value-with-copy">
                  <strong>{info().mac}</strong>
                  <CopyButton value={info().mac} label="MAC address" />
                </span>
              </div>
            </div>
          </div>

          <div class="card info-card">
            <div class="card-header">
              <i class="fa-solid fa-display" /> Display
            </div>
            <div class="card-content">
              <div class="info-line">
                <span>Resolution</span>
                <strong>{info().resolution}</strong>
              </div>
              <div class="info-line">
                <span>Density</span>
                <strong>{info().density}</strong>
              </div>
              <div class="info-line">
                <span>Serial</span>
                <span class="info-value-with-copy">
                  <strong>{state.currentDevice}</strong>
                  <CopyButton value={state.currentDevice || ""} label="serial" />
                </span>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
