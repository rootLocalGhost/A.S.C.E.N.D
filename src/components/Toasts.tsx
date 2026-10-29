import { Component, For } from "solid-js";
import { state, dismissToast } from "../stateStore";

const icons: Record<string, string> = {
  info: "fa-solid fa-circle-info",
  success: "fa-solid fa-circle-check",
  error: "fa-solid fa-circle-exclamation",
  warning: "fa-solid fa-triangle-exclamation",
};

export const Toasts: Component = () => (
  <div id="toast-container" role="status" aria-live="polite">
    <For each={state.toasts}>
      {(toast) => (
        <div class={`toast toast-${toast.type}`}>
          <i class={icons[toast.type]} />
          <span>{toast.message}</span>
          <button
            class="toast-close"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(toast.id)}
          >
            <i class="fa-solid fa-xmark" />
          </button>
        </div>
      )}
    </For>
  </div>
);
