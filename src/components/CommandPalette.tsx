import { Component, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { state, setState, refreshDevices, runCommand, toggleSidebar, updatePreference, toast, log, openConnect, openToolsSetup } from "../stateStore";
import { cx } from "../utils";

interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  group: string;
  keywords?: string;
  run: () => void | Promise<void>;
}

const dispatch = (name: string) => window.dispatchEvent(new CustomEvent(name));

export const CommandPalette: Component = () => {
  const [query, setQuery] = createSignal("");
  const [activeIndex, setActiveIndex] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  const navigate = (tab: string) => {
    setState("activeTab", tab);
    close();
  };

  const actions: PaletteAction[] = [
    ...["dashboard-tab", "scrcpy-tab", "apps-tab", "device-tab", "files-tab", "remote-tab"].map(
      (tab, index) => {
        const labels = ["Dashboard", "Scrcpy Mirror", "Debloater", "Device Tools", "File Explorer", "Remote Control"];
        const icons = [
          "fa-solid fa-chart-line",
          "fa-solid fa-eye",
          "fa-brands fa-android",
          "fa-solid fa-mobile-alt",
          "fa-solid fa-folder-open",
          "fa-solid fa-gamepad",
        ];
        return {
          id: `nav-${tab}`,
          label: labels[index],
          hint: `Ctrl+${index + 1}`,
          icon: icons[index],
          group: "Navigate",
          keywords: "go open tab page",
          run: () => navigate(tab),
        };
      }
    ),
    {
      id: "connect-device",
      label: "Connect a device",
      icon: "fa-solid fa-plug-circle-plus",
      group: "Device",
      keywords: "usb wireless pair pairing adb setup authorize",
      run: () => {
        close();
        openConnect("usb");
      },
    },
    {
      id: "pair-wireless",
      label: "Pair device over Wi-Fi",
      icon: "fa-solid fa-wifi",
      group: "Device",
      keywords: "wireless debugging android 11 code port pair",
      run: () => {
        close();
        openConnect("wireless");
      },
    },
    {
      id: "tools-setup",
      label: "Install / Update platform tools",
      icon: "fa-solid fa-download",
      group: "Device",
      keywords: "adb fastboot platform-tools download install extract sdk google",
      run: () => {
        close();
        openToolsSetup();
      },
    },
    {
      id: "refresh-devices",
      label: "Refresh connected devices",
      icon: "fa-solid fa-arrows-rotate",
      group: "Device",
      keywords: "adb detect devices reconnect",
      run: async () => {
        close();
        await refreshDevices({ quiet: false });
        toast("Device list refreshed", "success");
      },
    },
    {
      id: "refresh-view",
      label: "Refresh current view",
      icon: "fa-solid fa-rotate",
      group: "Actions",
      keywords: "reload sync",
      run: () => {
        close();
        dispatch("ascend:refresh");
      },
    },
    {
      id: "screenshot",
      label: "Take screenshot",
      icon: "fa-solid fa-camera",
      group: "Actions",
      keywords: "capture screen save png",
      run: () => {
        close();
        dispatch("ascend:screenshot");
      },
    },
    {
      id: "wireless",
      label: "Enable wireless ADB",
      icon: "fa-solid fa-wifi",
      group: "Actions",
      keywords: "tcpip connect network",
      run: () => {
        close();
        dispatch("ascend:wireless");
      },
    },
    {
      id: "console",
      label: state.logDrawerOpen ? "Hide console" : "Show console",
      hint: "Ctrl+`",
      icon: "fa-solid fa-terminal",
      group: "View",
      keywords: "logs output terminal drawer",
      run: () => {
        close();
        updatePreference("logDrawerOpen", !state.logDrawerOpen);
      },
    },
    {
      id: "sidebar",
      label: state.isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
      icon: "fa-solid fa-table-columns",
      group: "View",
      keywords: "layout navigation",
      run: () => {
        close();
        toggleSidebar();
      },
    },
    {
      id: "settings",
      label: "Open settings",
      icon: "fa-solid fa-cog",
      group: "View",
      keywords: "preferences config theme",
      run: () => {
        close();
        dispatch("ascend:settings");
      },
    },
    {
      id: "copy-serial",
      label: "Copy device serial",
      icon: "fa-regular fa-copy",
      group: "Device",
      keywords: "clipboard adb id",
      run: async () => {
        close();
        if (!state.currentDevice) {
          toast("No device selected", "warning");
          return;
        }
        await navigator.clipboard.writeText(state.currentDevice);
        toast("Serial copied", "success");
      },
    },
    {
      id: "adb-restart",
      label: "Restart ADB server",
      icon: "fa-solid fa-power-off",
      group: "Device",
      keywords: "adb kill start troubleshoot",
      run: async () => {
        close();
        await runAdbRestart();
      },
    },
    {
      id: "clear-logs",
      label: "Clear console logs",
      icon: "fa-solid fa-broom",
      group: "View",
      keywords: "clear reset logs",
      run: () => {
        close();
        setState("logs", []);
        log("Console cleared.", "INFO");
      },
    },
  ];

  const runAdbRestart = async () => {
    await runCommand("adb", ["kill-server"], { quiet: true });
    await runCommand("adb", ["start-server"], { background: true, quiet: true });
    await refreshDevices({ quiet: false });
    toast("ADB server restarted", "success");
  };

  const filtered = createMemo(() => {
    const term = query().trim().toLowerCase();
    if (!term) return actions;
    const words = term.split(/\s+/);
    return actions.filter((action) => {
      const haystack = `${action.label} ${action.group} ${action.keywords || ""} ${action.hint || ""}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  });

  const close = () => {
    setState("paletteOpen", false);
    setQuery("");
    setActiveIndex(0);
  };

  const runActive = () => {
    const action = filtered()[activeIndex()];
    if (action) void action.run();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(filtered().length, 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        (index - 1 + Math.max(filtered().length, 1)) % Math.max(filtered().length, 1)
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runActive();
    }
  };

  onMount(() => {
    const open = () => {
      setState("paletteOpen", true);
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef?.focus(), 20);
    };
    window.addEventListener("ascend:palette", open);
    onCleanup(() => {
      window.removeEventListener("ascend:palette", open);
    });
  });

  return (
    <Show when={state.paletteOpen}>
      <div
        class="palette-overlay"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div class="palette-window" role="dialog" aria-label="Command palette" aria-modal="true">
          <div class="palette-search">
            <i class="fa-solid fa-magnifying-glass" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a command or jump to a page…"
              value={query()}
              onInput={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              aria-label="Search commands"
            />
            <kbd>Esc</kbd>
          </div>

          <div class="palette-results" role="listbox">
            <Show
              when={filtered().length > 0}
              fallback={
                <div class="palette-empty">
                  <i class="fa-solid fa-ghost" />
                  No matching commands
                </div>
              }
            >
              <For each={filtered()}>
                {(action, index) => (
                  <>
                    <Show when={index() === 0 || filtered()[index() - 1].group !== action.group}>
                      <div class="palette-group-label">{action.group}</div>
                    </Show>
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeIndex() === index()}
                      class={cx("palette-item", activeIndex() === index() && "active")}
                      onMouseEnter={() => setActiveIndex(index())}
                      onClick={() => void action.run()}
                    >
                      <i class={`${action.icon} palette-item-icon`} />
                      <span class="palette-item-label">{action.label}</span>
                      <Show when={action.hint}>
                        <kbd>{action.hint}</kbd>
                      </Show>
                    </button>
                  </>
                )}
              </For>
            </Show>
          </div>

          <div class="palette-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> run</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
        </div>
      </div>
    </Show>
  );
};
