import { Component } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const Titlebar: Component = () => {
  const appWindow = getCurrentWindow();

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = async () => {
    if (await appWindow.isMaximized()) {
      appWindow.unmaximize();
    } else {
      appWindow.maximize();
    }
  };
  const handleClose = () => appWindow.close();

  return (
    <>
      <div id="window-drag-region" />
      <div id="window-controls-container">
        <button
          class="window-control-btn"
          title="Minimize"
          onClick={handleMinimize}
        >
          <i class="fa-solid fa-minus" />
        </button>
        <button
          class="window-control-btn"
          title="Maximize"
          onClick={handleMaximize}
        >
          <i class="fa-regular fa-square" />
        </button>
        <button
          class="window-control-btn danger"
          title="Close"
          onClick={handleClose}
        >
          <i class="fa-solid fa-xmark" />
        </button>
      </div>
    </>
  );
};
