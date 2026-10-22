import { Component, createSignal, onMount, Show } from "solid-js";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "../gui/css/main.css";

import { state, log, runCommand } from "./stateStore";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { DashboardTab } from "./components/DashboardTab";
import { ScrcpyTab } from "./components/ScrcpyTab";
import { DebloaterTab } from "./components/DebloaterTab";
import { DeviceTab } from "./components/DeviceTab";
import { FilesTab } from "./components/FilesTab";
import { RemoteTab } from "./components/RemoteTab";
import { Modals } from "./components/Modals";

export const App: Component = () => {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
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

  onMount(async () => {
    log("A.S.C.E.N.D. Initialized (Tauri + SolidJS). Starting ADB server...");
    await runCommand("adb", ["start-server"], true);
  });

  return (
    <div id="app-container" class={state.isBusy ? "is-busy" : ""}>
      <Titlebar />

      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />

      <main id="app-content">
        <div class={`busy-overlay ${state.isBusy ? "active" : ""}`}>
          <i class="fa-solid fa-spinner fa-spin" />
        </div>

        <DashboardTab />
        <ScrcpyTab />
        <DebloaterTab onShowConfirm={showConfirm} />
        <DeviceTab onShowConfirm={showConfirm} />
        <FilesTab onShowInput={showInput} onShowConfirm={showConfirm} />
        <RemoteTab />
      </main>

      <Modals
        settingsOpen={settingsOpen()}
        onCloseSettings={() => setSettingsOpen(false)}
        inputState={inputModalState()}
        confirmState={confirmModalState()}
      />
    </div>
  );
};
