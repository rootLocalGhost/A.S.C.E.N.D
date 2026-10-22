import { Component } from "solid-js";
import { state, setState } from "../stateStore";
import logoImg from "../../assets/img/logo.png";

interface SidebarProps {
  onOpenSettings: () => void;
}

export const Sidebar: Component<SidebarProps> = (props) => {
  const toggleSidebar = () => {
    setState("isSidebarCollapsed", !state.isSidebarCollapsed);
  };

  const setTab = (tab: string) => {
    setState("activeTab", tab);
  };

  return (
    <>
      <button
        id="sidebar-toggle-btn"
        title="Toggle Sidebar"
        onClick={toggleSidebar}
      >
        <i class="fa-solid fa-bars" />
      </button>

      <nav id="sidebar" class={!state.isSidebarCollapsed ? "expanded" : ""}>
        <div class="sidebar-header">
          <img src={logoImg} alt="A.S.C.E.N.D. Logo" class="sidebar-logo" />
          <h1 id="sidebar-title">A.S.C.E.N.D.</h1>
        </div>

        <ul class="sidebar-nav-links">
          <li>
            <a
              href="#"
              class={`nav-link ${state.activeTab === "dashboard-tab" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setTab("dashboard-tab");
              }}
            >
              <i class="fa-solid fa-chart-line fa-fw" />
              <span>Dashboard</span>
            </a>
          </li>
          <li>
            <a
              href="#"
              class={`nav-link ${state.activeTab === "scrcpy-tab" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setTab("scrcpy-tab");
              }}
            >
              <i class="fa-solid fa-eye fa-fw" />
              <span>Scrcpy</span>
            </a>
          </li>
          <li>
            <a
              href="#"
              class={`nav-link ${state.activeTab === "apps-tab" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setTab("apps-tab");
              }}
            >
              <i class="fa-brands fa-android fa-fw" />
              <span>Debloater</span>
            </a>
          </li>
          <li>
            <a
              href="#"
              class={`nav-link ${state.activeTab === "device-tab" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setTab("device-tab");
              }}
            >
              <i class="fa-solid fa-mobile-alt fa-fw" />
              <span>Device Tools</span>
            </a>
          </li>
          <li>
            <a
              href="#"
              class={`nav-link ${state.activeTab === "files-tab" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setTab("files-tab");
              }}
            >
              <i class="fa-solid fa-folder-open fa-fw" />
              <span>Files</span>
            </a>
          </li>
          <li>
            <a
              href="#"
              class={`nav-link ${state.activeTab === "remote-tab" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setTab("remote-tab");
              }}
            >
              <i class="fa-solid fa-gamepad fa-fw" />
              <span>Remote</span>
            </a>
          </li>
        </ul>

        <div class="sidebar-footer">
          <a
            href="#"
            class="nav-link"
            onClick={(e) => {
              e.preventDefault();
              props.onOpenSettings();
            }}
          >
            <i class="fa-solid fa-cog fa-fw" />
            <span>Settings</span>
          </a>
        </div>
      </nav>
    </>
  );
};
