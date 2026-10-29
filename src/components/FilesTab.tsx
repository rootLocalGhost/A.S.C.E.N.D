import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import { state, setState, runCommand, toast, log } from "../stateStore";
import { openFileDialog, saveFileDialog } from "../tauriApi";
import {
  copyText,
  cx,
  fileExtension,
  formatBytes,
  joinPath,
  shellQuote,
} from "../utils";
import { EmptyState } from "./ui";

interface FilesTabProps {
  onShowInput: (
    title: string,
    prompt: string,
    defaultVal?: string
  ) => Promise<string | null>;
  onShowConfirm: (msg: string) => Promise<boolean>;
}

export interface FileItem {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: number;
  type: string;
}

type SortMode = "name" | "date" | "size";

const TYPE_ICONS: Record<string, string> = {
  apk: "fa-brands fa-android",
  png: "fa-regular fa-image",
  jpg: "fa-regular fa-image",
  jpeg: "fa-regular fa-image",
  webp: "fa-regular fa-image",
  gif: "fa-regular fa-image",
  mp4: "fa-solid fa-film",
  mkv: "fa-solid fa-film",
  avi: "fa-solid fa-film",
  mov: "fa-solid fa-film",
  mp3: "fa-solid fa-music",
  wav: "fa-solid fa-music",
  flac: "fa-solid fa-music",
  m4a: "fa-solid fa-music",
  zip: "fa-solid fa-file-zipper",
  rar: "fa-solid fa-file-zipper",
  "7z": "fa-solid fa-file-zipper",
  tar: "fa-solid fa-file-zipper",
  gz: "fa-solid fa-file-zipper",
  pdf: "fa-solid fa-file-pdf",
  doc: "fa-solid fa-file-word",
  docx: "fa-solid fa-file-word",
  xls: "fa-solid fa-file-excel",
  xlsx: "fa-solid fa-file-excel",
  ppt: "fa-solid fa-file-powerpoint",
  txt: "fa-solid fa-file-lines",
  log: "fa-solid fa-file-lines",
  json: "fa-solid fa-file-code",
  xml: "fa-solid fa-file-code",
  html: "fa-solid fa-file-code",
  js: "fa-solid fa-file-code",
  ts: "fa-solid fa-file-code",
  css: "fa-solid fa-file-code",
  sh: "fa-solid fa-file-code",
  prop: "fa-solid fa-file-code",
};

function iconFor(file: FileItem): string {
  if (file.isDirectory) return "fa-solid fa-folder";
  return TYPE_ICONS[fileExtension(file.name)] || "fa-regular fa-file";
}

function stripDecorations(name: string): string {
  const arrow = name.indexOf(" -> ");
  const base = arrow >= 0 ? name.slice(0, arrow) : name;
  return base.replace(/[/@*=|]$/, "");
}

/** Joins a local Windows/POSIX path without touching device path semantics. */
function joinLocal(directory: string, name: string): string {
  const separator = directory.includes("\\") ? "\\" : "/";
  return `${directory.replace(/[\\/]+$/, "")}${separator}${name}`;
}

function parseListing(output: string): FileItem[] {
  const files: FileItem[] = [];
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("total ")) continue;

    const match = trimmed.match(
      /^([bcdlps-][rwxstST-]{9}[+.@]?)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/
    );

    if (match) {
      const [, type, rawSize, date, time, rawName] = match;
      const isDirectory = type.startsWith("d");
      const modified = new Date(`${date}T${time}`).getTime();
      files.push({
        name: stripDecorations(rawName),
        isDirectory,
        size: parseInt(rawSize, 10) || 0,
        modified: Number.isNaN(modified) ? 0 : modified,
        type: isDirectory ? "dir" : type.startsWith("l") ? "link" : "file",
      });
      continue;
    }

    // Fallback for devices with non-ISO `ls` output: keep the name only.
    if (/^[-dlbcps][rwxstST-]{9}/.test(trimmed)) {
      const parts = trimmed.split(/\s+/);
      const rawName = parts.slice(7).join(" ");
      if (rawName) {
        files.push({
          name: stripDecorations(rawName),
          isDirectory: trimmed.startsWith("d"),
          size: parseInt(parts[4], 10) || 0,
          modified: 0,
          type: trimmed.startsWith("d") ? "dir" : "file",
        });
      }
    }
  }

  return files.filter((file) => file.name && file.name !== "." && file.name !== "..");
}

