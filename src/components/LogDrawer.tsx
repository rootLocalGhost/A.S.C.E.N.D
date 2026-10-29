import { Component, createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { state, setState, updatePreference, log, toast } from "../stateStore";
import { copyText, cx, downloadTextFile } from "../utils";
import { ToggleSwitch } from "./ui";

const typeOptions = ["ALL", "CMD", "INFO", "SUCCESS", "ERROR"] as const;

export const LogDrawer: Component = () => {
  const [filter, setFilter] = createSignal<(typeof typeOptions)[number]>("ALL");
  const [search, setSearch] = createSignal("");
  let scrollRef: HTMLDivElement | undefined;

  const filtered = createMemo(() => {
    const term = search().trim().toLowerCase();
    return state.logs.filter((entry) => {
      const typeMatch = filter() === "ALL" || entry.type === filter();
      const searchMatch = !term || entry.message.toLowerCase().includes(term);
      return typeMatch && searchMatch;
    });
  });

  const scrollToBottom = () => {
    if (!scrollRef) return;
    scrollRef.scrollTop = scrollRef.scrollHeight;
  };

  createEffect(() => {
    const length = state.logs.length;
    if (state.logDrawerOpen && state.preferences.logAutoScroll && length) {
      setTimeout(scrollToBottom, 20);
    }
  });

  onMount(() => {
    if (state.logDrawerOpen) setTimeout(scrollToBottom, 60);
  });

  const copyLogs = async () => {
    const text = filtered()
      .map((entry) => `[${entry.time}] [${entry.type}] ${entry.message}`)
      .join("\n");
    const ok = await copyText(text);
    toast(ok ? "Console copied" : "Could not copy console", ok ? "success" : "error");
  };

  return (
    <Show when={state.logDrawerOpen}>
      <section id="log-drawer" aria-label="Console">
        <div class="log-drawer-header">
          <div class="log-drawer-title">
            <i class="fa-solid fa-terminal" />
            <span>Console</span>
            <span class="log-count">{state.logs.length}</span>
          </div>

          <div class="log-filters">
            <For each={typeOptions}>
              {(type) => (
                <button
                  type="button"
                  class={cx("log-filter-btn", filter() === type && "active", `log-filter-${type.toLowerCase()}`)}
                  onClick={() => setFilter(type)}
                >
                  {type === "ALL" ? "All" : type.toLowerCase()}
                </button>
              )}
            </For>
          </div>

          <input
            class="log-search"
            type="text"
            placeholder="Filter output…"
            value={search()}
            onInput={(event) => setSearch(event.currentTarget.value)}
            aria-label="Filter console output"
          />

          <div class="log-drawer-actions">
            <label class="log-autoscroll" title="Auto-scroll to newest entry">
              <span>Auto-scroll</span>
              <ToggleSwitch
                checked={state.preferences.logAutoScroll}
                onChange={(checked) => updatePreference("logAutoScroll", checked)}
                label="Auto-scroll console"
              />
            </label>
            <button class="icon-btn" title="Copy visible output" aria-label="Copy console" onClick={copyLogs}>
              <i class="fa-regular fa-copy" />
            </button>
            <button
              class="icon-btn"
              title="Download console log"
              aria-label="Download console log"
              onClick={() => {
                const text = state.logs
                  .map((entry) => `[${entry.time}] [${entry.type}] ${entry.message}`)
                  .join("\n");
                downloadTextFile(`ascend-console-${Date.now()}.log`, text);
                toast("Console log exported", "success");
              }}
            >
              <i class="fa-solid fa-download" />
            </button>
            <button
              class="icon-btn danger"
              title="Clear console"
              aria-label="Clear console"
              onClick={() => {
                setState("logs", []);
                log("Console cleared.", "INFO");
              }}
            >
              <i class="fa-solid fa-trash" />
            </button>
            <button
              class="icon-btn"
              title="Close console (Ctrl+`)"
              aria-label="Close console"
              onClick={() => updatePreference("logDrawerOpen", false)}
            >
              <i class="fa-solid fa-chevron-down" />
            </button>
          </div>
        </div>

        <div class="log-drawer-body" ref={scrollRef}>
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="log-empty">
                <i class="fa-solid fa-wave-square" />
                <span>No output yet. Commands will appear here.</span>
              </div>
            }
          >
            <For each={filtered()}>
              {(entry) => (
                <div class={`log-entry log-${entry.type.toLowerCase()}`}>
                  <span class="log-time">{entry.time}</span>
                  <span class="log-type">{entry.type}</span>
                  <span class="log-message">{entry.message}</span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </section>
    </Show>
  );
};
