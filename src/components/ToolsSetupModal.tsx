import { Component, createSignal, onCleanup, onMount, Show } from "solid-js";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  state,
  closeToolsSetup,
  loadTools,
  toast,
  log,
  openConnect,
} from "../stateStore";
import {
  downloadPlatformTools,
  extractPlatformToolsZip,
  getSystemInfo,
  openFileDialog,
  type SetupProgress,
  type SystemInfo,
} from "../tauriApi";
import { formatBytes } from "../utils";

export const ToolsSetupModal: Component = () => {
  const [systemInfo, setSystemInfo] = createSignal<SystemInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = createSignal(false);
  const [installing, setInstalling] = createSignal(false);
  const [progress, setProgress] = createSignal<SetupProgress | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [completeMessage, setCompleteMessage] = createSignal<string | null>(null);

  const fetchInfo = async () => {
    setLoadingInfo(true);
    try {
      const info = await getSystemInfo();
      setSystemInfo(info);
    } catch (err: any) {
      log(`Failed to get system info: ${err?.message || err}`, "ERROR");
    } finally {
      setLoadingInfo(false);
    }
  };

  const close = () => {
    if (installing()) {
      toast("Tool installation in progress. Please wait…", "warning");
      return;
    }
    setError(null);
    setCompleteMessage(null);
    setProgress(null);
    closeToolsSetup();
  };

  const handleDownload = async () => {
    if (installing()) return;
    setInstalling(true);
    setError(null);
    setCompleteMessage(null);
    setProgress({
      percentage: 0,
      downloaded: 0,
      total: 0,
      stage: "downloading",
      message: "Starting download…",
    });

    try {
      log("Downloading Android SDK platform-tools from official repository…", "INFO");
      const targetDir = await downloadPlatformTools();
      await loadTools(true);
      setCompleteMessage(`Successfully installed platform tools to ${targetDir}`);
      log(`Platform tools installed to ${targetDir}`, "SUCCESS");
      toast("Android platform tools installed successfully!", "success");
      void fetchInfo();
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
      log(`Tools download failed: ${msg}`, "ERROR");
      toast("Failed to download platform tools", "error");
    } finally {
      setInstalling(false);
    }
  };

  const handleSelectZip = async () => {
    if (installing()) return;
    try {
      const picked = await openFileDialog({
        multiple: false,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });
      if (!picked || Array.isArray(picked)) return;

      setInstalling(true);
      setError(null);
      setCompleteMessage(null);
      setProgress({
        percentage: 50,
        downloaded: 0,
        total: 0,
        stage: "extracting",
        message: "Extracting selected zip archive…",
      });

      log(`Extracting platform tools from ${picked}…`, "INFO");
      const msg = await extractPlatformToolsZip(picked);
      await loadTools(true);
      setCompleteMessage(msg);
      log(msg, "SUCCESS");
      toast("Platform tools extracted successfully!", "success");
      void fetchInfo();
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
      log(`Extraction failed: ${msg}`, "ERROR");
      toast("Failed to extract platform tools", "error");
    } finally {
      setInstalling(false);
    }
  };

  onMount(() => {
    let unlisten: UnlistenFn | undefined;

    listen<SetupProgress>("tools-setup-progress", (event) => {
      setProgress(event.payload);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.warn("Failed to listen to tools-setup-progress", err);
      });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state.toolsSetupOpen) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);

    onCleanup(() => {
      unlisten?.();
      window.removeEventListener("keydown", onKey);
    });
  });

  return (
    <Show when={state.toolsSetupOpen}>
      <div
        id="tools-setup-modal"
        class="modal-overlay active"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div class="modal-window tools-setup-window">
          <div class="modal-header">
            <h2>
              <i class="fa-solid fa-toolbox" />
              <span>Android Platform Tools Setup</span>
            </h2>
            <button
              class="modal-close-btn"
              aria-label="Close tools setup"
              disabled={installing()}
              onClick={close}
            >
              <i class="fa-solid fa-xmark" />
            </button>
          </div>

          <div class="modal-content tools-setup-body">
            <div class="tools-setup-intro">
              <p>
                A.S.C.E.N.D. requires the official <strong>Android SDK Platform-Tools</strong> (ADB
                and Fastboot) to communicate with connected Android devices.
              </p>
            </div>

            {/* System / Environment Overview Card */}
            <div class="tools-info-card">
              <div class="tools-info-row">
                <span class="tools-info-label">Status</span>
                <span class="tools-info-value">
                  <span class={`status-dot ${state.tools.adb ? "online" : "warning"}`} />
                  <strong>{state.tools.adb ? "Installed & Ready" : "Missing / Not Detected"}</strong>
                </span>
              </div>
              <Show when={state.tools.adbPath}>
                <div class="tools-info-row">
                  <span class="tools-info-label">Active ADB</span>
                  <code class="tools-path-code">{state.tools.adbPath}</code>
                </div>
              </Show>
              <Show when={systemInfo()}>
                {(info) => (
                  <>
                    <div class="tools-info-row">
                      <span class="tools-info-label">OS / Architecture</span>
                      <span>
                        {info().os.toUpperCase()} ({info().arch})
                      </span>
                    </div>
                    <div class="tools-info-row">
                      <span class="tools-info-label">Tools Directory</span>
                      <code class="tools-path-code" title={info().platformToolsDir}>
                        {info().platformToolsDir}
                      </code>
                    </div>
                  </>
                )}
              </Show>
            </div>

            {/* Error Message */}
            <Show when={error()}>
              <div class="connect-note danger" role="alert">
                <i class="fa-solid fa-circle-exclamation danger-icon" />
                <div class="connect-note-text">
                  <strong>Installation Error</strong>
                  <span>{error()}</span>
                </div>
                <button class="btn-secondary small" onClick={handleDownload}>
                  Retry
                </button>
              </div>
            </Show>

            {/* Progress Display */}
            <Show when={installing()}>
              <div class="tools-progress-card">
                <div class="tools-progress-header">
                  <div class="tools-progress-stage">
                    <i class="fa-solid fa-circle-notch fa-spin" />
                    <span>{progress()?.stage === "extracting" ? "Extracting archive…" : "Downloading…"}</span>
                  </div>
                  <span class="tools-progress-percent">
                    {(progress()?.percentage || 0).toFixed(0)}%
                  </span>
                </div>

                <div class="progress-bar">
                  <div
                    class="progress-bar-fill"
                    style={{ width: `${Math.min(100, progress()?.percentage || 0)}%` }}
                  />
                </div>

                <div class="tools-progress-detail">
                  <span>{progress()?.message || "Working…"}</span>
                  <Show when={progress() && (progress()?.total || 0) > 0}>
                    <span class="tools-progress-bytes">
                      {formatBytes(progress()?.downloaded)} / {formatBytes(progress()?.total)}
                    </span>
                  </Show>
                </div>
              </div>
            </Show>

            {/* Success State */}
            <Show when={completeMessage() && !installing()}>
              <div class="connect-note success">
                <i class="fa-solid fa-circle-check" />
                <div class="connect-note-text">
                  <strong>Setup Completed!</strong>
                  <span>{completeMessage()}</span>
                </div>
              </div>

              <div class="tools-modal-actions">
                <button
                  class="btn-primary"
                  onClick={() => {
                    close();
                    openConnect("usb");
                  }}
                >
                  <i class="fa-solid fa-plug-circle-plus" /> Connect Device Now
                </button>
                <button class="btn-secondary" onClick={close}>
                  Close
                </button>
              </div>
            </Show>

            {/* Setup Action Options (shown when not installing and not freshly completed) */}
            <Show when={!installing() && !completeMessage()}>
              <div class="tools-options-grid">
                <div class="tools-option-card recommended">
                  <div class="tools-option-badge">Recommended</div>
                  <div class="tools-option-header">
                    <i class="fa-solid fa-cloud-arrow-down" />
                    <div>
                      <strong>Download from Google</strong>
                      <span>Official Android SDK platform-tools package</span>
                    </div>
                  </div>
                  <p class="tools-option-desc">
                    Downloads the latest official release for your operating system directly from Google
                    and unpacks it automatically.
                  </p>
                  <button class="btn-primary" onClick={handleDownload}>
                    <i class="fa-solid fa-download" /> Download &amp; Install
                  </button>
                </div>

                <div class="tools-option-card">
                  <div class="tools-option-header">
                    <i class="fa-solid fa-file-zipper" />
                    <div>
                      <strong>Extract Local Archive</strong>
                      <span>Already have platform-tools.zip?</span>
                    </div>
                  </div>
                  <p class="tools-option-desc">
                    Select an existing platform-tools zip archive from your disk to unpack into the
                    application data directory.
                  </p>
                  <button class="btn-secondary" onClick={handleSelectZip}>
                    <i class="fa-regular fa-folder-open" /> Choose ZIP file…
                  </button>
                </div>
              </div>

              <div class="tools-footer-hint">
                <i class="fa-solid fa-circle-info" />
                <span>
                  Advanced: Set the <code>ASCEND_BIN_DIR</code> environment variable to use an existing
                  custom ADB and Scrcpy directory on your system.
                </span>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
