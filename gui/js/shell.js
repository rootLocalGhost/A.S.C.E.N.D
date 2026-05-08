// shell.js

import { $, selAll } from "./utils.js";
import { state } from "./state.js";
import { refreshView } from "./adb.js";

export function initShell() {
  initWindowControls();
  initSidebar();
  initTabs();
}

function initWindowControls() {
  $("minimize-btn")?.addEventListener("click", () =>
    window.electronAPI.minimizeWindow()
  );
  $("maximize-btn")?.addEventListener("click", () =>
    window.electronAPI.maximizeWindow()
  );
  $("close-btn")?.addEventListener("click", () =>
    window.electronAPI.closeWindow()
  );
}

function initSidebar() {
  const sidebar = $("sidebar");
  const toggleBtn = $("sidebar-toggle-btn");
  if (!sidebar || !toggleBtn) return;

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar.classList.toggle("expanded");
  });

  document.addEventListener("click", (e) => {
    if (
      sidebar.classList.contains("expanded") &&
      !e.target.closest("#sidebar")
    ) {
      sidebar.classList.remove("expanded");
    }
  });
}

function initTabs() {
  selAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetTabId = link.dataset.tab;

      if (link.id === "settings-btn") {
        const settingsModal = $("settings-modal");
        settingsModal.classList.add("active");
        const closeBtn = settingsModal.querySelector(".modal-close-btn");
        const modalClickHandler = (event) => {
          if (event.target === settingsModal) {
            settingsModal.classList.remove("active");
            settingsModal.removeEventListener("click", modalClickHandler);
          }
        };
        closeBtn.onclick = () => {
          settingsModal.classList.remove("active");
          settingsModal.removeEventListener("click", modalClickHandler);
        };
        settingsModal.addEventListener("click", modalClickHandler);
        return;
      }

      if (!targetTabId || state.activeTab === targetTabId) return;

      selAll(".nav-link.active").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      selAll(".tab-content.active").forEach((t) =>
        t.classList.remove("active")
      );
      $(targetTabId)?.classList.add("active");

      state.activeTab = targetTabId;
      refreshView();

      $("sidebar")?.classList.remove("expanded");
    });
  });
}

export function setBusy(isBusy) {
  state.isBusy = isBusy;
  document.body.classList.toggle("is-busy", isBusy);
}
