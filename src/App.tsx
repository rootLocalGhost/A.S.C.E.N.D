import { Component, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/main.css";

import {
  state,
  setState,
  log,
  runCommand,
  refreshDevices,
  updatePreference,
  startDeviceMonitor,
  stopDeviceMonitor,
  loadTools,
} from "./stateStore";
import { accents, resolveTheme } from "./preferences";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { DashboardTab } from "./components/DashboardTab";
import { ScrcpyTab } from "./components/ScrcpyTab";
import { DebloaterTab } from "./components/DebloaterTab";
import { DeviceTab } from "./components/DeviceTab";
import { FilesTab } from "./components/FilesTab";
import { RemoteTab } from "./components/RemoteTab";
import { Modals } from "./components/Modals";
import { Toasts } from "./components/Toasts";
import { CommandPalette } from "./components/CommandPalette";
import { LogDrawer } from "./components/LogDrawer";
import { ScreenshotModal } from "./components/ScreenshotModal";
import { ConnectModal } from "./components/ConnectModal";
import { ToolsSetupModal } from "./components/ToolsSetupModal";

const TAB_ORDER = [
  "dashboard-tab",
  "scrcpy-tab",
  "apps-tab",
  "device-tab",
  "files-tab",
  "remote-tab",
];

const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

export const App: Component = () => {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [systemPrefersDark, setSystemPrefersDark] = createSignal(systemThemeQuery.matches);
  const [inputModalState, setInputModalState] = createSignal<{
    isOpen: boolean;
    title: string;
    prompt: string;
    defaultValue: string;
    resolve: (val: string | null) => void;
  } | null>(null);

  const [confirmModalState, setConfirmModalState] = createSignal<{
    isOpen: boolean;
    prompt: string;
    resolve: (val: boolean) => void;
  } | null>(null);

  const showInput = (
    title: string,
    prompt: string,
    defaultValue = ""
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      setInputModalState({
        isOpen: true,
        title,
        prompt,
        defaultValue,
        resolve: (val) => {
          setInputModalState(null);
          resolve(val);
        },
      });
    });
  };

  const showConfirm = (prompt: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmModalState({
        isOpen: true,
        prompt,
        resolve: (val) => {
          setConfirmModalState(null);
          resolve(val);
        },
      });
    });
  };

  createEffect(() => {
    const preferences = state.preferences;
    const accent = accents[preferences.accent] || accents.red;
    const root = document.documentElement;
    const resolvedTheme = resolveTheme(preferences.theme, systemPrefersDark());
    root.style.setProperty("--red", accent.color);
    root.style.setProperty("--red-dark", accent.dark);
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = preferences.theme;
    root.dataset.density = preferences.compact ? "compact" : "comfortable";
    root.dataset.reduceMotion = preferences.reduceMotion ? "true" : "false";
  });

  createEffect(() => {
    if (state.preferences.deviceMonitor) {
      startDeviceMonitor();
    } else {
      stopDeviceMonitor();
    }
  });

  onMount(async () => {
    log("A.S.C.E.N.D. initialized. Starting ADB server…", "INFO");
    await runCommand("adb", ["start-server"], { background: true, quiet: true });
    void loadTools();
    void refreshDevices({ quiet: true });

    const onSettings = () => setSettingsOpen(true);

    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;

      const overlayOpen =
        state.paletteOpen ||
        state.connectOpen ||
        state.toolsSetupOpen ||
        !!state.screenshotPreview ||
        !!document.querySelector(".modal-overlay.active");
      if (overlayOpen) return;

      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("ascend:palette"));
        return;
      }

      if (mod && /^[1-6]$/.test(event.key)) {
        event.preventDefault();
        setState("activeTab", TAB_ORDER[parseInt(event.key, 10) - 1]);
        return;
      }

      if (mod && event.key === "`") {
        event.preventDefault();
        updatePreference("logDrawerOpen", !state.logDrawerOpen);
        return;
      }

      if (event.key === "F5" && state.activeTab !== "files-tab") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("ascend:refresh"));
        return;
      }
    };

    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    window.addEventListener("ascend:settings", onSettings);
    window.addEventListener("keydown", onKey);
    systemThemeQuery.addEventListener("change", onSystemThemeChange);

    onCleanup(() => {
      window.removeEventListener("ascend:settings", onSettings);
      window.removeEventListener("keydown", onKey);
      systemThemeQuery.removeEventListener("change", onSystemThemeChange);
      stopDeviceMonitor();
    });
  });

  return (
    <div
      id="app-container"
      classList={{
        "sidebar-collapsed": state.isSidebarCollapsed,
        "console-open": state.logDrawerOpen,
        "compact-density": state.preferences.compact,
      }}
    >
      <Titlebar />
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />

      <main id="app-content">
        <div class={`command-progress ${state.isBusy ? "active" : ""}`} aria-hidden="true" />

        <DashboardTab />
        <ScrcpyTab />
        <DebloaterTab onShowConfirm={showConfirm} />
        <DeviceTab onShowConfirm={showConfirm} />
        <FilesTab onShowInput={showInput} onShowConfirm={showConfirm} />
        <RemoteTab />
      </main>

      <LogDrawer />
      <CommandPalette />
      <ConnectModal />
      <Toasts />
      <ScreenshotModal />
      <ToolsSetupModal />

      <Modals
        settingsOpen={settingsOpen()}
        onCloseSettings={() => setSettingsOpen(false)}
        inputState={inputModalState()}
        confirmState={confirmModalState()}
      />
    </div>
  );
};
