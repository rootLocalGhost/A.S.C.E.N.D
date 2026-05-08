// debloater.js
import { state } from "./state.js";
import { runCommand } from "./adb.js";
import { $, sel, selAll, escapeHtml } from "./utils.js";
import { showConfirmModal } from "./modals.js";

let fullAppListCache = [];
const selectedPackages = new Set();
let activeFilters = { safety: "all", oem: "all", search: "" };
const allowedSafetyClasses = new Set([
  "advanced",
  "expert",
  "recommended",
  "unsafe",
  "unknown",
]);
export function initDebloater() {
  selAll(".app-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selAll(".app-filter-btn.active").forEach((b) =>
        b.classList.remove("active")
      );
      btn.classList.add("active");
      state.currentAppFilter = btn.dataset.filter;
      listApps();
    });
  });

  $("app-search-input").addEventListener("input", (e) => {
    activeFilters.search = e.target.value.toLowerCase();
    renderAppList();
  });

  initCustomDropdown("filter-safety-dropdown", "safety");
  initCustomDropdown("filter-oem-dropdown", "oem");

  $("app-list-container").addEventListener("click", (e) => {
    const item = e.target.closest(".app-list-item");
    if (!item) return;
    const pkg = item.dataset.packageName;
    item.classList.toggle("selected");
    selectedPackages.has(pkg)
      ? selectedPackages.delete(pkg)
      : selectedPackages.add(pkg);
    updateSelectionBar();
  });

  $("selection-action-disable").addEventListener("click", () =>
    handleBatchAction("disable")
  );
  $("selection-action-uninstall").addEventListener("click", () =>
    handleBatchAction("uninstall")
  );
  $("selection-action-clear").addEventListener("click", clearSelection);
}

function initCustomDropdown(dropdownId, filterKey) {
  const dropdown = $(dropdownId);
  const selected = dropdown.querySelector(".dropdown-selected");
  const menu = dropdown.querySelector(".dropdown-menu");

  selected.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });

  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".dropdown-item");
    if (!item) return;
    selected.querySelector("span").textContent = item.textContent;
    activeFilters[filterKey] = item.dataset.value;
    renderAppList();
  });

  document.addEventListener("click", () => menu.classList.remove("open"));
}

export function listApps() {
  if (!state.currentDevice) {
    $("app-list-container").innerHTML =
      '<div class="app-list-placeholder">Select a device to load apps.</div>';
    return;
  }
  $("app-list-container").innerHTML =
    '<div class="app-list-placeholder"><i class="fa-solid fa-spinner fa-spin"></i> Loading apps...</div>';
  clearSelection();

  let args = ["shell", "pm", "list", "packages", "-e"];
  if (state.currentAppFilter === "system") args.push("-s");
  if (state.currentAppFilter === "user") args.push("-3");

  runCommand("adb", args, false, "list-apps");
}

