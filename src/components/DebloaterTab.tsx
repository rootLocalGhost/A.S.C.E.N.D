import {
  Component,
  createSignal,
  createEffect,
  For,
  Show,
  onMount,
} from "solid-js";
import { state, setState, runCommand } from "../stateStore";
import { getDebloatDb } from "../tauriApi";

export interface AppItem {
  id: string;
  list: string;
  description: string;
  dependencies: string[];
  neededBy: string[];
  labels: string[];
  removal: string;
}

interface DebloaterTabProps {
  onShowConfirm: (msg: string) => Promise<boolean>;
}

export const DebloaterTab: Component<DebloaterTabProps> = (props) => {
  const [apps, setApps] = createSignal<AppItem[]>([]);
  const [selectedPackages, setSelectedPackages] = createSignal<Set<string>>(
    new Set<string>()
  );
  const [search, setSearch] = createSignal("");
  const [safetyFilter, setSafetyFilter] = createSignal("all");
  const [oemFilter, setOemFilter] = createSignal("all");
  const [loading, setLoading] = createSignal(false);

  const [safetyOpen, setSafetyOpen] = createSignal(false);
  const [oemOpen, setOemOpen] = createSignal(false);

  onMount(async () => {
    try {
      const rawDb = await getDebloatDb();
      const formattedDB: Record<string, any> = {};
      if (Array.isArray(rawDb)) {
        for (const item of rawDb) {
          if (item && item.id) {
            formattedDB[item.id] = {
              name: item.name || item.list || item.id.split(".").pop(),
              description: item.description || "No description available.",
              safety: item.safety || item.removal || "unknown",
              list: item.list || "Unknown",
              removal: item.removal || item.safety || "unknown",
              dependencies: item.dependencies || [],
              neededBy: item.neededBy || [],
              labels: item.labels || [],
            };
          }
        }
      }
      setState("debloatDB", formattedDB);
    } catch (e) {
      console.error("Failed to load debloat db:", e);
    }
  });

  const listApps = async () => {
    if (!state.currentDevice) {
      setApps([]);
      return;
    }
    setLoading(true);
    setSelectedPackages(new Set<string>());

    const args = ["shell", "pm", "list", "packages", "-e"];
    if (state.currentAppFilter === "system") args.push("-s");
    if (state.currentAppFilter === "user") args.push("-3");

    const res = await runCommand("adb", args, false, "list-apps");
    if (res) {
      const [data] = res;
      const list = data
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
            removal: (dbInfo.removal || dbInfo.safety || "unknown").toLowerCase(),
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id));

      setApps(list);
    }
    setLoading(false);
  };

  createEffect(() => {
    if (state.activeTab === "apps-tab" && state.currentDevice) {
      listApps();
    }
  });

  const availableOems = () => {
    const oems = new Set<string>();
    apps().forEach((a) => oems.add(a.list));
    return Array.from(oems).sort();
  };

  const availableSafeties = () => {
    const safeties = new Set<string>();
    apps().forEach((a) => safeties.add(a.removal));
    return Array.from(safeties).sort();
  };

  const filteredApps = () => {
    return apps().filter((app) => {
      const safetyMatch =
        safetyFilter() === "all" || app.removal === safetyFilter();
      const oemMatch = oemFilter() === "all" || app.list === oemFilter();
      const searchMatch =
        search() === "" ||
        app.id.toLowerCase().includes(search().toLowerCase()) ||
        (state.debloatDB[app.id]?.name || "")
          .toLowerCase()
          .includes(search().toLowerCase());
      return safetyMatch && oemMatch && searchMatch;
    });
  };

  const toggleSelect = (pkg: string) => {
    const current = new Set(selectedPackages());
    if (current.has(pkg)) {
      current.delete(pkg);
    } else {
      current.add(pkg);
    }
    setSelectedPackages(current);
  };

  const clearSelection = () => {
    setSelectedPackages(new Set<string>());
  };

  const handleBatch = async (action: "disable" | "uninstall") => {
    const count = selectedPackages().size;
    if (count === 0) return;
    const confirmed = await props.onShowConfirm(
      `Are you sure you want to ${action} ${count} app${count > 1 ? "s" : ""}?`
    );
    if (!confirmed) return;

    const packages = Array.from(selectedPackages());
    for (const pkg of packages) {
      const args =
        action === "uninstall"
          ? ["shell", "pm", "uninstall", "-k", "--user", "0", pkg]
          : ["shell", "pm", "disable-user", "--user", "0", pkg];
      await runCommand("adb", args, true);
    }
    await listApps();
  };

  return (
    <div
      id="apps-tab"
      class={`tab-content ${state.activeTab === "apps-tab" ? "active" : ""}`}
    >
      <div class="debloater-container">
        <div class="debloater-header">
          <input
            type="text"
            id="app-search-input"
            placeholder="Search package or name..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <div class="header-filters">
            <div id="filter-safety-dropdown" class="custom-dropdown compact">
              <div
                class={`dropdown-selected ${safetyOpen() ? "open" : ""}`}
                onClick={() => setSafetyOpen(!safetyOpen())}
              >
                <span>
                  {safetyFilter() === "all" ? "All Safety" : safetyFilter()}
                </span>
                <i class="fa-solid fa-chevron-down" />
              </div>
              <div class={`dropdown-menu ${safetyOpen() ? "open" : ""}`}>
                <div
                  class="dropdown-item"
                  onClick={() => {
                    setSafetyFilter("all");
                    setSafetyOpen(false);
                  }}
                >
                  All Safety
                </div>
                <For each={availableSafeties()}>
                  {(item) => (
                    <div
                      class="dropdown-item"
                      onClick={() => {
                        setSafetyFilter(item);
                        setSafetyOpen(false);
                      }}
                    >
                      {item}
                    </div>
                  )}
                </For>
              </div>
            </div>

            <div id="filter-oem-dropdown" class="custom-dropdown compact">
              <div
                class={`dropdown-selected ${oemOpen() ? "open" : ""}`}
                onClick={() => setOemOpen(!oemOpen())}
              >
                <span>{oemFilter() === "all" ? "All Lists" : oemFilter()}</span>
                <i class="fa-solid fa-chevron-down" />
              </div>
              <div class={`dropdown-menu ${oemOpen() ? "open" : ""}`}>
                <div
                  class="dropdown-item"
                  onClick={() => {
                    setOemFilter("all");
                    setOemOpen(false);
                  }}
                >
                  All Lists
                </div>
                <For each={availableOems()}>
                  {(item) => (
                    <div
                      class="dropdown-item"
                      onClick={() => {
                        setOemFilter(item);
                        setOemOpen(false);
                      }}
                    >
                      {item}
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>

          <div class="app-filters">
            <button
              class={`app-filter-btn ${state.currentAppFilter === "all" ? "active" : ""}`}
              onClick={() => {
                setState("currentAppFilter", "all");
                listApps();
              }}
            >
              All
            </button>
            <button
              class={`app-filter-btn ${state.currentAppFilter === "user" ? "active" : ""}`}
              onClick={() => {
                setState("currentAppFilter", "user");
                listApps();
              }}
            >
              User
            </button>
            <button
              class={`app-filter-btn ${state.currentAppFilter === "system" ? "active" : ""}`}
              onClick={() => {
                setState("currentAppFilter", "system");
                listApps();
              }}
            >
              System
            </button>
          </div>
        </div>

        <div id="app-list-container">
          <Show
            when={!loading()}
            fallback={
              <div class="app-list-placeholder">
                <i class="fa-solid fa-spinner fa-spin" /> Loading apps...
              </div>
            }
          >
            <Show
              when={state.currentDevice}
              fallback={
                <div class="app-list-placeholder">
                  Select a device to load apps.
                </div>
              }
            >
              <Show
                when={filteredApps().length > 0}
                fallback={
                  <div class="app-list-placeholder">
                    No applications match your filters.
                  </div>
                }
              >
                <For each={filteredApps()}>
                  {(app) => {
                    const isSelected = () => selectedPackages().has(app.id);
                    return (
                      <div
                        class={`app-list-item ${isSelected() ? "selected" : ""}`}
                        onClick={() => toggleSelect(app.id)}
                      >
                        <div class="app-item-header">
                          <div class="app-checkbox">
                            <i class="fa-solid fa-check" />
                          </div>
                          <div class="app-info">
                            <div class="app-info-pkg" title={app.id}>
                              {app.id}
                            </div>
                            <div class="app-info-list">{app.list}</div>
                          </div>
                          <div class={`app-safety-badge ${app.removal}`}>
                            {app.removal}
                          </div>
                        </div>
                        <div class="app-details-desc">{app.description}</div>
                        <div class="app-details-grid">
                          <strong>Labels:</strong>
                          <span>{app.labels.join(", ")}</span>
                          <strong>Dependencies:</strong>
                          <span>{app.dependencies.join(", ")}</span>
                          <strong>Needed By:</strong>
                          <span>{app.neededBy.join(", ")}</span>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </Show>
          </Show>
        </div>
      </div>

      <div
        id="selection-action-bar"
        class={selectedPackages().size === 0 ? "hidden" : ""}
      >
        <div id="selection-count">
          {selectedPackages().size} app
          {selectedPackages().size > 1 ? "s" : ""} selected
        </div>
        <div class="selection-actions">
          <button
            id="selection-action-disable"
            class="btn-warning"
            onClick={() => handleBatch("disable")}
          >
            <i class="fa-solid fa-ban" /> Disable
          </button>
          <button
            id="selection-action-uninstall"
            class="btn-danger"
            onClick={() => handleBatch("uninstall")}
          >
            <i class="fa-solid fa-trash" /> Uninstall
          </button>
        </div>
        <button
          id="selection-action-clear"
          class="btn-secondary"
          title="Deselect All"
          onClick={clearSelection}
        >
          <i class="fa-solid fa-xmark" />
        </button>
      </div>
    </div>
  );
};
