import { Component, createSignal, Show, For } from "solid-js";
import { state } from "../stateStore";

interface ModalsProps {
  settingsOpen: boolean;
  onCloseSettings: () => void;
  inputState: {
    isOpen: boolean;
    title: string;
    prompt: string;
    defaultValue: string;
    resolve: (val: string | null) => void;
  } | null;
  confirmState: {
    isOpen: boolean;
    prompt: string;
    resolve: (val: boolean) => void;
  } | null;
}

export const Modals: Component<ModalsProps> = (props) => {
  const [inputValue, setInputValue] = createSignal("");

  return (
    <>
      {/* Settings Modal */}
      <div
        id="settings-modal"
        class={`modal-overlay ${props.settingsOpen ? "active" : ""}`}
      >
        <div class="modal-window">
          <div class="modal-header">
            <h2>
              <i class="fa-solid fa-book" /> Settings & Logs
            </h2>
            <button
              class="modal-close-btn"
              onClick={props.onCloseSettings}
            >
              <i class="fa-solid fa-times" />
            </button>
          </div>
          <div class="modal-content">
            <div id="session-log" class="log-view">
              <For each={state.logs}>
                {(entry) => (
                  <div class={`log-entry log-${entry.type.toLowerCase()}`}>
                    [{entry.time}] [{entry.type}] {entry.message}
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>

      {/* Input Modal */}
      <Show when={props.inputState?.isOpen}>
        <div id="input-modal" class="modal-overlay active">
          <div class="modal-window">
            <div class="modal-header">
              <h2>{props.inputState?.title || "Input Required"}</h2>
            </div>
            <div class="modal-content">
              <p>{props.inputState?.prompt}</p>
              <input
                type="text"
                id="input-modal-field"
                value={inputValue() || props.inputState?.defaultValue || ""}
                onInput={(e) => setInputValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    props.inputState?.resolve(inputValue());
                    setInputValue("");
                  }
                }}
              />
              <div id="input-modal-actions">
                <button
                  class="btn-secondary"
                  onClick={() => {
                    props.inputState?.resolve(null);
                    setInputValue("");
                  }}
                >
                  Cancel
                </button>
                <button
                  class="btn-primary"
                  onClick={() => {
                    props.inputState?.resolve(inputValue());
                    setInputValue("");
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* Confirm Modal */}
      <Show when={props.confirmState?.isOpen}>
        <div id="confirm-modal" class="modal-overlay active">
          <div class="modal-window">
            <div class="modal-header">
              <h2>Confirm Action</h2>
            </div>
            <div class="modal-content">
              <p>{props.confirmState?.prompt}</p>
              <div id="confirm-modal-actions">
                <button
                  class="btn-secondary"
                  onClick={() => props.confirmState?.resolve(false)}
                >
                  Cancel
                </button>
                <button
                  class="btn-primary"
                  onClick={() => props.confirmState?.resolve(true)}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
};