export function populateAppList(data) {
  fullAppListCache = data
    .split("\n")
    .map((line) => line.replace("package:", "").trim())
    .filter(Boolean)
    .map((pkg) => {
      const dbInfo = state.debloatDB[pkg] || {};
      return {
        id: pkg,
        list: dbInfo.list || "Unknown",
        description: dbInfo.description || "No description available.",
        dependencies: dbInfo.dependencies || [],
        neededBy: dbInfo.neededBy || [],
        labels: dbInfo.labels || [],
        removal: (dbInfo.removal || "unknown").toLowerCase(),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  populateFilterDropdowns();
  renderAppList();
}

function populateFilterDropdowns() {
  const oems = new Set(fullAppListCache.map((app) => app.list));
  const safeties = new Set(fullAppListCache.map((app) => app.removal));

  const populate = (menuId, items, defaultText) => {
    const menu = $(menuId).querySelector(".dropdown-menu");
    menu.innerHTML = `<div class="dropdown-item" data-value="all">${defaultText}</div>`;
    items.forEach((item) => {
      const el = document.createElement("div");
      el.className = "dropdown-item";
      el.dataset.value = item;
      el.textContent = item;
      menu.appendChild(el);
    });
  };

  populate("filter-oem-dropdown", [...oems].sort(), "All Lists");
  populate("filter-safety-dropdown", [...safeties].sort(), "All Safety");
}

function renderAppList() {
  const listEl = $("app-list-container");

  const filteredApps = fullAppListCache.filter((app) => {
    const safetyMatch =
      activeFilters.safety === "all" || app.removal === activeFilters.safety;
    const oemMatch =
      activeFilters.oem === "all" || app.list === activeFilters.oem;
    const searchMatch =
      activeFilters.search === "" ||
      app.id.toLowerCase().includes(activeFilters.search) ||
      (state.debloatDB[app.id]?.name || "")
        .toLowerCase()
        .includes(activeFilters.search);
    return safetyMatch && oemMatch && searchMatch;
  });

  if (filteredApps.length === 0) {
    listEl.innerHTML =
      '<div class="app-list-placeholder">No applications match your filters.</div>';
    return;
  }

  listEl.innerHTML = filteredApps
    .map((app) => {
      const isSelected = selectedPackages.has(app.id);
      const safetyClass = allowedSafetyClasses.has(app.removal)
        ? app.removal
        : "unknown";
      const escapedPackage = escapeHtml(app.id);
      const escapedList = escapeHtml(app.list);
      const escapedSafety = escapeHtml(app.removal);
      const escapedDescription = escapeHtml(app.description).replace(
        /\n/g,
        "<br>"
      );
      const escapedLabels = app.labels.map(escapeHtml).join(", ");
      const escapedDependencies = app.dependencies.map(escapeHtml).join(", ");
      const escapedNeededBy = app.neededBy.map(escapeHtml).join(", ");
      return `
      <div class="app-list-item ${
        isSelected ? "selected" : ""
      }" data-package-name="${escapedPackage}">
        <div class="app-item-header">
          <div class="app-checkbox"><i class="fa-solid fa-check"></i></div>
          <div class="app-info">
            <div class="app-info-pkg" title="${escapedPackage}">${escapedPackage}</div>
            <div class="app-info-list">${escapedList}</div>
          </div>
          <div class="app-safety-badge ${safetyClass}">${escapedSafety}</div>
        </div>
        <div class="app-details-desc">${escapedDescription}</div>
        <div class="app-details-grid">
            <strong>Labels:</strong>       <span>${escapedLabels}</span>
            <strong>Dependencies:</strong> <span>${escapedDependencies}</span>
            <strong>Needed By:</strong>     <span>${escapedNeededBy}</span>
        </div>
      </div>
    `;
    })
    .join("");
}

function updateSelectionBar() {
  const count = selectedPackages.size;
  const bar = $("selection-action-bar");
  if (count > 0) {
    $("selection-count").textContent = `${count} app${
      count > 1 ? "s" : ""
    } selected`;
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
  }
}

function clearSelection() {
  selectedPackages.clear();
  selAll(".app-list-item.selected").forEach((el) =>
    el.classList.remove("selected")
  );
  updateSelectionBar();
}

async function handleBatchAction(action) {
  const count = selectedPackages.size;
  if (count === 0) return;
  const actionVerb = action === "uninstall" ? "Uninstall" : "Disable";
  const confirmation = await showConfirmModal(
    `Are you sure you want to ${action} ${count} app${count > 1 ? "s" : ""}?`
  );
  if (!confirmation) return;
  const packagesToAction = Array.from(selectedPackages);
  for (const pkg of packagesToAction) {
    const args =
      action === "uninstall"
        ? ["shell", "pm", "uninstall", "-k", "--user", "0", pkg]
        : ["shell", "pm", "disable-user", "--user", "0", pkg];
    runCommand("adb", args, true, `batch-${action}`);
  }
  setTimeout(listApps, 500 * Math.max(1, count / 2));
}
