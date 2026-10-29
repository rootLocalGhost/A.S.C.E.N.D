import { Component, onCleanup, onMount, Show } from "solid-js";
import { state, setState, toast } from "../stateStore";
import { saveScreenshotPreview } from "../actions";
import { copyText } from "../utils";

export const ScreenshotModal: Component = () => {
  const close = () => setState("screenshotPreview", null);

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state.screenshotPreview) close();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <Show when={state.screenshotPreview}>
      {(preview) => (
        <div
          class="modal-overlay active screenshot-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div class="modal-window screenshot-window">
            <div class="modal-header">
              <h2>
                <i class="fa-solid fa-camera" /> Screenshot
              </h2>
              <button class="modal-close-btn" aria-label="Close screenshot" onClick={close}>
                <i class="fa-solid fa-xmark" />
              </button>
            </div>
            <div class="screenshot-body">
              <img src={preview().dataUrl} alt={`Screenshot from ${state.currentDevice || "device"}`} />
            </div>
            <div class="screenshot-footer">
              <span class="screenshot-path" title={preview().path}>
                {preview().path}
              </span>
              <div class="screenshot-actions">
                <button
                  class="btn-secondary"
                  onClick={async () => {
                    const ok = await copyText(preview().path);
                    toast(ok ? "Path copied" : "Could not copy path", ok ? "success" : "error");
                  }}
                >
                  <i class="fa-regular fa-copy" /> Copy path
                </button>
                <button class="btn-primary" onClick={() => void saveScreenshotPreview()}>
                  <i class="fa-solid fa-download" /> Save as…
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
};
