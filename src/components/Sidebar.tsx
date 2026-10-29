import { Component, For, Show } from "solid-js";
import {
  state,
  setState,
  toggleSidebar,
  updatePreference,
  refreshDevices,
  openConnect,
} from "../stateStore";
import { deviceStateLabel } from "../utils";
import { AnimatedLogo } from "./AnimatedLogo";

interface SidebarProps {
  onOpenSettings: () => void;
}

const navItems = [
  { id: "dashboard-tab", icon: "fa-solid fa-chart-line", label: "Dashboard", key: "1" },
  { id: "scrcpy-tab", icon: "fa-solid fa-eye", label: "Scrcpy", key: "2" },
  { id: "apps-tab", icon: "fa-brands fa-android", label: "Debloater", key: "3" },
  { id: "device-tab", icon: "fa-solid fa-mobile-alt", label: "Device Tools", key: "4" },
  { id: "files-tab", icon: "fa-solid fa-folder-open", label: "Files", key: "5" },
  { id: "remote-tab", icon: "fa-solid fa-gamepad", label: "Remote", key: "6" },
];

export const Sidebar: Component<SidebarProps> = (props) => {
  const device = () =>
    state.currentDevice ? state.deviceInfo[state.currentDevice] : null;
  const online = () => device()?.state === "device";

  return (
    <nav
      id="sidebar"
      classList={{
        collapsed: state.isSidebarCollapsed,
        expanded: !state.isSidebarCollapsed,
      }}
    >
      <div class="sidebar-header">
        <AnimatedLogo class="sidebar-logo" />
        <Show when={!state.isSidebarCollapsed}>
          <h1 id="sidebar-title">A.S.C.E.N.D.</h1>
        </Show>
        <button
          id="sidebar-collapse-btn"
          title={state.isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={state.isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleSidebar}
        >
          <i
            class={`fa-solid ${state.isSidebarCollapsed ? "fa-angles-right" : "fa-angles-left"}`}
          />
        </button>
      </div>

      <div class="sidebar-device-card">
        <button
          type="button"
          class="sidebar-device-main"
          title={state.currentDevice ? `${state.currentDevice} · Open connection center` : "Connect a device"}
          onClick={() => openConnect()}
        >
          <span class={`status-dot ${state.currentDevice ? (online() ? "online" : "warning") : "offline"}`} />
          <Show when={!state.isSidebarCollapsed}>
            <div class="sidebar-device-meta">
              <strong>{device()?.model || state.currentDevice || "No device"}</strong>
              <span>
                {state.currentDevice
                  ? deviceStateLabel(device()?.state || "unknown")
                  : "Click to connect over USB or Wi-Fi"}
              </span>
            </div>
          </Show>
        </button>
        <Show when={!state.isSidebarCollapsed}>
          <button
            class="icon-btn"
            title="Refresh connected devices"
            aria-label="Refresh connected devices"
            onClick={() => void refreshDevices({ quiet: false })}
          >
            <i class="fa-solid fa-arrows-rotate" />
          </button>
        </Show>
      </div>

      <Show when={!state.currentDevice && !state.isSidebarCollapsed}>
        <button class="sidebar-connect-btn" onClick={() => openConnect()}>
          <i class="fa-solid fa-plug-circle-plus" /> Connect device
        </button>
      </Show>

      <ul class="sidebar-nav-links">
        <For each={navItems}>
          {(item) => (
            <li>
              <a
                href="#"
                class={`nav-link ${state.activeTab === item.id ? "active" : ""}`}
                title={`${item.label} (Ctrl+${item.key})`}
                onClick={(event) => {
                  event.preventDefault();
                  setState("activeTab", item.id);
                }}
              >
                <i class={`${item.icon} fa-fw`} />
                <Show when={!state.isSidebarCollapsed}>
                  <span>{item.label}</span>
                  <kbd class="nav-kbd">{item.key}</kbd>
                </Show>
                <Show when={item.id === "apps-tab" && state.debloaterSelection.length > 0}>
                  <span class="nav-badge">{state.debloaterSelection.length}</span>
                </Show>
              </a>
            </li>
          )}
        </For>
      </ul>

      <div class="sidebar-footer">
        <a
          href="#"
          class={`nav-link ${state.logDrawerOpen ? "active-subtle" : ""}`}
          title="Toggle console (Ctrl+`)"
          onClick={(event) => {
            event.preventDefault();
            updatePreference("logDrawerOpen", !state.logDrawerOpen);
          }}
        >
          <i class="fa-solid fa-terminal fa-fw" />
          <Show when={!state.isSidebarCollapsed}>
            <span>Console</span>
            <kbd class="nav-kbd">`</kbd>
          </Show>
        </a>
        <a
          href="#"
          class="nav-link"
          title="Settings & logs"
          onClick={(event) => {
            event.preventDefault();
            props.onOpenSettings();
          }}
        >
          <i class="fa-solid fa-cog fa-fw" />
          <Show when={!state.isSidebarCollapsed}>
            <span>Settings</span>
          </Show>
        </a>
      </div>
    </nav>
  );
};
