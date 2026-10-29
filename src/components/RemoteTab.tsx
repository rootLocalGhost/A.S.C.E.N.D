import { Component, createSignal, onCleanup, onMount, Show } from "solid-js";
import { state, runCommand, toast } from "../stateStore";
import { copyText } from "../utils";

const KEY = {
  home: 3,
  back: 4,
  call: 5,
  endcall: 6,
  up: 19,
  down: 20,
  left: 21,
  right: 22,
  volumeUp: 24,
  volumeDown: 25,
  power: 26,
  camera: 27,
  tab: 61,
  enter: 66,
  delete: 67,
  menu: 82,
  mute: 164,
  playPause: 85,
  next: 87,
  previous: 88,
  recents: 187,
  search: 84,
  wake: 224,
  sleep: 223,
};

export const RemoteTab: Component = () => {
  const [textInput, setTextInput] = createSignal("");

  const sendKey = async (keycode: number, label?: string) => {
    if (!state.currentDevice) {
      toast("Select a device first", "warning");
      return;
    }
    const res = await runCommand(
      "adb",
      ["shell", "input", "keyevent", keycode.toString()],
      { background: true, quiet: true }
    );
    if (!res) toast(`Could not send ${label || "key"}`, "error");
  };

  const handleSendText = async () => {
    const text = textInput().trim();
    if (!text) return;
    if (!state.currentDevice) {
      toast("Select a device first", "warning");
      return;
    }

    const encoded = text.replace(/ /g, "%s").replace(/'/g, "'\\''");
    const res = await runCommand("adb", ["shell", `input text '${encoded}'`], {
      background: true,
      quiet: true,
    });

    if (res) {
      setTextInput("");
      toast("Text sent", "success", 1800);
    } else {
      toast("Could not send text. Avoid emoji and unsupported symbols.", "warning", 5000);
    }
  };

  const pasteAndSend = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast("Clipboard is empty", "info");
        return;
      }
      setTextInput(text);
    } catch {
      toast("Clipboard access was denied", "warning");
    }
  };

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if (state.activeTab !== "remote-tab") return;
      if (state.paletteOpen || state.screenshotPreview) return;
      if (document.querySelector(".modal-overlay.active")) return;
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const bindings: Record<string, { code: number; label: string }> = {
        ArrowUp: { code: KEY.up, label: "up" },
        ArrowDown: { code: KEY.down, label: "down" },
        ArrowLeft: { code: KEY.left, label: "left" },
        ArrowRight: { code: KEY.right, label: "right" },
        Enter: { code: KEY.enter, label: "enter" },
        Escape: { code: KEY.back, label: "back" },
        Backspace: { code: KEY.back, label: "back" },
        "+": { code: KEY.volumeUp, label: "volume up" },
        "=": { code: KEY.volumeUp, label: "volume up" },
        "-": { code: KEY.volumeDown, label: "volume down" },
        m: { code: KEY.mute, label: "mute" },
      };

      const binding = bindings[event.key] || bindings[event.key.toLowerCase?.()];
      if (!binding) return;
      if (event.key === "Backspace" && (event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      void sendKey(binding.code, binding.label);
    };

    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <div
      id="remote-tab"
      class={`tab-content ${state.activeTab === "remote-tab" ? "active" : ""}`}
    >
      <div class="remote-shell">
        <div class="remote-layout">
          <div class="remote-header">
            <div>
              <h2>Virtual remote</h2>
              <p>Use the on-screen keys or your keyboard (arrows, Enter, Esc, +/−, M).</p>
            </div>
            <span class={`tool-status ${state.currentDevice ? "ok" : "missing"}`}>
              <span class={`status-dot ${state.currentDevice ? "online" : "offline"}`} />
              {state.currentDevice || "No device"}
            </span>
          </div>

          <div class="remote-power-row">
            <button class="remote-btn power" onClick={() => void sendKey(KEY.power, "power")}>
              <i class="fa-solid fa-power-off" />
              <span>Power</span>
            </button>
            <button class="remote-btn" onClick={() => void sendKey(KEY.wake, "wake")}>
              <i class="fa-solid fa-sun" />
              <span>Wake</span>
            </button>
            <button class="remote-btn" onClick={() => void sendKey(KEY.sleep, "sleep")}>
              <i class="fa-solid fa-moon" />
              <span>Sleep</span>
            </button>
          </div>

          <div class="remote-dpad-grid">
            <div />
            <button
              id="remote-dpad-up"
              class="remote-btn"
              title="D-pad up (↑)"
              onClick={() => void sendKey(KEY.up, "up")}
            >
              <i class="fa-solid fa-chevron-up" />
            </button>
            <div />
            <button
              id="remote-dpad-left"
              class="remote-btn"
              title="D-pad left (←)"
              onClick={() => void sendKey(KEY.left, "left")}
            >
              <i class="fa-solid fa-chevron-left" />
            </button>
            <button
              id="remote-dpad-center"
              class="remote-btn"
              title="Select (Enter)"
              onClick={() => void sendKey(KEY.enter, "enter")}
            >
              <i class="fa-solid fa-circle-dot" />
            </button>
            <button
              id="remote-dpad-right"
              class="remote-btn"
              title="D-pad right (→)"
              onClick={() => void sendKey(KEY.right, "right")}
            >
              <i class="fa-solid fa-chevron-right" />
            </button>
            <div />
            <button
              id="remote-dpad-down"
              class="remote-btn"
              title="D-pad down (↓)"
              onClick={() => void sendKey(KEY.down, "down")}
            >
              <i class="fa-solid fa-chevron-down" />
            </button>
            <div />
          </div>

          <div class="remote-standard-btns">
            <button
              id="remote-back-btn"
              class="remote-btn"
              title="Back (Esc)"
              onClick={() => void sendKey(KEY.back, "back")}
            >
              <i class="fa-solid fa-arrow-left" />
              <span>Back</span>
            </button>
            <button
              id="remote-home-btn"
              class="remote-btn"
              title="Home"
              onClick={() => void sendKey(KEY.home, "home")}
            >
              <i class="fa-solid fa-house" />
              <span>Home</span>
            </button>
            <button
              id="remote-recents-btn"
              class="remote-btn"
              title="Recents"
              onClick={() => void sendKey(KEY.recents, "recents")}
            >
              <i class="fa-solid fa-square" />
              <span>Recents</span>
            </button>
            <button class="remote-btn" title="Menu" onClick={() => void sendKey(KEY.menu, "menu")}>
              <i class="fa-solid fa-bars" />
              <span>Menu</span>
            </button>
            <button class="remote-btn" title="Search" onClick={() => void sendKey(KEY.search, "search")}>
              <i class="fa-solid fa-magnifying-glass" />
              <span>Search</span>
            </button>
            <button class="remote-btn" title="Delete / backspace" onClick={() => void sendKey(KEY.delete, "delete")}>
              <i class="fa-solid fa-delete-left" />
              <span>Delete</span>
            </button>
            <button class="remote-btn" title="Tab" onClick={() => void sendKey(KEY.tab, "tab")}>
              <i class="fa-solid fa-arrow-right-to-bracket" />
              <span>Tab</span>
            </button>
            <button class="remote-btn" title="Camera" onClick={() => void sendKey(KEY.camera, "camera")}>
              <i class="fa-solid fa-camera" />
              <span>Camera</span>
            </button>
          </div>

          <div class="remote-media-btns">
            <button
              id="remote-vol-down-btn"
              class="remote-btn"
              title="Volume down (−)"
              onClick={() => void sendKey(KEY.volumeDown, "volume down")}
            >
              <i class="fa-solid fa-volume-low" />
            </button>
            <button
              id="remote-mute-btn"
              class="remote-btn"
              title="Mute (M)"
              onClick={() => void sendKey(KEY.mute, "mute")}
            >
              <i class="fa-solid fa-volume-xmark" />
            </button>
            <button
              id="remote-prev-btn"
              class="remote-btn"
              title="Previous track"
              onClick={() => void sendKey(KEY.previous, "previous")}
            >
              <i class="fa-solid fa-backward-step" />
            </button>
            <button
              id="remote-play-pause-btn"
              class="remote-btn"
              title="Play / pause"
              onClick={() => void sendKey(KEY.playPause, "play/pause")}
            >
              <i class="fa-solid fa-play-pause" />
            </button>
            <button
              id="remote-next-btn"
              class="remote-btn"
              title="Next track"
              onClick={() => void sendKey(KEY.next, "next")}
            >
              <i class="fa-solid fa-forward-step" />
            </button>
            <button
              id="remote-vol-up-btn"
              class="remote-btn"
              title="Volume up (+)"
              onClick={() => void sendKey(KEY.volumeUp, "volume up")}
            >
              <i class="fa-solid fa-volume-high" />
            </button>
          </div>

          <div class="remote-text-input">
            <input
              type="text"
              id="send-text-input"
              placeholder="Type text and press Enter…"
              value={textInput()}
              onInput={(event) => setTextInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSendText();
              }}
            />
            <button
              class="icon-btn"
              title="Paste from clipboard"
              aria-label="Paste from clipboard"
              onClick={() => void pasteAndSend()}
            >
              <i class="fa-regular fa-paste" />
            </button>
            <button
              id="send-text-btn"
              class="btn-primary"
              onClick={() => void handleSendText()}
              disabled={!textInput().trim()}
            >
              <i class="fa-solid fa-paper-plane" /> Send
            </button>
          </div>

          <Show when={state.currentDevice}>
            <button
              class="link-btn"
              onClick={async () => {
                const ok = await copyText(state.currentDevice || "");
                toast(ok ? "Device serial copied" : "Could not copy", ok ? "success" : "error");
              }}
            >
              <i class="fa-regular fa-copy" /> Copy device serial
            </button>
          </Show>
        </div>

        <aside class="remote-help card">
          <div class="card-header">
            <i class="fa-solid fa-keyboard" /> Keyboard shortcuts
          </div>
          <div class="card-content">
            <div class="shortcut-row"><kbd>↑ ↓ ← →</kbd><span>D-pad navigation</span></div>
            <div class="shortcut-row"><kbd>Enter</kbd><span>Select / OK</span></div>
            <div class="shortcut-row"><kbd>Esc</kbd><span>Back</span></div>
            <div class="shortcut-row"><kbd>+</kbd><span>Volume up</span></div>
            <div class="shortcut-row"><kbd>−</kbd><span>Volume down</span></div>
            <div class="shortcut-row"><kbd>M</kbd><span>Mute</span></div>
            <div class="shortcut-divider" />
            <p class="muted-text">
              Keyboard shortcuts only work on this tab and when the text field is not focused.
              Text injection supports ASCII; emoji may not be delivered by ADB.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};
