// files.js
import { state } from "./state.js";
import { runCommand } from "./adb.js";
import { $, hasControlChars, log } from "./utils.js";
import { showInputModal, showConfirmModal } from "./modals.js";

const path = {
  join: (...args) =>
    args
      .map((arg) => arg.replace(/\/$/, ""))
      .filter(Boolean)
      .join("/")
      .replace(/\/+/g, "/") || "/",
};

const posixShellQuote = (value) =>
  `'${String(value).replace(/'/g, `'\\''`)}'`;

const isValidPathSegment = (name) => {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return (
    trimmed.length > 0 &&
    trimmed !== "." &&
    trimmed !== ".." &&
    !trimmed.includes("/") &&
    !trimmed.includes("\\") &&
    !trimmed.includes("\0")
  );
};

export function initFileExplorer() {
  const container = $("device-file-list-container");

  container?.addEventListener("click", (e) => {
    const itemEl = e.target.closest(".file-item");
    if (!itemEl) return;
    container
      .querySelectorAll(".file-item.selected")
      .forEach((el) => el.classList.remove("selected"));
    itemEl.classList.add("selected");
    state.selectedFileItem = {
      name: itemEl.dataset.name,
      isDirectory: itemEl.dataset.isDirectory === "true",
    };
  });

  container?.addEventListener("dblclick", (e) => {
    const itemEl = e.target.closest(".file-item");
    if (itemEl && itemEl.dataset.isDirectory === "true") {
      const newPath = path.join(state.currentDevicePath, itemEl.dataset.name);
      listDeviceFiles(newPath);
    }
  });

  container?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const itemEl = e.target.closest(".file-item");
    state.contextMenuTarget = itemEl
      ? {
          name: itemEl.dataset.name,
          isDirectory: itemEl.dataset.isDirectory === "true",
        }
      : null;
    if (itemEl) {
      if (!itemEl.classList.contains("selected")) {
        container
          .querySelectorAll(".file-item.selected")
          .forEach((el) => el.classList.remove("selected"));
        itemEl.classList.add("selected");
        state.selectedFileItem = state.contextMenuTarget;
      }
    }
    showContextMenu(e.clientX, e.clientY);
  });

  $("file-view-list-btn")?.addEventListener("click", () =>
    setFileViewMode("list")
  );
  $("file-view-icon-btn")?.addEventListener("click", () =>
    setFileViewMode("icon")
  );

  $("file-context-menu")?.addEventListener("click", handleContextMenuAction);
  document.addEventListener("click", () => hideContextMenu());
}

export function listDeviceFiles(dirPath) {
  if (!state.currentDevice) {
    $("device-file-list-container").innerHTML =
      '<div class="app-list-placeholder">Please select a device.</div>';
    return;
  }
  if (hasControlChars(dirPath)) {
    log("Invalid device path.", "ERROR");
    return;
  }
  state.currentDevicePath = dirPath;
  state.selectedFileItem = null;
  renderBreadcrumbs();
  runCommand(
    "adb",
    ["shell", `ls -F ${posixShellQuote(dirPath)}`],
    false,
    "device-ls"
  );
}

export function parseAndRenderDeviceFiles(data) {
  const files = data
    .split("\n")
    .map((name) => name.trim())
    .filter(
      (name) =>
        name &&
        !name.startsWith("ls:") &&
        !name.startsWith("total") &&
        name !== "." &&
        name !== ".."
    );
  const fileObjects = files.map((name) => ({
    name: name.replace(/\/$/, ""),
    isDirectory: name.endsWith("/"),
  }));

  const listEl = $("device-file-list-container");
  listEl.innerHTML = "";
  listEl.className = `file-list-container ${state.fileViewMode}-view`;

  fileObjects.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  if (fileObjects.length === 0) {
    listEl.innerHTML =
      '<div class="app-list-placeholder" style="grid-column: 1 / -1;">Folder is empty.</div>';
    return;
  }

  fileObjects.forEach((file) => {
    const item = document.createElement("div");
    item.className = "file-item";
    item.dataset.name = file.name;
    item.dataset.isDirectory = file.isDirectory;
    const icon = file.isDirectory ? "fa-folder" : "fa-file-lines";
    item.innerHTML = `<i class="fa-solid ${icon}"></i> <span title="${file.name}">${file.name}</span>`;
    listEl.appendChild(item);
  });
}

function renderBreadcrumbs() {
  const container = $("file-breadcrumbs");
  container.innerHTML = "";
  const parts = state.currentDevicePath.split("/").filter((p) => p);
  let pathOnClick = "/";
  const rootEl = document.createElement("span");
  rootEl.className = "breadcrumb-item";
  rootEl.textContent = "/";
  rootEl.onclick = () => listDeviceFiles("/");
  container.appendChild(rootEl);
  parts.forEach((part, i) => {
    pathOnClick = path.join(pathOnClick, part);
    const separator = document.createElement("span");
    separator.className = "breadcrumb-separator";
    separator.textContent = "›";
    container.appendChild(separator);
    const el = document.createElement("span");
    el.className = "breadcrumb-item";
    el.textContent = part;
    if (i < parts.length - 1) {
      el.onclick = () => listDeviceFiles(pathOnClick);
    }
    container.appendChild(el);
  });
}

function setFileViewMode(mode) {
  state.fileViewMode = mode;
  $("file-view-list-btn").classList.toggle("active", mode === "list");
  $("file-view-icon-btn").classList.toggle("active", mode === "icon");
  $(
    "device-file-list-container"
  ).className = `file-list-container ${mode}-view`;
}

function showContextMenu(x, y) {
  const menu = $("file-context-menu");
  const { contextMenuTarget: target } = state;
  menu.querySelector('[data-action="open"]').style.display = target?.isDirectory
    ? "flex"
    : "none";
  menu.querySelector('[data-action="download"]').style.display =
    target && !target.isDirectory ? "flex" : "none";
  menu.querySelector('[data-action="rename"]').style.display = target
    ? "flex"
    : "none";
  menu.querySelector('[data-action="delete"]').style.display = target
    ? "flex"
    : "none";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.display = "block";
}

function hideContextMenu() {
  const menu = $("file-context-menu");
  if (menu) menu.style.display = "none";
}

async function handleContextMenuAction(e) {
  hideContextMenu();
  const action = e.target.closest(".context-item")?.dataset.action;
  if (!action) return;

  const item = state.contextMenuTarget;
  const targetPath = item
    ? path.join(state.currentDevicePath, item.name)
    : state.currentDevicePath;
  if (hasControlChars(targetPath)) {
    log("Invalid target path.", "ERROR");
    return;
  }

  if (action === "open" && item?.isDirectory) {
    listDeviceFiles(targetPath);
  } else if (action === "download" && item && !item.isDirectory) {
    const destination = await window.electronAPI.saveFile(item.name);
    if (destination) runCommand("adb", ["pull", targetPath, destination]);
  } else if (action === "rename" && item) {
    const newName = await showInputModal(
      "Rename",
      `Enter new name for "${item.name}":`,
      item.name
    );
    if (newName && newName !== item.name) {
      if (!isValidPathSegment(newName)) {
        log("Invalid file/folder name.", "ERROR");
        return;
      }
      const newPath = path.join(state.currentDevicePath, newName);
      runCommand("adb", [
        "shell",
        `mv ${posixShellQuote(targetPath)} ${posixShellQuote(newPath)}`,
      ]);
      setTimeout(() => listDeviceFiles(state.currentDevicePath), 500);
    }
  } else if (action === "delete" && item) {
    if (
      await showConfirmModal(
        `Are you sure you want to permanently delete "${item.name}"?`
      )
    ) {
      runCommand("adb", ["shell", `rm -rf ${posixShellQuote(targetPath)}`]);
      setTimeout(() => listDeviceFiles(state.currentDevicePath), 500);
    }
  } else if (action === "new-folder") {
    const folderName = await showInputModal(
      "New Folder",
      "Enter new folder name:"
    );
    if (folderName) {
      if (!isValidPathSegment(folderName)) {
        log("Invalid folder name.", "ERROR");
        return;
      }
      const newPath = path.join(state.currentDevicePath, folderName);
      runCommand("adb", ["shell", `mkdir ${posixShellQuote(newPath)}`]);
      setTimeout(() => listDeviceFiles(state.currentDevicePath), 500);
    }
  }
}
