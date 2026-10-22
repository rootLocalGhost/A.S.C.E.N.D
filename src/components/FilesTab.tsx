import {
  Component,
  createSignal,
  createEffect,
  For,
  Show,
  onMount,
  onCleanup,
} from "solid-js";
import { state, setState, runCommand, log } from "../stateStore";
import { saveFileDialog, openFileDialog } from "../tauriApi";
import { joinPath, escapeShellPath } from "../utils";

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
}

export const FilesTab: Component<FilesTabProps> = (props) => {
  const [files, setFiles] = createSignal<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = createSignal<FileItem | null>(null);
  const [contextMenuPos, setContextMenuPos] = createSignal<{
    x: number;
    y: number;
    target: FileItem | null;
  } | null>(null);

  const listFiles = async (dirPath: string) => {
    if (!state.currentDevice) {
      setFiles([]);
      return;
    }
    setState("currentDevicePath", dirPath);
    setSelectedFile(null);

    const safeDirPath = escapeShellPath(dirPath);
    const res = await runCommand(
      "adb",
      ["shell", `ls -F '${safeDirPath}'`],
      false,
      "device-ls"
    );
    if (res) {
      const [data] = res;
      const parsed = data
        .split("\n")
        .map((name) => name.trim())
        .filter(
          (name) =>
            name &&
            !name.startsWith("ls:") &&
            !name.startsWith("total") &&
            name !== "." &&
            name !== ".."
        )
        .map((name) => ({
          name: name.replace(/\/$/, ""),
          isDirectory: name.endsWith("/"),
        }));

      parsed.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });

      setFiles(parsed);
    }
  };

  createEffect(() => {
    if (state.activeTab === "files-tab" && state.currentDevice) {
      listFiles(state.currentDevicePath);
    }
  });

  const handleGlobalClick = () => setContextMenuPos(null);

  onMount(() => {
    window.addEventListener("click", handleGlobalClick);
  });

  onCleanup(() => {
    window.removeEventListener("click", handleGlobalClick);
  });

  const handleItemClick = (file: FileItem) => {
    setSelectedFile(file);
  };

  const handleItemDblClick = (file: FileItem) => {
    if (file.isDirectory) {
      const newPath = joinPath(state.currentDevicePath, file.name);
      listFiles(newPath);
    }
  };

  const handleContextMenu = (e: MouseEvent, file: FileItem | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (file) setSelectedFile(file);
    setContextMenuPos({
      x: e.clientX,
      y: e.clientY,
      target: file,
    });
  };

  const handleContextAction = async (action: string) => {
    const target = contextMenuPos()?.target || selectedFile();
    const currentPath = state.currentDevicePath;
    const targetPath = target
      ? joinPath(currentPath, target.name)
      : currentPath;

    setContextMenuPos(null);

    if (action === "open" && target?.isDirectory) {
      listFiles(targetPath);
    } else if (action === "download" && target && !target.isDirectory) {
      const destination = await saveFileDialog(target.name);
      if (destination) {
        await runCommand("adb", ["pull", targetPath, destination]);
      }
    } else if (action === "upload") {
      const sourceFile = await openFileDialog();
      if (sourceFile) {
        log(`Uploading ${sourceFile} to ${currentPath}...`, "INFO");
        await runCommand("adb", ["push", sourceFile, currentPath]);
        await listFiles(currentPath);
      }
    } else if (action === "rename" && target) {
      const newName = await props.onShowInput(
        "Rename",
        `Enter new name for "${target.name}":`,
        target.name
      );
      if (newName && newName !== target.name) {
        const newPath = joinPath(currentPath, newName);
        const safeOld = escapeShellPath(targetPath);
        const safeNew = escapeShellPath(newPath);
        await runCommand("adb", ["shell", `mv '${safeOld}' '${safeNew}'`]);
        await listFiles(currentPath);
      }
    } else if (action === "delete" && target) {
      if (
        await props.onShowConfirm(
          `Are you sure you want to permanently delete "${target.name}"?`
        )
      ) {
        const safeTarget = escapeShellPath(targetPath);
        await runCommand("adb", ["shell", `rm -rf '${safeTarget}'`]);
        await listFiles(currentPath);
      }
    } else if (action === "new-folder") {
      const folderName = await props.onShowInput(
        "New Folder",
        "Enter new folder name:"
      );
      if (folderName) {
        const newPath = joinPath(currentPath, folderName);
        const safeNewPath = escapeShellPath(newPath);
        await runCommand("adb", ["shell", `mkdir -p '${safeNewPath}'`]);
        await listFiles(currentPath);
      }
    }
  };

  const breadcrumbParts = () => {
    const parts = state.currentDevicePath.split("/").filter(Boolean);
    const result: Array<{ name: string; path: string }> = [];
    let accumulated = "/";
    result.push({ name: "/", path: "/" });

    parts.forEach((part) => {
      accumulated = joinPath(accumulated, part);
      result.push({ name: part, path: accumulated });
    });
    return result;
  };

  return (
    <div
      id="files-tab"
      class={`tab-content ${state.activeTab === "files-tab" ? "active" : ""}`}
    >
      <div class="file-explorer-header">
        <div id="file-view-controls">
          <button
            class={`view-btn ${state.fileViewMode === "list" ? "active" : ""}`}
            title="List View"
            onClick={() => setState("fileViewMode", "list")}
          >
            <i class="fa-solid fa-list" />
          </button>
          <button
            class={`view-btn ${state.fileViewMode === "icon" ? "active" : ""}`}
            title="Icon View"
            onClick={() => setState("fileViewMode", "icon")}
          >
            <i class="fa-solid fa-grip" />
          </button>
        </div>

        <nav id="file-breadcrumbs">
          <For each={breadcrumbParts()}>
            {(bc, i) => (
              <>
                <Show when={i() > 0}>
                  <span class="breadcrumb-separator">›</span>
                </Show>
                <span
                  class="breadcrumb-item"
                  onClick={() => listFiles(bc.path)}
                >
                  {bc.name}
                </span>
              </>
            )}
          </For>
        </nav>
      </div>

      <div
        id="device-file-list-container"
        class={`file-list-container ${state.fileViewMode}-view`}
        onContextMenu={(e) => handleContextMenu(e, null)}
      >
        <Show
          when={state.currentDevice}
          fallback={
            <div class="app-list-placeholder">Select a device to browse files.</div>
          }
        >
          <Show
            when={files().length > 0}
            fallback={
              <div
                class="app-list-placeholder"
                style={{ "grid-column": "1 / -1" }}
              >
                Folder is empty.
              </div>
            }
          >
            <For each={files()}>
              {(file) => {
                const isSelected = () => selectedFile()?.name === file.name;
                return (
                  <div
                    class={`file-item ${isSelected() ? "selected" : ""}`}
                    onClick={() => handleItemClick(file)}
                    onDblClick={() => handleItemDblClick(file)}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                  >
                    <i
                      class={`fa-solid ${
                        file.isDirectory ? "fa-folder" : "fa-file-lines"
                      }`}
                    />
                    <span title={file.name}>{file.name}</span>
                  </div>
                );
              }}
            </For>
          </Show>
        </Show>
      </div>

      <Show when={contextMenuPos()}>
        {(pos) => (
          <div
            id="file-context-menu"
            class="custom-context-menu"
            style={{
              display: "block",
              top: `${pos().y}px`,
              left: `${pos().x}px`,
            }}
          >
            <Show when={pos().target?.isDirectory}>
              <div
                class="context-item"
                onClick={() => handleContextAction("open")}
              >
                <i class="fa-solid fa-folder-open fa-fw" /> Open
              </div>
            </Show>
            <Show when={pos().target && !pos().target?.isDirectory}>
              <div
                class="context-item"
                onClick={() => handleContextAction("download")}
              >
                <i class="fa-solid fa-download fa-fw" /> Download
              </div>
            </Show>
            <Show when={pos().target}>
              <div class="context-item-separator" />
              <div
                class="context-item"
                onClick={() => handleContextAction("rename")}
              >
                <i class="fa-solid fa-i-cursor fa-fw" /> Rename
              </div>
              <div
                class="context-item"
                onClick={() => handleContextAction("delete")}
              >
                <i class="fa-solid fa-trash fa-fw" /> Delete
              </div>
            </Show>
            <div class="context-item-separator" />
            <div
              class="context-item"
              onClick={() => handleContextAction("upload")}
            >
              <i class="fa-solid fa-upload fa-fw" /> Upload File
            </div>
            <div
              class="context-item"
              onClick={() => handleContextAction("new-folder")}
            >
              <i class="fa-solid fa-folder-plus fa-fw" /> New Folder
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
