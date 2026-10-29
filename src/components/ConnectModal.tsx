import {
  Component,
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import {
  state,
  setState,
  refreshDevices,
  selectDevice,
  loadTools,
  runCommand,
  toast,
  openToolsSetup,
} from "../stateStore";
import {
  connectWirelessDevice,
  detectDeviceWifiIp,
  disconnectWirelessDevice,
  enableWirelessOnUsb,
  pairWirelessDevice,
} from "../actions";
import { deviceStateLabel } from "../utils";

type ConnectTab = "usb" | "wireless";
type WirelessMode = "pair" | "connect";
type Feedback = { tone: "success" | "error" | "info" | "warning"; text: string };

export const ConnectModal: Component = () => {
  const [tab, setTab] = createSignal<ConnectTab>("usb");
  const [mode, setMode] = createSignal<WirelessMode>("pair");
  const [ip, setIp] = createSignal("");
  const [port, setPort] = createSignal("5555");
  const [pairPort, setPairPort] = createSignal("");
  const [pairCode, setPairCode] = createSignal("");
  const [busy, setBusy] = createSignal<string | null>(null);
  const [scanning, setScanning] = createSignal(false);
  const [lastScan, setLastScan] = createSignal<number | null>(null);
  const [feedback, setFeedback] = createSignal<Feedback | null>(null);
  let ipRef: HTMLInputElement | undefined;

  const devices = () =>
    state.currentDeviceList
      .map((serial) => state.deviceInfo[serial])
      .filter((device) => Boolean(device));

  const selected = () => (state.currentDevice ? state.deviceInfo[state.currentDevice] : null);
  const onlineCount = () => devices().filter((device) => device.state === "device").length;
  const toolsMissing = () => !state.tools.adb;

  const scan = async (quiet = true) => {
    if (scanning()) return;
    setScanning(true);
    try {
      await refreshDevices({ quiet });
      setLastScan(Date.now());
    } finally {
      setScanning(false);
    }
  };

  const close = () => {
    setState("connectOpen", false);
    setBusy(null);
  };

  const switchTab = (next: ConnectTab) => {
    setTab(next);
    setFeedback(null);
    if (next === "wireless") {
      if (!ip().trim() && state.currentDevice) void autoDetectIp();
      setTimeout(() => ipRef?.focus(), 30);
    }
  };

  const autoDetectIp = async () => {
    if (!state.currentDevice || ip().trim()) return;
    const detected = await detectDeviceWifiIp();
    if (detected) setIp(detected);
  };

  const prefillFromDevice = () => {
    const serial = state.currentDevice;
    if (!serial) return;
    const [host, serialPort] = serial.split(":");
    if (host && /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      setIp(host);
      if (serialPort) setPort(serialPort);
    }
  };

  createEffect(() => {
    if (!state.connectOpen) return;

    // Keep signal reads from scan() out of this effect's dependency graph.
    untrack(() => {
      setTab(state.connectTab);
      setFeedback(null);
      setBusy(null);
      prefillFromDevice();
      if (state.connectTab === "wireless" && !ip().trim() && state.currentDevice) {
        void autoDetectIp();
      }
      void scan(true);
    });

    const timer = setInterval(() => {
      if (state.connectOpen && !scanning()) void scan(true);
    }, 3000);

    onCleanup(() => clearInterval(timer));
  });

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state.connectOpen) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const detectIp = async () => {
    if (!state.currentDevice) {
      setFeedback({
        tone: "warning",
        text: "Connect the device over USB first, then Ascend can read its Wi-Fi address.",
      });
      return;
    }

    setBusy("detect");
    const detected = await detectDeviceWifiIp();
    setBusy(null);

    if (detected) {
      setIp(detected);
      setFeedback({ tone: "success", text: `Detected device IP ${detected}.` });
      toast(`Device IP detected: ${detected}`, "success");
    } else {
      setFeedback({
        tone: "warning",
        text: "Could not read a Wi-Fi IP. Make sure the device is connected to Wi-Fi.",
      });
    }
  };

  const validateEndpoint = (): boolean => {
    if (!ip().trim()) {
      setFeedback({ tone: "warning", text: "Enter the IP address shown on the device." });
      return false;
    }
    const value = parseInt(port().trim(), 10);
    if (!Number.isFinite(value) || value < 1 || value > 65535) {
      setFeedback({ tone: "warning", text: "Enter a valid port between 1 and 65535." });
      return false;
    }
    return true;
  };

  const pair = async () => {
    if (!ip().trim() || !pairPort().trim() || !pairCode().trim()) {
      setFeedback({
        tone: "warning",
        text: "Enter the IP, pairing port, and six-digit code shown under Wireless debugging → Pair device with pairing code.",
      });
      return;
    }

    const pairingPort = parseInt(pairPort().trim(), 10);
    if (!Number.isFinite(pairingPort) || pairingPort < 1 || pairingPort > 65535) {
      setFeedback({ tone: "warning", text: "Enter a valid pairing port between 1 and 65535." });
      return;
    }
    if (!/^\d{6}$/.test(pairCode().trim())) {
      setFeedback({ tone: "warning", text: "The pairing code is six digits long." });
      return;
    }

    setBusy("pair");
    setFeedback(null);
    const result = await pairWirelessDevice(ip(), pairPort(), pairCode());
    setBusy(null);

    if (!result.ok) {
      setFeedback({ tone: "error", text: result.message });
      return;
    }

    setPairPort("");
    setPairCode("");
    setMode("connect");
    setPort("");
    setFeedback({
      tone: "success",
      text: "Paired successfully. Enter the port shown on the Wireless debugging screen, then tap Connect.",
    });
    setTimeout(() => ipRef?.focus(), 30);
  };

  const connect = async () => {
    if (!validateEndpoint()) return;

    setBusy("connect");
    setFeedback(null);
    const result = await connectWirelessDevice(ip(), port());
    setBusy(null);

    if (!result.ok) {
      setFeedback({ tone: "error", text: result.message });
      return;
    }

    await refreshDevices({ quiet: true });
    setFeedback({
      tone: "success",
      text: `Connected to ${ip().trim()}:${port().trim() || "5555"}. The device is now available in every tab.`,
    });
    toast("Wireless device connected", "success");
  };

  const enableOverUsb = async () => {
    setBusy("enable");
    setFeedback(null);
    const result = await enableWirelessOnUsb(port().trim() || "5555");
    if (!result.ok) {
      setBusy(null);
      setFeedback({ tone: "error", text: result.message });
      return;
    }

    const detected = await detectDeviceWifiIp();
    if (detected) setIp(detected);
    setBusy(null);
    setFeedback({
      tone: "success",
      text: `Wireless ADB enabled on port ${port().trim() || "5555"}${
        detected ? ` at ${detected}` : ""
      }. Unplug USB, then connect.`,
    });
  };

  const disconnect = async () => {
    if (!ip().trim()) {
      setFeedback({ tone: "warning", text: "Enter the wireless address to disconnect." });
      return;
    }

    setBusy("disconnect");
    const result = await disconnectWirelessDevice(`${ip().trim()}:${port().trim() || "5555"}`);
    setBusy(null);
    setFeedback({
      tone: result.ok ? "info" : "error",
      text: result.message,
    });
    if (result.ok) await refreshDevices({ quiet: true });
  };

  const restartAdb = async () => {
    setBusy("restart");
    setFeedback(null);
    const stopped = await runCommand("adb", ["kill-server"], { background: true, quiet: true });
    const started = await runCommand("adb", ["start-server"], { background: true, quiet: true });
    if (!stopped || !started) {
      await loadTools(true);
      setBusy(null);
      setFeedback({
        tone: "error",
        text: "Could not restart ADB. Open Settings → Tools and re-check the bundled toolchain.",
      });
      return;
    }
    await scan(false);
    setBusy(null);
    setFeedback({ tone: "info", text: "ADB server restarted." });
  };

  const recheckTools = async () => {
    setBusy("tools");
    const tools = await loadTools(true);
    setBusy(null);
    setFeedback({
      tone: tools.adb ? "success" : "error",
      text: tools.adb
        ? `ADB detected: ${tools.adb}`
        : "ADB is still not detected. Make sure bin/adb.exe exists next to the app.",
    });
  };

  const scanLabel = () => {
    if (scanning()) return "Scanning…";
    const stamp = lastScan();
    if (!stamp) return "Ready to scan";
    return `Last scan ${new Date(stamp).toLocaleTimeString()}`;
  };

  return (
    <Show when={state.connectOpen}>
      <div
        id="connect-modal"
        class="modal-overlay active"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div class="modal-window connect-window" role="dialog" aria-modal="true" aria-labelledby="connect-title">
          <div class="modal-header">
            <h2 id="connect-title">
              <i class="fa-solid fa-plug-circle-plus" /> Connect a device
            </h2>
            <button class="modal-close-btn" aria-label="Close connection center" onClick={close}>
              <i class="fa-solid fa-xmark" />
            </button>
          </div>

          <div class="connect-tabs" role="tablist" aria-label="Connection type">
            <button
              type="button"
              role="tab"
              aria-selected={tab() === "usb"}
              class={`connect-tab ${tab() === "usb" ? "active" : ""}`}
              onClick={() => switchTab("usb")}
            >
              <i class="fa-brands fa-usb" />
              <span>USB</span>
              <Show when={onlineCount() > 0}>
                <span class="connect-tab-badge">{onlineCount()}</span>
              </Show>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab() === "wireless"}
              class={`connect-tab ${tab() === "wireless" ? "active" : ""}`}
              onClick={() => switchTab("wireless")}
            >
              <i class="fa-solid fa-wifi" />
              <span>Wireless debugging</span>
            </button>
          </div>

          <div class="connect-body">
            <Show when={toolsMissing()}>
              <div class="connect-note warning">
                <i class="fa-solid fa-triangle-exclamation" />
                <div class="connect-note-text">
                  <strong>ADB was not detected</strong>
                  <span>The bundled toolchain could not be started. Install tools or re-check before connecting.</span>
                </div>
                <button
                  class="btn-primary small"
                  onClick={() => {
                    close();
                    openToolsSetup();
                  }}
                >
                  <i class="fa-solid fa-download" /> Setup Tools
                </button>
                <button class="btn-secondary small" onClick={() => void recheckTools()}>
                  Re-check
                </button>
              </div>
            </Show>

            <Show when={feedback()}>
              {(entry) => (
                <div class={`connect-feedback ${entry().tone}`} role="status">
                  <i
                    class={`fa-solid ${
                      entry().tone === "success"
                        ? "fa-circle-check"
                        : entry().tone === "warning"
                          ? "fa-triangle-exclamation"
                          : entry().tone === "error"
                            ? "fa-circle-xmark"
                            : "fa-circle-info"
                    }`}
                  />
                  <span>{entry().text}</span>
                  <button
                    class="icon-btn"
                    aria-label="Dismiss message"
                    onClick={() => setFeedback(null)}
                  >
                    <i class="fa-solid fa-xmark" />
                  </button>
                </div>
              )}
            </Show>

            <Show when={tab() === "usb"}>
              <div class="connect-section-head">
                <div>
                  <strong>USB connection</strong>
                  <span>{scanLabel()}</span>
                </div>
                <button
                  class="btn-secondary small"
                  onClick={() => void scan(false)}
                  disabled={scanning()}
                >
                  <i class={`fa-solid fa-arrows-rotate ${scanning() ? "fa-spin" : ""}`} /> Scan
                </button>
              </div>

              <Show when={devices().length > 0} fallback={<UsbChecklist />}>
                <div class="connect-device-list">
                  <For each={devices()}>
                    {(device) => {
                      const isSelected = () => state.currentDevice === device.serial;
                      const online = () => device.state === "device";
                      return (
                        <button
                          type="button"
                          class={`connect-device ${isSelected() ? "selected" : ""} ${
                            online() ? "online" : "warning"
                          }`}
                          onClick={() => selectDevice(device.serial)}
                        >
                          <span class={`status-dot ${online() ? "online" : "warning"}`} />
                          <span class="connect-device-text">
                            <strong>{device.model || device.serial}</strong>
                            <span>
                              {device.serial} · {deviceStateLabel(device.state)}
                            </span>
                          </span>
                          <Show
                            when={isSelected()}
                            fallback={<span class="connect-device-select">Use</span>}
                          >
                            <i class="fa-solid fa-circle-check" />
                          </Show>
                        </button>
                      );
                    }}
                  </For>
                </div>

                <Show when={selected()?.state === "unauthorized"}>
                  <div class="connect-note warning">
                    <i class="fa-solid fa-shield-halved" />
                    <div>
                      <strong>Authorization needed</strong>
                      <span>
                        Look at the device and tap <b>Allow</b> on the “Allow USB debugging?” prompt.
                        Tick “Always allow” to avoid repeating this.
                      </span>
                    </div>
                  </div>
                </Show>

                <Show when={selected()?.state === "offline"}>
                  <div class="connect-note warning">
                    <i class="fa-solid fa-plug-circle-xmark" />
                    <div>
                      <strong>Device is offline</strong>
                      <span>Reconnect the USB cable, then tap Scan. Restarting ADB often helps too.</span>
                    </div>
                  </div>
                </Show>

                <Show when={selected()?.state === "device"}>
                  <div class="connect-note success">
                    <i class="fa-solid fa-circle-check" />
                    <div>
                      <strong>{selected()?.model || "Device"} is ready</strong>
                      <span>Close this panel and use any tab. You can also switch to wireless debugging.</span>
                    </div>
                  </div>
                </Show>
              </Show>

              <details class="connect-help">
                <summary>Not showing up? Check these USB steps</summary>
                <UsbChecklist detailed />
              </details>
            </Show>

            <Show when={tab() === "wireless"}>
              <div class="connect-segment" role="group" aria-label="Wireless connection mode">
                <button
                  type="button"
                  class={`segment-btn ${mode() === "pair" ? "active" : ""}`}
                  onClick={() => {
                    setMode("pair");
                    setFeedback(null);
                  }}
                >
                  <i class="fa-solid fa-link" /> Pair new device
                </button>
                <button
                  type="button"
                  class={`segment-btn ${mode() === "connect" ? "active" : ""}`}
                  onClick={() => {
                    setMode("connect");
                    setFeedback(null);
                  }}
                >
                  <i class="fa-solid fa-tower-broadcast" /> Connect
                </button>
              </div>

              <Show when={mode() === "pair"}>
                <p class="connect-copy">
                  On the phone, open <b>Developer options → Wireless debugging</b> and choose{" "}
                  <b>Pair device with pairing code</b>. Keep this panel open; the code expires quickly.
                </p>
              </Show>

              <div class="connect-form">
                <label class="field-label">
                  <span>Device IP address</span>
                  <div class="input-inline">
                    <input
                      ref={ipRef}
                      type="text"
                      inputmode="decimal"
                      placeholder="192.168.1.42"
                      value={ip()}
                      onInput={(event) => setIp(event.currentTarget.value)}
                      aria-label="Device IP address"
                    />
                    <button
                      class="icon-btn"
                      title="Detect the Wi-Fi IP from the USB-connected device"
                      aria-label="Detect device IP"
                      onClick={() => void detectIp()}
                      disabled={busy() === "detect"}
                    >
                      <i
                        class={`fa-solid ${
                          busy() === "detect" ? "fa-circle-notch fa-spin" : "fa-location-crosshairs"
                        }`}
                      />
                    </button>
                  </div>
                </label>

                <Show
                  when={mode() === "pair"}
                  fallback={
                    <label class="field-label">
                      <span>Connection port</span>
                      <input
                        type="text"
                        inputmode="numeric"
                        placeholder="5555"
                        value={port()}
                        onInput={(event) => setPort(event.currentTarget.value)}
                        aria-label="Wireless connection port"
                      />
                    </label>
                  }
                >
                  <div class="input-grid-2">
                    <label class="field-label">
                      <span>Pairing port</span>
                      <input
                        type="text"
                        inputmode="numeric"
                        placeholder="37123"
                        value={pairPort()}
                        onInput={(event) => setPairPort(event.currentTarget.value)}
                        aria-label="Wireless pairing port"
                      />
                    </label>
                    <label class="field-label">
                      <span>Pairing code</span>
                      <input
                        type="text"
                        inputmode="numeric"
                        placeholder="123456"
                        maxLength={6}
                        value={pairCode()}
                        onInput={(event) => setPairCode(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void pair();
                        }}
                        aria-label="Six digit wireless pairing code"
                      />
                    </label>
                  </div>
                </Show>
              </div>

              <div class="connect-actions">
                <Show
                  when={mode() === "pair"}
                  fallback={
                    <>
                      <button class="btn-primary" onClick={() => void connect()} disabled={!!busy()}>
                        <i
                          class={`fa-solid ${
                            busy() === "connect" ? "fa-circle-notch fa-spin" : "fa-link"
                          }`}
                        />{" "}
                        Connect
                      </button>
                      <button
                        class="btn-secondary"
                        onClick={() => void enableOverUsb()}
                        disabled={!!busy() || !state.currentDevice}
                        title="Run adb tcpip 5555 on the USB-connected device"
                      >
                        <i
                          class={`fa-solid ${
                            busy() === "enable" ? "fa-circle-notch fa-spin" : "fa-tower-broadcast"
                          }`}
                        />{" "}
                        Enable over USB
                      </button>
                      <button class="link-btn" onClick={() => void disconnect()} disabled={!!busy()}>
                        <i class="fa-solid fa-link-slash" /> Disconnect
                      </button>
                    </>
                  }
                >
                  <button class="btn-primary" onClick={() => void pair()} disabled={!!busy()}>
                    <i
                      class={`fa-solid ${
                        busy() === "pair" ? "fa-circle-notch fa-spin" : "fa-link"
                      }`}
                    />{" "}
                    Pair device
                  </button>
                </Show>
              </div>

              <div class="connect-note info">
                <i class="fa-solid fa-circle-info" />
                <div>
                  <strong>Same network required</strong>
                  <span>
                    The phone and this computer must be on the same Wi-Fi network. Pairing works on
                    Android 11 and newer; for older devices, switch to Connect and use “Enable over
                    USB”.
                  </span>
                </div>
              </div>
            </Show>
          </div>

          <div class="connect-footer">
            <button class="link-btn" onClick={() => void restartAdb()} disabled={!!busy()}>
              <i class="fa-solid fa-power-off" /> Restart ADB server
            </button>
            <span class="connect-footer-status">
              <span
                class={`status-dot ${state.currentDevice ? "online" : "offline"}`}
              />
              {state.currentDevice
                ? `${selected()?.model || state.currentDevice} · ${deviceStateLabel(
                    selected()?.state || "unknown"
                  )}`
                : "No device selected"}
            </span>
            <button class="btn-secondary" onClick={close}>
              Done
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

const UsbChecklist: Component<{ detailed?: boolean }> = (props) => (
  <ol class={`connect-steps ${props.detailed ? "detailed" : ""}`}>
    <li>
      <span class="step-number">1</span>
      <div>
        <strong>Enable Developer options</strong>
        <span>Settings → About phone → tap “Build number” seven times.</span>
      </div>
    </li>
    <li>
      <span class="step-number">2</span>
      <div>
        <strong>Turn on USB debugging</strong>
        <span>Settings → System → Developer options → enable “USB debugging”.</span>
      </div>
    </li>
    <li>
      <span class="step-number">3</span>
      <div>
        <strong>Plug in and authorize</strong>
        <span>
          Connect the USB cable, then tap <b>Allow</b> on the device when prompted. Use a data-capable
          cable and set the USB mode to File transfer if asked.
        </span>
      </div>
    </li>
    <Show when={props.detailed}>
      <li>
        <span class="step-number">4</span>
        <div>
          <strong>Still not detected?</strong>
          <span>
            Try another cable/port, revoke USB debugging authorizations, or restart the ADB server
            below.
          </span>
        </div>
      </li>
    </Show>
  </ol>
);
