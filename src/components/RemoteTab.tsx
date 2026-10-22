import { Component, createSignal } from "solid-js";
import { state, runCommand } from "../stateStore";

export const RemoteTab: Component = () => {
  const [textInput, setTextInput] = createSignal("");

  const sendKey = (keycode: number) => {
    runCommand("adb", ["shell", "input", "keyevent", keycode.toString()], true);
  };

  const handleSendText = () => {
    const text = textInput().trim();
    if (text) {
      const formattedText = text.replace(/ /g, "%s");
      runCommand("adb", ["shell", "input", "text", formattedText], true);
      setTextInput("");
    }
  };

  return (
    <div
      id="remote-tab"
      class={`tab-content ${state.activeTab === "remote-tab" ? "active" : ""}`}
    >
      <div class="remote-layout">
        <div class="remote-dpad-grid">
          <div />
          <button
            id="remote-dpad-up"
            class="remote-btn"
            onClick={() => sendKey(19)}
          >
            <i class="fa-solid fa-chevron-up" />
          </button>
          <div />

          <button
            id="remote-dpad-left"
            class="remote-btn"
            onClick={() => sendKey(21)}
          >
            <i class="fa-solid fa-chevron-left" />
          </button>
          <button
            id="remote-dpad-center"
            class="remote-btn"
            onClick={() => sendKey(66)}
          >
            <i class="fa-solid fa-circle-dot" />
          </button>
          <button
            id="remote-dpad-right"
            class="remote-btn"
            onClick={() => sendKey(22)}
          >
            <i class="fa-solid fa-chevron-right" />
          </button>

          <div />
          <button
            id="remote-dpad-down"
            class="remote-btn"
            onClick={() => sendKey(20)}
          >
            <i class="fa-solid fa-chevron-down" />
          </button>
          <div />
        </div>

        <div class="remote-standard-btns">
          <button
            id="remote-back-btn"
            class="remote-btn"
            onClick={() => sendKey(4)}
          >
            <i class="fa-solid fa-arrow-left" />
            <span>Back</span>
          </button>
          <button
            id="remote-home-btn"
            class="remote-btn"
            onClick={() => sendKey(3)}
          >
            <i class="fa-solid fa-house" />
            <span>Home</span>
          </button>
          <button
            id="remote-recents-btn"
            class="remote-btn"
            onClick={() => sendKey(187)}
          >
            <i class="fa-solid fa-square" />
            <span>Recents</span>
          </button>
        </div>

        <div class="remote-media-btns">
          <button
            id="remote-vol-down-btn"
            class="remote-btn"
            onClick={() => sendKey(25)}
          >
            <i class="fa-solid fa-volume-down" />
          </button>
          <button
            id="remote-prev-btn"
            class="remote-btn"
            onClick={() => sendKey(88)}
          >
            <i class="fa-solid fa-backward-step" />
          </button>
          <button
            id="remote-play-pause-btn"
            class="remote-btn"
            onClick={() => sendKey(85)}
          >
            <i class="fa-solid fa-play-pause" />
          </button>
          <button
            id="remote-next-btn"
            class="remote-btn"
            onClick={() => sendKey(87)}
          >
            <i class="fa-solid fa-forward-step" />
          </button>
          <button
            id="remote-vol-up-btn"
            class="remote-btn"
            onClick={() => sendKey(24)}
          >
            <i class="fa-solid fa-volume-up" />
          </button>
        </div>

        <div class="remote-text-input">
          <input
            type="text"
            id="send-text-input"
            placeholder="Type text and press Enter..."
            value={textInput()}
            onInput={(e) => setTextInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendText()}
          />
          <button
            id="send-text-btn"
            class="btn-primary"
            onClick={handleSendText}
          >
            <i class="fa-solid fa-paper-plane" />
          </button>
        </div>
      </div>
    </div>
  );
};
