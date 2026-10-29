import { Component, createSignal, onCleanup, onMount, Show } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { state, updatePreference, openConnect } from "../stateStore";
import { deviceStateLabel } from "../utils";

export const Titlebar: Component = () => {
  // Allows the UI to be previewed in a plain browser (`bun dev`) where the Tauri
  // window API is unavailable.
  const appWindow = (() => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  })();
  const [maximized, setMaximized] = createSignal(false);
  const [fullscreen, setFullscreen] = createSignal(false);

  const syncWindowState = async () => {
    if (!appWindow) return;
    try {
      const [isMaximized, isFullscreen] = await Promise.all([
        appWindow.isMaximized(),
        appWindow.isFullscreen(),
      ]);
      setMaximized(isMaximized);
      setFullscreen(isFullscreen);
    } catch {
      /* window API unavailable in browser preview */
    }
  };

  const runWindowAction = async (action: () => Promise<void>) => {
    if (!appWindow) return;
    try {
      await action();
    } catch (error) {
      console.warn("Window action failed", error);
    }
    void syncWindowState();
  };

  const handleMinimize = () => runWindowAction(() => appWindow!.minimize());

  const handleMaximize = async () => {
    if (!appWindow || fullscreen()) return;
    try {
      if (await appWindow.isMaximized()) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch (error) {
      console.warn("Window maximize failed", error);
    }
    void syncWindowState();
  };

  const handleFullscreen = async () => {
    if (!appWindow) return;
    try {
      await appWindow.setFullscreen(!(await appWindow.isFullscreen()));
    } catch (error) {
      console.warn("Fullscreen toggle failed", error);
    }
    void syncWindowState();
  };

  const handleClose = () => runWindowAction(() => appWindow!.close());

  onMount(() => {
    if (!appWindow) return;
    void syncWindowState();
    let unlisten: (() => void) | undefined;
    appWindow
      .onResized(() => {
        void syncWindowState();
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "F11") return;
      event.preventDefault();
      void handleFullscreen();
    };
    window.addEventListener("keydown", onKey);

    onCleanup(() => {
      unlisten?.();
      window.removeEventListener("keydown", onKey);
    });
  });

  const device = () => (state.currentDevice ? state.deviceInfo[state.currentDevice] : null);
  const deviceOnline = () => device()?.state === "device";

  return (
    <>
      <div
        id="window-drag-region"
        onDblClick={handleMaximize}
        data-tauri-drag-region
      />

      <div id="titlebar-status">
        <button
          type="button"
          class={`device-pill connect-trigger ${state.currentDevice ? (deviceOnline() ? "online" : "warning") : "offline"}`}
          title={
            state.currentDevice
              ? `${state.currentDevice} — ${deviceStateLabel(device()?.state || "unknown")} · Click to connect another device`
              : "No device connected · Open the connection center"
          }
          aria-label={state.currentDevice ? "Manage connected devices" : "Connect a device"}
          onClick={() => openConnect()}
        >
          <span class={`status-dot ${state.currentDevice ? (deviceOnline() ? "online" : "warning") : "offline"}`} />
          <span class="device-pill-label">
            {state.currentDevice
              ? device()?.model || state.currentDevice
              : "Connect device"}
          </span>
          <i class={`fa-solid ${state.currentDevice ? "fa-chevron-down" : "fa-plus"}`} />
        </button>

        <Show when={state.isBusy}>
          <div class="busy-pill" title={state.busyLabel || "Working…"}>
            <i class="fa-solid fa-circle-notch fa-spin" />
            <span>Working</span>
          </div>
        </Show>

        <button
          class="titlebar-util-btn"
          title="Command palette (Ctrl+K)"
          aria-label="Open command palette (Ctrl K)"
          onClick={() => {
            const event = new CustomEvent("ascend:palette");
            window.dispatchEvent(event);
          }}
        >
          <i class="fa-solid fa-magnifying-glass" />
          <kbd>Ctrl K</kbd>
        </button>
        <button
          class={`titlebar-util-btn ${state.logDrawerOpen ? "active" : ""}`}
          title="Toggle console (Ctrl+`)"
          aria-label="Toggle console"
          onClick={() => updatePreference("logDrawerOpen", !state.logDrawerOpen)}
        >
          <i class="fa-solid fa-terminal" />
        </button>
      </div>

      <div id="window-controls-container">
        <button
          class="window-control-btn"
          title="Minimize"
          aria-label="Minimize window"
          onClick={() => void handleMinimize()}
        >
          <i class="fa-solid fa-minus" />
        </button>
        <button
          class="window-control-btn"
          title={maximized() ? "Restore window" : "Maximize window"}
          aria-label={maximized() ? "Restore window" : "Maximize window"}
          onClick={() => void handleMaximize()}
        >
          <i class={maximized() ? "fa-regular fa-clone" : "fa-regular fa-square"} />
        </button>
        <button
          class="window-control-btn danger"
          title="Close"
          aria-label="Close window"
          onClick={() => void handleClose()}
        >
          <i class="fa-solid fa-xmark" />
        </button>
      </div>
    </>
  );
};
