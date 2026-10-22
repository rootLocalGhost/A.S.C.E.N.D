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
  const [logFilter, setLogFilter] = createSignal("");
  const [copied, setCopied] = createSignal(false);

  const filteredLogs = () => {
    if (!logFilter().trim()) return state.logs;
    const term = logFilter().toLowerCase();
    return state.logs.filter(
      (entry) =>
        entry.message.toLowerCase().includes(term) ||
        entry.type.toLowerCase().includes(term)
    );
  };

  const copyLogs = () => {
    const text = state.logs
      .map((entry) => `[${entry.time}] [${entry.type}] ${entry.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
              <i class="fa-solid fa-book" /> Application Logs & Activity
            </h2>
            <button class="modal-close-btn" onClick={props.onCloseSettings}>
              <i class="fa-solid fa-times" />
            </button>
          </div>
          <div class="modal-content">
            <div class="log-toolbar">
              <input
                type="text"
                placeholder="Filter logs..."
                value={logFilter()}
                onInput={(e) => setLogFilter(e.currentTarget.value)}
              />
              <button class="btn-secondary" onClick={copyLogs}>
                <i class={`fa-solid ${copied() ? "fa-check" : "fa-copy"}`} />
                {copied() ? "Copied!" : "Copy Logs"}
              </button>
            </div>

            <div id="session-log" class="log-view">
              <For each={filteredLogs()}>
                {(entry) => (
                  <div class={`log-entry log-${entry.type.toLowerCase()}`}>
                    <span class="log-time">[{entry.time}]</span>{" "}
                    <span class={`log-badge badge-${entry.type.toLowerCase()}`}>
                      {entry.type}
                    </span>{" "}
                    <span class="log-msg">{entry.message}</span>
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
