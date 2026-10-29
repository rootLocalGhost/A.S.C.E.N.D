import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { state, setState, updatePreference, loadTools, log, toast, openConnect, openToolsSetup } from "../stateStore";
import { openUrl } from "@tauri-apps/plugin-opener";
import { copyText, cx, downloadTextFile } from "../utils";
import { Segmented, ToggleSwitch } from "./ui";
import { accents, themes, type Accent, type Theme } from "../preferences";
import { AnimatedLogo } from "./AnimatedLogo";

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

type SettingsTab = "preferences" | "logs" | "tools" | "about";

export const Modals: Component<ModalsProps> = (props) => {
  const [inputValue, setInputValue] = createSignal("");
  const [settingsTab, setSettingsTab] = createSignal<SettingsTab>("preferences");
  const [logFilter, setLogFilter] = createSignal("ALL");
  const [logSearch, setLogSearch] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  const submitInput = () => {
    const value = inputValue().trim();
    if (!value) return;
    props.inputState?.resolve(value);
    setInputValue("");
  };

  createEffect(() => {
    if (props.inputState?.isOpen) {
      setInputValue(props.inputState.defaultValue || "");
      setTimeout(() => {
        inputRef?.focus();
        inputRef?.select();
      }, 30);
    }
  });

  const filteredLogs = createMemo(() => {
    const term = logSearch().trim().toLowerCase();
    return state.logs.filter((entry) => {
      const typeMatch = logFilter() === "ALL" || entry.type === logFilter();
      const searchMatch = !term || entry.message.toLowerCase().includes(term);
      return typeMatch && searchMatch;
    });
  });

  const copyAllLogs = async () => {
    const text = state.logs
      .map((entry) => `[${entry.time}] [${entry.type}] ${entry.message}`)
      .join("\n");
    const ok = await copyText(text);
    toast(ok ? "Logs copied" : "Could not copy logs", ok ? "success" : "error");
  };

  const isDangerous = () =>
    /delete|uninstall|remove|reboot|power off|reset|erase|format|disable/i.test(
      props.confirmState?.prompt || ""
    );

  const closeModals = () => {
    props.onCloseSettings();
    if (props.inputState?.isOpen) {
      props.inputState.resolve(null);
      setInputValue("");
    }
    if (props.confirmState?.isOpen) {
      props.confirmState.resolve(false);
    }
  };

  const onWindowKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (props.settingsOpen) {
      props.onCloseSettings();
    } else if (props.inputState?.isOpen) {
      props.inputState.resolve(null);
      setInputValue("");
    } else if (props.confirmState?.isOpen) {
      props.confirmState.resolve(false);
    }
  };

  onMount(() => {
    window.addEventListener("keydown", onWindowKey);
    onCleanup(() => window.removeEventListener("keydown", onWindowKey));
  });

  const settingsTabs: Array<{ id: SettingsTab; label: string; icon: string }> = [
    { id: "preferences", label: "Preferences", icon: "fa-solid fa-sliders" },
    { id: "logs", label: "Logs", icon: "fa-solid fa-terminal" },
    { id: "tools", label: "Tools", icon: "fa-solid fa-screwdriver-wrench" },
    { id: "about", label: "About", icon: "fa-solid fa-circle-info" },
  ];

  return (
    <>
      <div
        id="settings-modal"
        class={`modal-overlay ${props.settingsOpen ? "active" : ""}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onCloseSettings();
        }}
      >
        <div class="modal-window settings-window">
          <div class="modal-header">
            <h2>
              <i class="fa-solid fa-gear" /> Settings
            </h2>
            <button class="modal-close-btn" aria-label="Close settings" onClick={props.onCloseSettings}>
              <i class="fa-solid fa-xmark" />
            </button>
          </div>

          <div class="settings-shell">
            <nav class="settings-nav">
              <For each={settingsTabs}>
                {(tab) => (
                  <button
                    class={cx("settings-nav-item", settingsTab() === tab.id && "active")}
                    onClick={() => {
                      setSettingsTab(tab.id);
                      if (tab.id === "tools") void loadTools(true);
                    }}
                  >
                    <i class={tab.icon} /> {tab.label}
                  </button>
                )}
              </For>
            </nav>

            <div class="settings-content">
              <Show when={settingsTab() === "preferences"}>
                <div class="settings-section">
                  <h3>Dashboard</h3>
                  <div class="setting-row">
                    <div>
                      <strong>Auto-refresh stats</strong>
                      <span>Poll device stats while the dashboard is open.</span>
                    </div>
                    <ToggleSwitch
                      checked={state.preferences.autoRefresh}
                      onChange={(value) => updatePreference("autoRefresh", value)}
                      label="Auto refresh"
                    />
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>Refresh interval</strong>
                      <span>How often live stats are polled ({state.preferences.refreshInterval}s).</span>
                    </div>
                    <input
                      class="range-input"
                      type="range"
                      min="3"
                      max="60"
                      step="1"
                      value={state.preferences.refreshInterval}
                      onInput={(event) =>
                        updatePreference(
                          "refreshInterval",
                          parseInt(event.currentTarget.value, 10)
                        )
                      }
                    />
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>Device monitor</strong>
                      <span>Detect devices connecting and disconnecting automatically.</span>
                    </div>
                    <ToggleSwitch
                      checked={state.preferences.deviceMonitor}
                      onChange={(value) => updatePreference("deviceMonitor", value)}
                      label="Device monitor"
                    />
                  </div>

                  <h3>Appearance</h3>
                  <div class="setting-row">
                    <div>
                      <strong>Theme</strong>
                      <span>Choose a light or dark appearance, or follow the system.</span>
                    </div>
                    <Segmented
                      value={state.preferences.theme}
                      options={themes}
                      onChange={(value) => updatePreference("theme", value as Theme)}
                      ariaLabel="Theme"
                    />
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>Accent color</strong>
                      <span>Used for highlights, active states, and controls.</span>
                    </div>
                    <div class="accent-picker">
                      <For each={Object.entries(accents) as Array<[Accent, (typeof accents)[Accent]]>}>
                        {([key, accent]) => (
                          <button
                            class={cx("accent-swatch", state.preferences.accent === key && "active")}
                            style={{ background: accent.color }}
                            title={accent.label}
                            aria-label={`Use ${accent.label} accent`}
                            onClick={() => updatePreference("accent", key)}
                          />
                        )}
                      </For>
                    </div>
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>Compact density</strong>
                      <span>Tighter spacing for smaller screens.</span>
                    </div>
                    <ToggleSwitch
                      checked={state.preferences.compact}
                      onChange={(value) => updatePreference("compact", value)}
                      label="Compact density"
                    />
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>Reduce motion</strong>
                      <span>Disable transitions and animated entrances.</span>
                    </div>
                    <ToggleSwitch
                      checked={state.preferences.reduceMotion}
                      onChange={(value) => updatePreference("reduceMotion", value)}
                      label="Reduce motion"
                    />
                  </div>

                  <h3>Behavior</h3>
                  <div class="setting-row">
                    <div>
                      <strong>Confirm destructive actions</strong>
                      <span>Ask before uninstalling, disabling, deleting, or rebooting.</span>
                    </div>
                    <ToggleSwitch
                      checked={state.preferences.confirmDestructive}
                      onChange={(value) => updatePreference("confirmDestructive", value)}
                      label="Confirm destructive actions"
                    />
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>Notifications</strong>
                      <span>Show toast notifications for completed actions.</span>
                    </div>
                    <ToggleSwitch
                      checked={state.preferences.toasts}
                      onChange={(value) => updatePreference("toasts", value)}
                      label="Toasts"
                    />
                  </div>
                  <div class="setting-row">
                    <div>
                      <strong>Console auto-scroll</strong>
                      <span>Follow new log entries automatically.</span>
                    </div>
                    <ToggleSwitch
                      checked={state.preferences.logAutoScroll}
                      onChange={(value) => updatePreference("logAutoScroll", value)}
                      label="Console auto-scroll"
                    />
                  </div>
                </div>
              </Show>

              <Show when={settingsTab() === "logs"}>
                <div class="settings-section logs-settings">
                  <div class="settings-toolbar">
                    <div class="log-filters">
                      <For each={["ALL", "CMD", "INFO", "SUCCESS", "ERROR"]}>
                        {(type) => (
                          <button
                            class={cx("log-filter-btn", logFilter() === type && "active")}
                            onClick={() => setLogFilter(type)}
                          >
                            {type === "ALL" ? "All" : type.toLowerCase()}
                          </button>
                        )}
                      </For>
                    </div>
                    <input
                      type="text"
                      class="log-search"
                      placeholder="Search logs…"
                      value={logSearch()}
                      onInput={(event) => setLogSearch(event.currentTarget.value)}
                    />
                    <div class="settings-log-actions">
                      <button class="icon-btn" title="Copy logs" aria-label="Copy logs" onClick={copyAllLogs}>
                        <i class="fa-regular fa-copy" />
                      </button>
                      <button
                        class="icon-btn"
                        title="Download logs"
                        aria-label="Download logs"
                        onClick={() => {
                          const text = state.logs
                            .map((entry) => `[${entry.time}] [${entry.type}] ${entry.message}`)
                            .join("\n");
                          downloadTextFile(`ascend-console-${Date.now()}.log`, text);
                        }}
                      >
                        <i class="fa-solid fa-download" />
                      </button>
                      <button
                        class="icon-btn danger"
                        title="Clear logs"
                        aria-label="Clear logs"
                        onClick={() => {
                          setState("logs", []);
                          log("Console cleared.", "INFO");
                        }}
                      >
                        <i class="fa-solid fa-trash" />
                      </button>
                    </div>
                  </div>

                  <div class="log-view settings-log-view">
                    <For each={filteredLogs()}>
                      {(entry) => (
                        <div class={`log-entry log-${entry.type.toLowerCase()}`}>
                          <span class="log-time">{entry.time}</span>
                          <span class="log-type">{entry.type}</span>
                          <span class="log-message">{entry.message}</span>
                        </div>
                      )}
                    </For>
                    <Show when={!filteredLogs().length}>
                      <div class="log-empty">
                        <i class="fa-solid fa-wave-square" /> No matching entries
                      </div>
                    </Show>
                  </div>

                  <button
                    class="btn-secondary"
                    onClick={() => updatePreference("logDrawerOpen", true)}
                  >
                    <i class="fa-solid fa-terminal" /> Open console drawer
                  </button>
                </div>
              </Show>

              <Show when={settingsTab() === "tools"}>
                <div class="settings-section">
                  <h3>Bundled toolchain</h3>
                  <div class="tool-list">
                    <div class="tool-list-item">
                      <div>
                        <strong>ADB</strong>
                        <span class="tool-status">{state.tools.adb || "Not detected"}</span>
                        <Show when={state.tools.adbPath}>
                          <code class="tool-path">{state.tools.adbPath}</code>
                        </Show>
                      </div>
                      <span class={`status-dot ${state.tools.adb ? "online" : "offline"}`} />
                    </div>
                    <div class="tool-list-item">
                      <div>
                        <strong>Scrcpy</strong>
                        <span class="tool-status">{state.tools.scrcpy || "Not detected"}</span>
                        <Show when={state.tools.scrcpyPath}>
                          <code class="tool-path">{state.tools.scrcpyPath}</code>
                        </Show>
                      </div>
                      <span class={`status-dot ${state.tools.scrcpy ? "online" : "offline"}`} />
                    </div>
                    <div class="tool-list-item">
                      <div>
                        <strong>Fastboot</strong>
                        <span class="tool-status">{state.tools.fastboot || "Not detected"}</span>
                        <Show when={state.tools.fastbootPath}>
                          <code class="tool-path">{state.tools.fastbootPath}</code>
                        </Show>
                      </div>
                      <span class={`status-dot ${state.tools.fastboot ? "online" : "offline"}`} />
                    </div>
                  </div>
                  <p class="muted-text tool-hint">
                    The app looks for <code>bin/adb.exe</code>, <code>bin/scrcpy.exe</code>, and{" "}
                    <code>bin/fastboot.exe</code> next to the application and in the bundled
                    resources folder.
                  </p>
                  <div class="settings-inline-actions">
                    <button
                      class="btn-primary"
                      onClick={() => {
                        props.onCloseSettings();
                        openToolsSetup();
                      }}
                    >
                      <i class="fa-solid fa-download" /> Install / Setup Tools
                    </button>
                    <button class="btn-secondary" onClick={() => void loadTools(true)}>
                      <i class="fa-solid fa-arrows-rotate" /> Re-check tools
                    </button>
                    <button
                      class="btn-secondary"
                      onClick={() => {
                        props.onCloseSettings();
                        openConnect("usb");
                      }}
                    >
                      <i class="fa-solid fa-plug-circle-plus" /> Open connection center
                    </button>
                  </div>

                  <h3>Keyboard shortcuts</h3>
                  <div class="shortcut-list">
                    <div class="shortcut-row"><kbd>Ctrl K</kbd><span>Command palette</span></div>
                    <div class="shortcut-row"><kbd>Ctrl 1–6</kbd><span>Switch tabs</span></div>
                    <div class="shortcut-row"><kbd>Ctrl `</kbd><span>Toggle console</span></div>
                    <div class="shortcut-row"><kbd>Ctrl F</kbd><span>Focus debloater search</span></div>
                    <div class="shortcut-row"><kbd>Ctrl L</kbd><span>Edit file path</span></div>
                    <div class="shortcut-row"><kbd>F11</kbd><span>Toggle fullscreen</span></div>
                    <div class="shortcut-row"><kbd>F5</kbd><span>Refresh current view</span></div>
                    <div class="shortcut-row"><kbd>Esc</kbd><span>Close overlays / clear selection</span></div>
                  </div>
                </div>
              </Show>

              <Show when={settingsTab() === "about"}>
                <div class="settings-section about-section">
                  <div class="about-mark">
                    <AnimatedLogo class="about-logo" />
                  </div>
                  <h3>A.S.C.E.N.D.</h3>
                  <p class="muted-text">
                    Android System Control &amp; ENhanced Debloater. A desktop control suite built
                    with Tauri, Rust, SolidJS, and Bun.
                  </p>
                  <div class="about-meta">
                    <span>Version <strong>1.3.0</strong></span>
                    <span>MIT License</span>
                  </div>
                  <div class="about-actions">
                    <button
                      class="btn-secondary"
                      onClick={() => void openUrl("https://github.com/rootLocalGhost/A.S.C.E.N.D")}
                    >
                      <i class="fa-brands fa-github" /> GitHub repository
                    </button>
                    <button
                      class="btn-secondary"
                      onClick={() => void openUrl("https://github.com/rootLocalGhost/A.S.C.E.N.D#readme")}
                    >
                      <i class="fa-solid fa-book" /> Documentation
                    </button>
                  </div>
                  <p class="disclaimer">
                    <i class="fa-solid fa-triangle-exclamation" /> Deleting or disabling the wrong
                    system packages can cause instability or boot loops. Proceed at your own risk.
                  </p>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </div>

      <Show when={props.inputState?.isOpen}>
        <div
          id="input-modal"
          class="modal-overlay active"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              props.inputState?.resolve(null);
              setInputValue("");
            }
          }}
        >
          <div class="modal-window">
            <div class="modal-header">
              <h2>{props.inputState?.title || "Input required"}</h2>
              <button
                class="modal-close-btn"
                aria-label="Cancel"
                onClick={() => {
                  props.inputState?.resolve(null);
                  setInputValue("");
                }}
              >
                <i class="fa-solid fa-xmark" />
              </button>
            </div>
            <div class="modal-content">
              <p class="modal-prompt">{props.inputState?.prompt}</p>
              <input
                ref={inputRef}
                type="text"
                id="input-modal-field"
                value={inputValue()}
                onInput={(event) => setInputValue(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitInput();
                  if (event.key === "Escape") {
                    props.inputState?.resolve(null);
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
                <button class="btn-primary" onClick={submitInput} disabled={!inputValue().trim()}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>

      <Show when={props.confirmState?.isOpen}>
        <div
          id="confirm-modal"
          class="modal-overlay active"
          onClick={(event) => {
            if (event.target === event.currentTarget) props.confirmState?.resolve(false);
          }}
        >
          <div class="modal-window">
            <div class="modal-header">
              <h2>
                <i
                  class={
                    isDangerous()
                      ? "fa-solid fa-triangle-exclamation danger-icon"
                      : "fa-solid fa-circle-question"
                  }
                />
                {isDangerous() ? "Confirm destructive action" : "Confirm action"}
              </h2>
            </div>
            <div class="modal-content">
              <p class="modal-prompt confirm-prompt">{props.confirmState?.prompt}</p>
              <div id="confirm-modal-actions">
                <button class="btn-secondary" onClick={() => props.confirmState?.resolve(false)}>
                  Cancel
                </button>
                <button
                  class={isDangerous() ? "btn-danger" : "btn-primary"}
                  onClick={() => props.confirmState?.resolve(true)}
                >
                  {isDangerous() ? "Yes, continue" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
};
