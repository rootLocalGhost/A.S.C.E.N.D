import { Component, createSignal } from "solid-js";
import { state, runCommand } from "../stateStore";

export const ScrcpyTab: Component = () => {
  const [bitRate, setBitRate] = createSignal("");
  const [recordScreen, setRecordScreen] = createSignal(false);
  const [fullscreen, setFullscreen] = createSignal(false);
  const [turnScreenOff, setTurnScreenOff] = createSignal(false);
  const [showTouches, setShowTouches] = createSignal(false);
  const [stayAwake, setStayAwake] = createSignal(false);
  const [powerOffOnClose, setPowerOffOnClose] = createSignal(false);

  const startScrcpy = () => {
    if (!state.currentDevice) return;
    const args: string[] = [];
    if (bitRate()) args.push("--video-bit-rate", bitRate());
    if (recordScreen())
      args.push("--record", `scrcpy-record-${Date.now()}.mp4`);
    if (fullscreen()) args.push("--fullscreen");
    if (turnScreenOff()) args.push("--turn-screen-off");
    if (showTouches()) args.push("--show-touches");
    if (stayAwake()) args.push("--stay-awake");
    if (powerOffOnClose()) args.push("--power-off-on-close");

    runCommand("scrcpy", args, true);
  };

  return (
    <div
      id="scrcpy-tab"
      class={`tab-content ${state.activeTab === "scrcpy-tab" ? "active" : ""}`}
    >
      <div class="controls-grid">
        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-sliders" /> Display & Recording
          </div>
          <div class="card-content">
            <input
              type="text"
              id="bit-rate"
              placeholder="Video Bit Rate (e.g., 8M)"
              value={bitRate()}
              onInput={(e) => setBitRate(e.currentTarget.value)}
            />
            <label class="custom-checkbox">
              <input
                type="checkbox"
                checked={recordScreen()}
                onChange={(e) => setRecordScreen(e.currentTarget.checked)}
              />
              <div class="checkbox-box">
                <i class="fa-solid fa-check" />
              </div>
              <span>Record Screen to File</span>
            </label>
            <label class="custom-checkbox">
              <input
                type="checkbox"
                checked={fullscreen()}
                onChange={(e) => setFullscreen(e.currentTarget.checked)}
              />
              <div class="checkbox-box">
                <i class="fa-solid fa-check" />
              </div>
              <span>Start in Fullscreen</span>
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <i class="fa-solid fa-bolt" /> Device Control
          </div>
          <div class="card-content">
            <label class="custom-checkbox">
              <input
                type="checkbox"
                checked={turnScreenOff()}
                onChange={(e) => setTurnScreenOff(e.currentTarget.checked)}
              />
              <div class="checkbox-box">
                <i class="fa-solid fa-check" />
              </div>
              <span>Turn device screen off</span>
            </label>
            <label class="custom-checkbox">
              <input
                type="checkbox"
                checked={showTouches()}
                onChange={(e) => setShowTouches(e.currentTarget.checked)}
              />
              <div class="checkbox-box">
                <i class="fa-solid fa-check" />
              </div>
              <span>Show touches on device</span>
            </label>
            <label class="custom-checkbox">
              <input
                type="checkbox"
                checked={stayAwake()}
                onChange={(e) => setStayAwake(e.currentTarget.checked)}
              />
              <div class="checkbox-box">
                <i class="fa-solid fa-check" />
              </div>
              <span>Keep device awake</span>
            </label>
            <label class="custom-checkbox">
              <input
                type="checkbox"
                checked={powerOffOnClose()}
                onChange={(e) => setPowerOffOnClose(e.currentTarget.checked)}
              />
              <div class="checkbox-box">
                <i class="fa-solid fa-check" />
              </div>
              <span>Power off device on close</span>
            </label>
          </div>
        </div>
      </div>

      <button id="start-scrcpy-btn" class="btn-primary" onClick={startScrcpy}>
        <i class="fa-solid fa-play" /> Start Scrcpy
      </button>
    </div>
  );
};
