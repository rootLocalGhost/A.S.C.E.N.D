import { Component, createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { state, setState, loadTools, log, toast } from "../stateStore";
import { processRunning, saveFileDialog, spawnProcess, stopProcess } from "../tauriApi";
import { copyText } from "../utils";
import { ToggleSwitch } from "./ui";

interface ScrcpyOptions {
  bitRate: string;
  maxSize: string;
  maxFps: string;
  fullscreen: boolean;
  turnScreenOff: boolean;
  showTouches: boolean;
  stayAwake: boolean;
  powerOffOnClose: boolean;
  alwaysOnTop: boolean;
  noAudio: boolean;
  windowTitle: string;
  record: boolean;
  recordPath: string;
}

const STORAGE_KEY = "ascend.scrcpy.options.v1";

const defaults: ScrcpyOptions = {
  bitRate: "8M",
  maxSize: "1024",
  maxFps: "60",
  fullscreen: false,
  turnScreenOff: false,
  showTouches: false,
  stayAwake: true,
  powerOffOnClose: false,
  alwaysOnTop: false,
  noAudio: false,
  windowTitle: "",
  record: false,
  recordPath: "",
};

function loadOptions(): ScrcpyOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

const presets: Array<{ id: string; label: string; icon: string; values: Partial<ScrcpyOptions> }> = [
  {
    id: "balanced",
    label: "Balanced",
    icon: "fa-solid fa-scale-balanced",
    values: { bitRate: "8M", maxSize: "1024", maxFps: "60", noAudio: false },
  },
  {
    id: "performance",
    label: "Performance",
    icon: "fa-solid fa-bolt",
    values: { bitRate: "4M", maxSize: "720", maxFps: "30", noAudio: true },
  },
  {
    id: "quality",
    label: "High quality",
    icon: "fa-solid fa-gem",
    values: { bitRate: "24M", maxSize: "0", maxFps: "60", noAudio: false },
  },
  {
    id: "recording",
    label: "Recording",
    icon: "fa-solid fa-circle-dot",
    values: { bitRate: "16M", maxSize: "1080", maxFps: "60", record: true, stayAwake: true },
  },
];

export const ScrcpyTab: Component = () => {
  const saved = loadOptions();
  const [bitRate, setBitRate] = createSignal(saved.bitRate);
  const [maxSize, setMaxSize] = createSignal(saved.maxSize);
  const [maxFps, setMaxFps] = createSignal(saved.maxFps);
  const [fullscreen, setFullscreen] = createSignal(saved.fullscreen);
  const [turnScreenOff, setTurnScreenOff] = createSignal(saved.turnScreenOff);
  const [showTouches, setShowTouches] = createSignal(saved.showTouches);
  const [stayAwake, setStayAwake] = createSignal(saved.stayAwake);
  const [powerOffOnClose, setPowerOffOnClose] = createSignal(saved.powerOffOnClose);
  const [alwaysOnTop, setAlwaysOnTop] = createSignal(saved.alwaysOnTop);
  const [noAudio, setNoAudio] = createSignal(saved.noAudio);
  const [windowTitle, setWindowTitle] = createSignal(saved.windowTitle);
  const [record, setRecord] = createSignal(saved.record);
  const [recordPath, setRecordPath] = createSignal(saved.recordPath);
  const [starting, setStarting] = createSignal(false);

  const options = (): ScrcpyOptions => ({
    bitRate: bitRate(),
    maxSize: maxSize(),
    maxFps: maxFps(),
    fullscreen: fullscreen(),
    turnScreenOff: turnScreenOff(),
    showTouches: showTouches(),
    stayAwake: stayAwake(),
    powerOffOnClose: powerOffOnClose(),
    alwaysOnTop: alwaysOnTop(),
    noAudio: noAudio(),
    windowTitle: windowTitle(),
    record: record(),
    recordPath: recordPath(),
  });

  createEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options()));
    } catch {
      /* preferences are best-effort */
    }
  });

  onMount(() => {
    void loadTools();
  });

  createEffect(() => {
    const pid = state.scrcpyPid;
    if (!pid) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const running = await processRunning(pid);
        if (!cancelled && !running && state.scrcpyPid === pid) {
          setState("scrcpyPid", null);
          log("Scrcpy window closed.", "INFO");
          toast("Scrcpy closed", "info");
        }
      } catch {
        // Older backend or a transient IPC failure; the Stop button still works.
      }
    }, 2500);

    onCleanup(() => {
      cancelled = true;
      clearInterval(timer);
    });
  });

  const buildArgs = (): string[] => {
    const args: string[] = [];
    if (state.currentDevice) args.push("-s", state.currentDevice);
    if (bitRate().trim()) args.push("--video-bit-rate", bitRate().trim());
    if (maxSize().trim() && maxSize().trim() !== "0") args.push("--max-size", maxSize().trim());
    if (maxFps().trim() && maxFps().trim() !== "0") args.push("--max-fps", maxFps().trim());
    if (fullscreen()) args.push("--fullscreen");
    if (turnScreenOff()) args.push("--turn-screen-off");
    if (showTouches()) args.push("--show-touches");
    if (stayAwake()) args.push("--stay-awake");
    if (powerOffOnClose()) args.push("--power-off-on-close");
    if (alwaysOnTop()) args.push("--always-on-top");
    if (noAudio()) args.push("--no-audio");
    if (windowTitle().trim()) args.push("--window-title", windowTitle().trim());
    if (record() && recordPath()) args.push("--record", recordPath());
    return args;
  };

  const validate = (): string | null => {
    if (!state.currentDevice) return "Connect and select a device first.";
    if (!state.tools.scrcpy) return "The bundled scrcpy executable was not found.";
    if (bitRate() && !/^\d+[KMG]?$/i.test(bitRate().trim())) {
      return "Bit rate must look like 8M, 800K, or 12000000.";
    }
    if (maxSize() && !/^\d+$/.test(maxSize().trim())) {
      return "Max size must be a number of pixels (0 keeps the native resolution).";
    }
    if (maxFps() && !/^\d+$/.test(maxFps().trim())) {
      return "Max FPS must be a number.";
    }
    return null;
  };

  const startScrcpy = async () => {
    if (state.scrcpyPid) {
      toast("Scrcpy is already running", "info");
      return;
    }
    const problem = validate();
    if (problem) {
      toast(problem, "warning");
      return;
    }

    if (record() && !recordPath()) {
      const destination = await saveFileDialog(
        `scrcpy-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`,
        [{ name: "MP4 video", extensions: ["mp4"] }]
      );
      if (!destination) return;
      setRecordPath(destination);
    }

    setStarting(true);
    try {
      const pid = await spawnProcess("scrcpy", buildArgs());
      setState("scrcpyPid", pid);
      log(`Scrcpy started (PID ${pid}).`, "SUCCESS");
      toast("Scrcpy is starting…", "success");
    } catch (error: any) {
      log(`Could not start scrcpy: ${error?.message || error}`, "ERROR");
      toast("Could not start scrcpy. Check the console for details.", "error");
    } finally {
      setStarting(false);
    }
  };

  const stopScrcpy = async () => {
    const pid = state.scrcpyPid;
    if (!pid) return;
    setStarting(true);
    try {
      await stopProcess(pid);
      setState("scrcpyPid", null);
      log("Scrcpy stopped.", "INFO");
      toast("Scrcpy stopped", "success");
    } catch (error: any) {
      toast("Could not stop the scrcpy process", "error");
      log(`Stop failed: ${error?.message || error}`, "ERROR");
    } finally {
      setStarting(false);
    }
  };

  const applyPreset = (values: Partial<ScrcpyOptions>) => {
    if (values.bitRate !== undefined) setBitRate(values.bitRate);
    if (values.maxSize !== undefined) setMaxSize(values.maxSize);
    if (values.maxFps !== undefined) setMaxFps(values.maxFps);
    if (values.noAudio !== undefined) setNoAudio(values.noAudio);
    if (values.record !== undefined) setRecord(values.record);
    if (values.stayAwake !== undefined) setStayAwake(values.stayAwake);
  };

  const reset = () => {
    setBitRate(defaults.bitRate);
    setMaxSize(defaults.maxSize);
    setMaxFps(defaults.maxFps);
    setFullscreen(defaults.fullscreen);
    setTurnScreenOff(defaults.turnScreenOff);
    setShowTouches(defaults.showTouches);
    setStayAwake(defaults.stayAwake);
    setPowerOffOnClose(defaults.powerOffOnClose);
    setAlwaysOnTop(defaults.alwaysOnTop);
    setNoAudio(defaults.noAudio);
    setWindowTitle(defaults.windowTitle);
    setRecord(defaults.record);
    setRecordPath(defaults.recordPath);
    toast("Scrcpy options reset", "info");
  };

  const commandPreview = () => `scrcpy ${buildArgs().join(" ")}`.replace(/\s+/g, " ");

  return (
    <div
      id="scrcpy-tab"
      class={`tab-content ${state.activeTab === "scrcpy-tab" ? "active" : ""}`}
    >
      <div class="scrcpy-hero card">
        <div class="scrcpy-hero-main">
          <div class="hero-kicker">
            <i class="fa-solid fa-satellite-dish" /> Low-latency mirroring
          </div>
          <h2>SCrcpy Control</h2>
          <p>
            Mirror and control your device from the desktop. Options are saved automatically and
            the command preview shows exactly what will run.
          </p>
          <div class="scrcpy-status-row">
            <span class={`tool-status ${state.tools.scrcpy ? "ok" : "missing"}`}>
              <i class={`fa-solid ${state.tools.scrcpy ? "fa-circle-check" : "fa-circle-xmark"}`} />
              {state.tools.scrcpy || "scrcpy not found"}
            </span>
            <span class={`tool-status ${state.currentDevice ? "ok" : "missing"}`}>
              <i class={`fa-solid ${state.currentDevice ? "fa-circle-check" : "fa-circle-xmark"}`} />
              {state.currentDevice || "No device selected"}
            </span>
            <Show when={state.scrcpyPid}>
              <span class="tool-status running">
                <span class="status-dot online" /> Running (PID {state.scrcpyPid})
              </span>
            </Show>
          </div>
        </div>

        <div class="scrcpy-launch">
          <Show
            when={state.scrcpyPid}
            fallback={
              <button
                class="btn-primary launch-btn"
                onClick={() => void startScrcpy()}
                disabled={starting()}
              >
                <i class={`fa-solid ${starting() ? "fa-circle-notch fa-spin" : "fa-play"}`} />
                {starting() ? "Starting…" : "Start mirroring"}
              </button>
            }
          >
            <button
              class="btn-danger launch-btn"
              onClick={() => void stopScrcpy()}
              disabled={starting()}
            >
              <i class={`fa-solid ${starting() ? "fa-circle-notch fa-spin" : "fa-stop"}`} />
              {starting() ? "Stopping…" : "Stop mirroring"}
            </button>
          </Show>
          <button class="btn-secondary" onClick={reset}>
            <i class="fa-solid fa-rotate-left" /> Reset
          </button>
        </div>
      </div>

      <div class="scrcpy-presets">
        <span class="preset-label">Presets</span>
        <For each={presets}>
          {(preset) => (
            <button class="preset-btn" onClick={() => applyPreset(preset.values)}>
              <i class={preset.icon} /> {preset.label}
            </button>
          )}
        </For>
      </div>

      <div class="controls-grid scrcpy-grid">
        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-sliders" /> Video & Recording
          </div>
          <div class="card-content">
            <div class="input-grid-3">
              <label class="field-label">
                <span>Bit rate</span>
                <input
                  type="text"
                  placeholder="8M"
                  value={bitRate()}
                  onInput={(event) => setBitRate(event.currentTarget.value)}
                />
              </label>
              <label class="field-label">
                <span>Max size (px)</span>
                <input
                  type="text"
                  placeholder="1024"
                  value={maxSize()}
                  onInput={(event) => setMaxSize(event.currentTarget.value)}
                />
              </label>
              <label class="field-label">
                <span>Max FPS</span>
                <input
                  type="text"
                  placeholder="60"
                  value={maxFps()}
                  onInput={(event) => setMaxFps(event.currentTarget.value)}
                />
              </label>
            </div>

            <label class="custom-checkbox">
              <ToggleSwitch checked={record()} onChange={setRecord} label="Record screen" />
              <span>Record screen to file</span>
            </label>

            <Show when={record()}>
              <div class="record-path-row">
                <input
                  type="text"
                  placeholder="Choose a recording destination…"
                  value={recordPath()}
                  onInput={(event) => setRecordPath(event.currentTarget.value)}
                />
                <button
                  class="btn-secondary"
                  onClick={async () => {
                    const destination = await saveFileDialog(
                      `scrcpy-${Date.now()}.mp4`,
                      [{ name: "MP4 video", extensions: ["mp4"] }]
                    );
                    if (destination) setRecordPath(destination);
                  }}
                >
                  <i class="fa-solid fa-folder-open" /> Browse
                </button>
              </div>
            </Show>

            <label class="custom-checkbox">
              <ToggleSwitch checked={fullscreen()} onChange={setFullscreen} label="Fullscreen" />
              <span>Start in fullscreen</span>
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-bolt" /> Device & Window
          </div>
          <div class="card-content">
            <label class="custom-checkbox">
              <ToggleSwitch
                checked={turnScreenOff()}
                onChange={setTurnScreenOff}
                label="Turn device screen off"
              />
              <span>Turn device screen off</span>
            </label>
            <label class="custom-checkbox">
              <ToggleSwitch checked={showTouches()} onChange={setShowTouches} label="Show touches" />
              <span>Show touches on device</span>
            </label>
            <label class="custom-checkbox">
              <ToggleSwitch checked={stayAwake()} onChange={setStayAwake} label="Keep awake" />
              <span>Keep device awake</span>
            </label>
            <label class="custom-checkbox">
              <ToggleSwitch
                checked={powerOffOnClose()}
                onChange={setPowerOffOnClose}
                label="Power off on close"
              />
              <span>Power off device on close</span>
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-window-maximize" /> Display & Audio
          </div>
          <div class="card-content">
            <label class="custom-checkbox">
              <ToggleSwitch checked={alwaysOnTop()} onChange={setAlwaysOnTop} label="Always on top" />
              <span>Keep mirror window on top</span>
            </label>
            <label class="custom-checkbox">
              <ToggleSwitch checked={noAudio()} onChange={setNoAudio} label="Disable audio forwarding" />
              <span>Disable audio forwarding</span>
            </label>
            <label class="field-label">
              <span>Window title</span>
              <input
                type="text"
                placeholder={`A.S.C.E.N.D. — ${state.currentDevice || "device"}`}
                value={windowTitle()}
                onInput={(event) => setWindowTitle(event.currentTarget.value)}
              />
            </label>
          </div>
        </div>
      </div>

      <div class="command-preview">
        <div class="command-preview-header">
          <span><i class="fa-solid fa-terminal" /> Command preview</span>
          <button
            class="icon-btn"
            title="Copy command"
            aria-label="Copy scrcpy command"
            onClick={async () => {
              const ok = await copyText(commandPreview());
              toast(ok ? "Command copied" : "Could not copy", ok ? "success" : "error");
            }}
          >
            <i class="fa-regular fa-copy" />
          </button>
        </div>
        <code>{commandPreview()}</code>
      </div>
    </div>
  );
};