const sortFiles = (files: FileItem[], mode: SortMode): FileItem[] => {
  return [...files].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    if (mode === "date") return b.modified - a.modified;
    if (mode === "size") return b.size - a.size;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
};

export const FilesTab: Component<FilesTabProps> = (props) => {
  const [files, setFiles] = createSignal<FileItem[]>([]);
  const [selected, setSelected] = createSignal<Set<string>>(new Set<string>());
  const [lastSelectedIndex, setLastSelectedIndex] = createSignal(-1);
  const [loading, setLoading] = createSignal(false);
  const [sortMode, setSortMode] = createSignal<SortMode>("name");
  const [error, setError] = createSignal<string | null>(null);
  const [pathEditing, setPathEditing] = createSignal(false);
  const [pathDraft, setPathDraft] = createSignal("");
  const [transfer, setTransfer] = createSignal<{ label: string; done: number; total: number } | null>(
    null
  );
  const [contextMenuPos, setContextMenuPos] = createSignal<{
    x: number;
    y: number;
    target: FileItem | null;
  } | null>(null);

  let pathInputRef: HTMLInputElement | undefined;

  const sortedFiles = createMemo(() => sortFiles(files(), sortMode()));
  const selectedFiles = createMemo(() => files().filter((file) => selected().has(file.name)));

  const listFiles = async (dirPath: string) => {
    if (!state.currentDevice) {
      setFiles([]);
      setError(null);
      return;
    }
    setState("currentDevicePath", dirPath);
    setSelected(new Set<string>());
    setLastSelectedIndex(-1);
    setLoading(true);
    setError(null);

    const res = await runCommand("adb", ["shell", `ls -laF ${shellQuote(dirPath)}`], {
      background: true,
      quiet: true,
      key: "device-ls",
      timeout: 45_000,
    });

    if (res) {
      const parsed = parseListing(res[0]);
      if (!parsed.length && res[0].trim()) {
        const fallback = await runCommand("adb", ["shell", `ls -F ${shellQuote(dirPath)}`], {
          background: true,
          quiet: true,
        });
        if (fallback) {
          const basic = fallback[0]
            .split("\n")
            .map((name) => name.trim())
            .filter(
              (name) =>
                name &&
                !name.startsWith("ls:") &&
                name !== "." &&
                name !== ".."
            )
            .map((raw) => ({
              name: stripDecorations(raw),
              isDirectory: raw.endsWith("/"),
              size: 0,
              modified: 0,
              type: raw.endsWith("/") ? "dir" : "file",
            }))
            .filter((file) => file.name);
          setFiles(basic);
        }
      } else {
        setFiles(parsed);
      }
    } else {
      setFiles([]);
      setError("Could not read this folder. It may require root access.");
    }

    setLoading(false);
  };

  createEffect(() => {
    if (state.activeTab === "files-tab" && state.currentDevice) {
      // Only react to device/tab changes; explicit navigation already calls listFiles.
      void listFiles(untrack(() => state.currentDevicePath));
    }
  });

  const parentPath = () => {
    const parts = state.currentDevicePath.split("/").filter(Boolean);
    parts.pop();
    return joinPath(...parts) || "/";
  };

  const goHome = () => void listFiles("/sdcard");

  const handleItemClick = (file: FileItem, event: MouseEvent) => {
    const index = sortedFiles().findIndex((item) => item.name === file.name);

    if (event.shiftKey && lastSelectedIndex() >= 0) {
      const start = Math.min(lastSelectedIndex(), index);
      const end = Math.max(lastSelectedIndex(), index);
      const range = sortedFiles().slice(start, end + 1).map((item) => item.name);
      setSelected(new Set(range));
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selected());
      if (next.has(file.name)) next.delete(file.name);
      else next.add(file.name);
      setSelected(next);
      setLastSelectedIndex(index);
      return;
    }

    setSelected(new Set([file.name]));
    setLastSelectedIndex(index);
  };

  const handleItemDblClick = (file: FileItem) => {
    if (file.isDirectory) {
      void listFiles(joinPath(state.currentDevicePath, file.name));
    } else {
      void downloadFiles([file]);
    }
  };

  const handleContextMenu = (event: MouseEvent, file: FileItem | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (file && !selected().has(file.name)) {
      setSelected(new Set([file.name]));
    }
    const menuWidth = 200;
    const menuHeight = file ? 330 : 150;
    setContextMenuPos({
      x: Math.min(event.clientX, window.innerWidth - menuWidth),
      y: Math.min(event.clientY, window.innerHeight - menuHeight),
      target: file,
    });
  };

  const downloadFiles = async (targets: FileItem[]) => {
    const filesToPull = targets.filter((file) => !file.isDirectory);
    if (!filesToPull.length) {
      toast("Select a file to download", "warning");
      return;
    }

    if (filesToPull.length === 1) {
      const file = filesToPull[0];
      const destination = await saveFileDialog(file.name);
      if (!destination) return;
      const res = await runCommand(
        "adb",
        ["pull", joinPath(state.currentDevicePath, file.name), destination],
        { label: `Downloading ${file.name}` }
      );
      if (res) toast(`${file.name} downloaded`, "success");
      return;
    }

    const directory = await openFileDialog({ directory: true, multiple: false });
    if (!directory || Array.isArray(directory)) return;

    let done = 0;
    setTransfer({ label: "Downloading", done, total: filesToPull.length });
    for (const file of filesToPull) {
      const res = await runCommand(
        "adb",
        ["pull", joinPath(state.currentDevicePath, file.name), joinLocal(directory, file.name)],
        { background: true, quiet: true, timeout: 600_000 }
      );
      if (res) done += 1;
      setTransfer({ label: "Downloading", done, total: filesToPull.length });
    }
    setTransfer(null);
    toast(
      `${done} of ${filesToPull.length} files downloaded`,
      done === filesToPull.length ? "success" : "warning"
    );
  };

  const uploadFiles = async () => {
    const picked = await openFileDialog({ multiple: true });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    if (!paths.length) return;

    let done = 0;
    setTransfer({ label: "Uploading", done, total: paths.length });
    for (const localPath of paths) {
      const name = localPath.split(/[\\/]/).pop() || "upload";
      const res = await runCommand(
        "adb",
        ["push", localPath, joinPath(state.currentDevicePath, name)],
        { background: true, quiet: true, timeout: 600_000 }
      );
      if (res) done += 1;
      setTransfer({ label: "Uploading", done, total: paths.length });
    }
    setTransfer(null);
    toast(`${done} of ${paths.length} items uploaded`, done === paths.length ? "success" : "warning");
    await listFiles(state.currentDevicePath);
  };

  const deleteFiles = async (targets: FileItem[]) => {
    if (!targets.length) return;
    const label =
      targets.length === 1 ? `"${targets[0].name}"` : `${targets.length} selected items`;
    if (
      !(await props.onShowConfirm(
        `Permanently delete ${label}? This cannot be undone.`
      ))
    ) {
      return;
    }

    let done = 0;
    setTransfer({ label: "Deleting", done, total: targets.length });
    for (const file of targets) {
      const res = await runCommand(
        "adb",
        ["shell", `rm -rf ${shellQuote(joinPath(state.currentDevicePath, file.name))}`],
        { background: true, quiet: true }
      );
      if (res) done += 1;
      setTransfer({ label: "Deleting", done, total: targets.length });
    }
    setTransfer(null);
    toast(
      `${done} item${done === 1 ? "" : "s"} deleted`,
      done === targets.length ? "success" : "warning"
    );
    setSelected(new Set<string>());
    await listFiles(state.currentDevicePath);
  };

  const renameFile = async (file: FileItem) => {
    const newName = await props.onShowInput(
      "Rename",
      `Enter a new name for "${file.name}":`,
      file.name
    );
    if (!newName || newName === file.name) return;
    const target = joinPath(state.currentDevicePath, file.name);
    const destination = joinPath(state.currentDevicePath, newName);
    const res = await runCommand("adb", ["shell", `mv ${shellQuote(target)} ${shellQuote(destination)}`]);
    if (res) {
      toast("Renamed", "success");
      await listFiles(state.currentDevicePath);
    }
  };

  const createFolder = async () => {
    const folderName = await props.onShowInput("New folder", "Enter a folder name:");
    if (!folderName) return;
    const path = joinPath(state.currentDevicePath, folderName);
    const res = await runCommand("adb", ["shell", `mkdir -p ${shellQuote(path)}`]);
    if (res) {
      toast("Folder created", "success");
      await listFiles(state.currentDevicePath);
    }
  };

  const handleContextAction = async (action: string) => {
    const target = contextMenuPos()?.target;
    const targets = selectedFiles().length ? selectedFiles() : target ? [target] : [];
    setContextMenuPos(null);

    if (action === "open" && targets[0]?.isDirectory) {
      void listFiles(joinPath(state.currentDevicePath, targets[0].name));
    } else if (action === "download") {
      await downloadFiles(targets);
    } else if (action === "upload") {
      await uploadFiles();
    } else if (action === "rename" && targets[0]) {
      await renameFile(targets[0]);
    } else if (action === "delete") {
      await deleteFiles(targets);
    } else if (action === "new-folder") {
      await createFolder();
    } else if (action === "copy-path" && targets[0]) {
      const ok = await copyText(joinPath(state.currentDevicePath, targets[0].name));
      toast(ok ? "Path copied" : "Could not copy path", ok ? "success" : "error");
    } else if (action === "refresh") {
      await listFiles(state.currentDevicePath);
    }
  };

  const breadcrumbParts = createMemo(() => {
    const parts = state.currentDevicePath.split("/").filter(Boolean);
    const result: Array<{ name: string; path: string }> = [{ name: "/", path: "/" }];
    let accumulated = "";
    parts.forEach((part) => {
      accumulated = joinPath(accumulated, part);
      result.push({ name: part, path: accumulated });
    });
    return result;
  });

  const totalSize = createMemo(() =>
    files().reduce((sum, file) => sum + (file.isDirectory ? 0 : file.size), 0)
  );

  const commitPath = () => {
    if (!pathEditing()) return;
    const value = pathDraft().trim();
    setPathEditing(false);
    if (value) void listFiles(value.startsWith("/") ? value : `/${value}`);
  };

  onMount(() => {
    const closeMenu = () => setContextMenuPos(null);
    const onKey = (event: KeyboardEvent) => {
      if (state.activeTab !== "files-tab") return;
      if (document.querySelector(".modal-overlay.active")) return;
      const target = event.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setPathDraft(state.currentDevicePath);
        setPathEditing(true);
        setTimeout(() => pathInputRef?.select(), 20);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !typing) {
        event.preventDefault();
        setSelected(new Set(files().map((file) => file.name)));
        return;
      }
      if (event.key === "Delete" && !typing) {
        event.preventDefault();
        void deleteFiles(selectedFiles());
        return;
      }
      if (event.key === "F5") {
        event.preventDefault();
        void listFiles(state.currentDevicePath);
        return;
      }
      if (event.key === "Backspace" && !typing) {
        event.preventDefault();
        void listFiles(parentPath());
        return;
      }
      if (event.key === "Escape") {
        setSelected(new Set<string>());
        setContextMenuPos(null);
      }
    };

    const onRefresh = () => void listFiles(state.currentDevicePath);

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ascend:refresh", onRefresh);
    onCleanup(() => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ascend:refresh", onRefresh);
    });
  });

  return (
    <div
      id="files-tab"
      class={`tab-content ${state.activeTab === "files-tab" ? "active" : ""}`}
    >
      <div class="file-explorer-header">
        <div class="file-nav-buttons">
          <button
            class="icon-btn"
            title="Up one level (Backspace)"
            aria-label="Up one level"
            onClick={() => void listFiles(parentPath())}
            disabled={state.currentDevicePath === "/"}
          >
            <i class="fa-solid fa-arrow-up" />
          </button>
          <button class="icon-btn" title="Home (/sdcard)" aria-label="Go to /sdcard" onClick={goHome}>
            <i class="fa-solid fa-house" />
          </button>
          <button
            class="icon-btn"
            title="Refresh (F5)"
            aria-label="Refresh folder"
            onClick={() => void listFiles(state.currentDevicePath)}
            disabled={loading()}
          >
            <i class={`fa-solid fa-rotate ${loading() ? "fa-spin" : ""}`} />
          </button>
        </div>

        <Show
          when={!pathEditing()}
          fallback={
            <div class="path-edit-wrap">
              <i class="fa-solid fa-terminal" />
              <input
                ref={pathInputRef}
                type="text"
                value={pathDraft()}
                onInput={(event) => setPathDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitPath();
                  if (event.key === "Escape") setPathEditing(false);
                }}
                onBlur={commitPath}
                aria-label="Device path"
              />
            </div>
          }
        >
          <nav id="file-breadcrumbs" title="Click the path to edit it">
            <For each={breadcrumbParts()}>
              {(bc, index) => (
                <>
                  <Show when={index() > 0}>
                    <span class="breadcrumb-separator">›</span>
                  </Show>
                  <button
                    class="breadcrumb-item"
                    onClick={() => void listFiles(bc.path)}
                  >
                    {bc.name}
                  </button>
                </>
              )}
            </For>
            <button
              class="icon-btn path-edit-btn"
              title="Edit path (Ctrl+L)"
              aria-label="Edit path"
              onClick={() => {
                setPathDraft(state.currentDevicePath);
                setPathEditing(true);
                setTimeout(() => pathInputRef?.select(), 20);
              }}
            >
              <i class="fa-solid fa-pen" />
            </button>
          </nav>
        </Show>

        <div class="file-toolbar-actions">
          <div class="filter-select compact">
            <i class="fa-solid fa-arrow-down-wide-short" />
            <select
              value={sortMode()}
              onChange={(event) => setSortMode(event.currentTarget.value as SortMode)}
              aria-label="Sort files"
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="size">Size</option>
            </select>
          </div>

          <div id="file-view-controls">
            <button
              class={`view-btn ${state.fileViewMode === "list" ? "active" : ""}`}
              title="List view"
              aria-label="List view"
              onClick={() => setState("fileViewMode", "list")}
            >
              <i class="fa-solid fa-list" />
            </button>
            <button
              class={`view-btn ${state.fileViewMode === "icon" ? "active" : ""}`}
              title="Grid view"
              aria-label="Grid view"
              onClick={() => setState("fileViewMode", "icon")}
            >
              <i class="fa-solid fa-grip" />
            </button>
          </div>

          <button class="btn-secondary small" onClick={createFolder}>
            <i class="fa-solid fa-folder-plus" /> <span class="btn-label">New folder</span>
          </button>
          <button class="btn-primary small" onClick={uploadFiles}>
            <i class="fa-solid fa-upload" /> <span class="btn-label">Upload</span>
          </button>
        </div>
      </div>

      <Show when={transfer()}>
        {(progress) => (
          <div class="file-transfer">
            <div class="batch-progress-text">
              <i class="fa-solid fa-circle-notch fa-spin" />
              <span>
                {progress().label} {progress().done} / {progress().total}
              </span>
            </div>
            <div class="progress-bar">
              <div
                class="progress-bar-fill"
                style={{ width: `${(progress().done / Math.max(progress().total, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}
      </Show>

      <div
        id="device-file-list-container"
        class={`file-list-container ${state.fileViewMode}-view`}
        onContextMenu={(event) => handleContextMenu(event, null)}
        onClick={() => setSelected(new Set<string>())}
      >
        <Show
          when={state.currentDevice}
          fallback={
            <div style={{ "grid-column": "1 / -1" }}>
              <EmptyState
                icon="fa-solid fa-mobile-screen-button"
                title="No device connected"
                description="Connect a device to browse its storage."
              />
            </div>
          }
        >
          <Show
            when={!error()}
            fallback={
              <div style={{ "grid-column": "1 / -1" }}>
                <EmptyState
                  icon="fa-solid fa-lock"
                  title="Cannot open this folder"
                  description={error() || undefined}
                >
                  <button class="btn-secondary" onClick={goHome}>
                    Go to /sdcard
                  </button>
                </EmptyState>
              </div>
            }
          >
            <Show
              when={!loading()}
              fallback={
                <div class="files-loading" style={{ "grid-column": "1 / -1" }}>
                  <i class="fa-solid fa-circle-notch fa-spin" /> Reading folder…
                </div>
              }
            >
              <Show
                when={sortedFiles().length > 0}
                fallback={
                  <div style={{ "grid-column": "1 / -1" }}>
                    <EmptyState
                      icon="fa-regular fa-folder-open"
                      title="This folder is empty"
                      description="Upload files or create a folder to get started."
                    >
                      <button class="btn-primary" onClick={uploadFiles}>
                        <i class="fa-solid fa-upload" /> Upload files
                      </button>
                    </EmptyState>
                  </div>
                }
              >
                <For each={sortedFiles()}>
                  {(file) => {
                    const isSelected = () => selected().has(file.name);
                    return (
                      <div
                        class={cx("file-item", isSelected() && "selected")}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleItemClick(file, event);
                        }}
                        onDblClick={() => handleItemDblClick(file)}
                        onContextMenu={(event) => handleContextMenu(event, file)}
                        title={
                          file.isDirectory
                            ? file.name
                            : `${file.name}\n${formatBytes(file.size)}${
                                file.modified
                                  ? `\n${new Date(file.modified).toLocaleString()}`
                                  : ""
                              }`
                        }
                      >
                        <i class={`${iconFor(file)} ${file.isDirectory ? "folder-icon" : ""}`} />
                        <div class="file-item-text">
                          <span class="file-name">{file.name}</span>
                          <Show when={!file.isDirectory}>
                            <span class="file-meta">
                              {formatBytes(file.size)}
                              {file.modified
                                ? ` · ${new Date(file.modified).toLocaleDateString()}`
                                : ""}
                            </span>
                          </Show>
                        </div>
                        <Show when={file.isDirectory}>
                          <i class="fa-solid fa-chevron-right file-chevron" />
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </Show>
          </Show>
        </Show>
      </div>

      <div class="file-status-bar">
        <span>
          {files().length} item{files().length === 1 ? "" : "s"}
          <Show when={totalSize() > 0}> · {formatBytes(totalSize())}</Show>
        </span>
        <Show when={selected().size > 0}>
          <span class="file-selection-summary">
            {selected().size} selected
            <button class="link-btn" onClick={() => setSelected(new Set<string>())}>
              Clear
            </button>
          </span>
        </Show>
        <span class="file-status-path">{state.currentDevicePath}</span>
      </div>

      <Show when={contextMenuPos()}>
        {(pos) => (
          <div
            id="file-context-menu"
            class="custom-context-menu"
            style={{
              top: `${pos().y}px`,
              left: `${pos().x}px`,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <Show when={pos().target?.isDirectory}>
              <button class="context-item" onClick={() => void handleContextAction("open")}>
                <i class="fa-solid fa-folder-open fa-fw" /> Open
              </button>
            </Show>
            <Show when={pos().target && !pos().target?.isDirectory}>
              <button class="context-item" onClick={() => void handleContextAction("download")}>
                <i class="fa-solid fa-download fa-fw" /> Download
              </button>
            </Show>
            <Show when={pos().target && selected().size > 1}>
              <button class="context-item" onClick={() => void handleContextAction("download")}>
                <i class="fa-solid fa-download fa-fw" /> Download {selected().size} files
              </button>
            </Show>
            <Show when={pos().target}>
              <button class="context-item" onClick={() => void handleContextAction("rename")}>
                <i class="fa-solid fa-i-cursor fa-fw" /> Rename
              </button>
              <button class="context-item" onClick={() => void handleContextAction("copy-path")}>
                <i class="fa-regular fa-copy fa-fw" /> Copy path
              </button>
              <button class="context-item danger" onClick={() => void handleContextAction("delete")}>
                <i class="fa-solid fa-trash fa-fw" /> Delete
              </button>
              <div class="context-item-separator" />
            </Show>
            <button class="context-item" onClick={() => void handleContextAction("upload")}>
              <i class="fa-solid fa-upload fa-fw" /> Upload here
            </button>
            <button class="context-item" onClick={() => void handleContextAction("new-folder")}>
              <i class="fa-solid fa-folder-plus fa-fw" /> New folder
            </button>
            <button class="context-item" onClick={() => void handleContextAction("refresh")}>
              <i class="fa-solid fa-rotate fa-fw" /> Refresh
            </button>
          </div>
        )}
      </Show>
    </div>
  );
};
