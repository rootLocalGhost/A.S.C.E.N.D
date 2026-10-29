import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  state,
  setState,
  runCommand,
  ensureDebloatDb,
  toast,
  log,
} from "../stateStore";
import { saveFileDialog, writeTextFile } from "../tauriApi";
import { copyText, cx, friendlyPackageName } from "../utils";
import { CopyButton, EmptyState } from "./ui";

type AppStatus = "enabled" | "disabled" | "removed";
type SortMode = "name" | "package" | "safety" | "status";

interface AppItem {
  id: string;
  name: string;
  list: string;
  description: string;
  removal: string;
  dependencies: string[];
  neededBy: string[];
  labels: string[];
  status: AppStatus;
  system: boolean;
}

interface DebloaterTabProps {
  onShowConfirm: (msg: string) => Promise<boolean>;
}

const APP_QUERY = [
  "echo __ENABLED__; pm list packages -e",
  "echo __DISABLED__; pm list packages -d",
  "echo __UNINSTALLED__; pm list packages -u",
  "echo __USER__; pm list packages -3",
  "echo __SYSTEM__; pm list packages -s",
  "echo __END__",
].join("; ");

const SAFETY_RANK: Record<string, number> = {
  recommended: 0,
  advanced: 1,
  expert: 2,
  unsafe: 3,
  unknown: 4,
};

function parseList(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^package:/i, "").trim())
    .filter((name) => /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(name));
}

export const DebloaterTab: Component<DebloaterTabProps> = (props) => {
  const [apps, setApps] = createSignal<AppItem[]>([]);
  const [selectedPackages, setSelectedPackages] = createSignal<Set<string>>(
    new Set<string>()
  );
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set<string>());
  const [search, setSearch] = createSignal("");
  const [safetyFilter, setSafetyFilter] = createSignal("all");
  const [listFilter, setListFilter] = createSignal("all");
  const [statusFilter, setStatusFilter] = createSignal<"all" | AppStatus>("all");
  const [sortMode, setSortMode] = createSignal<SortMode>("name");
  const [curatedOnly, setCuratedOnly] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [batchProgress, setBatchProgress] = createSignal<{
    action: string;
    done: number;
    total: number;
  } | null>(null);
  const [lastFetch, setLastFetch] = createSignal(0);

  let searchRef: HTMLInputElement | undefined;
  let loadedDevice: string | null = null;
  let fetchInFlight = false;

  const selectedApps = createMemo(() =>
    apps().filter((app) => selectedPackages().has(app.id))
  );

  createEffect(() => {
    setState("debloaterSelection", Array.from(selectedPackages()));
  });

  const listApps = async (force = false) => {
    const serial = state.currentDevice;
    if (!serial) {
      setApps([]);
      setSelectedPackages(new Set<string>());
      return;
    }
    if (fetchInFlight) return;
    if (!force && loadedDevice === serial && Date.now() - lastFetch() < 20_000) {
      return;
    }

    fetchInFlight = true;
    setLoading(true);
    setSelectedPackages(new Set<string>());
    setExpanded(new Set<string>());

    try {
      await ensureDebloatDb();

      const res = await runCommand("adb", ["shell", APP_QUERY], {
        background: true,
        quiet: true,
        key: "list-apps",
        timeout: 60_000,
      });

      // The user may have switched devices while the query was running.
      if (state.currentDevice !== serial) return;

      if (res) {
        const data = res[0];
        const section = (tag: string) => {
          const match = data.match(
            new RegExp(`__${tag}__\\r?\\n([\\s\\S]*?)(?=\\r?\\n__[A-Z_]+__|$)`)
          );
          return match ? match[1] : "";
        };

        const enabled = new Set(parseList(section("ENABLED")));
        const disabled = new Set(parseList(section("DISABLED")));
        const uninstalled = new Set(parseList(section("UNINSTALLED")));
        const user = new Set(parseList(section("USER")));
        const system = new Set(parseList(section("SYSTEM")));

        const all = new Set<string>([
          ...enabled,
          ...disabled,
          ...uninstalled,
          ...user,
          ...system,
        ]);

        const list: AppItem[] = Array.from(all)
          .map((id) => {
            const dbInfo = state.debloatDB[id] || {};
            const status: AppStatus = disabled.has(id)
              ? "disabled"
              : enabled.has(id)
                ? "enabled"
                : uninstalled.has(id)
                  ? "removed"
                  : "enabled";

            return {
              id,
              name: dbInfo.name || friendlyPackageName(id),
              list: dbInfo.list || (system.has(id) ? "System" : "User"),
              description: dbInfo.description || "No description available for this package.",
              removal: (dbInfo.removal || dbInfo.safety || "unknown").toLowerCase(),
              dependencies: dbInfo.dependencies || [],
              neededBy: dbInfo.neededBy || [],
              labels: dbInfo.labels || [],
              status,
              system: system.has(id) || !user.has(id),
            };
          })
          .sort((a, b) => a.id.localeCompare(b.id));

        setApps(list);
        setLastFetch(Date.now());
        loadedDevice = serial;
        log(
          `Loaded ${list.length} packages (${enabled.size} enabled, ${disabled.size} disabled, ${
            [...uninstalled].filter((pkg) => !enabled.has(pkg) && !disabled.has(pkg)).length
          } removed).`,
          "INFO"
        );
      }
    } finally {
      setLoading(false);
      fetchInFlight = false;
      if (state.currentDevice !== serial) {
        void listApps(true);
      }
    }
  };

  createEffect(() => {
    if (state.activeTab === "apps-tab" && state.currentDevice) {
      void listApps();
    }
  });

  onMount(() => {
    void ensureDebloatDb();

    const onRefresh = () => void listApps(true);
    const onKey = (event: KeyboardEvent) => {
      if (state.activeTab !== "apps-tab") return;
      if (document.querySelector(".modal-overlay.active")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef?.focus();
        searchRef?.select();
      }
      if (event.key === "Escape" && document.activeElement !== searchRef) {
        setSearch("");
        setExpanded(new Set<string>());
      }
    };

    window.addEventListener("ascend:refresh", onRefresh);
    window.addEventListener("keydown", onKey);

    onCleanup(() => {
      window.removeEventListener("ascend:refresh", onRefresh);
      window.removeEventListener("keydown", onKey);
    });
  });

  const availableLists = createMemo(() => {
    const lists = new Set<string>();
    apps().forEach((app) => lists.add(app.list));
    return Array.from(lists).sort();
  });

  const availableSafeties = createMemo(() => {
    const safeties = new Set<string>();
    apps().forEach((app) => safeties.add(app.removal));
    return Array.from(safeties).sort((a, b) => (SAFETY_RANK[a] ?? 9) - (SAFETY_RANK[b] ?? 9));
  });

  const statusCounts = createMemo(() => {
    const counts = { enabled: 0, disabled: 0, removed: 0 };
    apps().forEach((app) => {
      counts[app.status] += 1;
    });
    return counts;
  });

  const filteredApps = createMemo(() => {
    const term = search().trim().toLowerCase();
    const curated = curatedOnly();
    const result = apps().filter((app) => {
      if (statusFilter() !== "all" && app.status !== statusFilter()) return false;
      if (safetyFilter() !== "all" && app.removal !== safetyFilter()) return false;
      if (listFilter() !== "all" && app.list !== listFilter()) return false;
      if (curated && !state.debloatDB[app.id]) return false;
      if (state.currentAppFilter === "system" && !app.system) return false;
      if (state.currentAppFilter === "user" && app.system) return false;
      if (!term) return true;
      return (
        app.id.toLowerCase().includes(term) ||
        app.name.toLowerCase().includes(term) ||
        app.description.toLowerCase().includes(term) ||
        app.labels.some((label) => label.toLowerCase().includes(term))
      );
    });

    const mode = sortMode();
    const rank = (app: AppItem) => SAFETY_RANK[app.removal] ?? 9;
    return result.sort((a, b) => {
      if (mode === "package") return a.id.localeCompare(b.id);
      if (mode === "safety") return rank(a) - rank(b) || a.name.localeCompare(b.name);
      if (mode === "status") return a.status.localeCompare(b.status) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  });

  const allVisibleSelected = createMemo(
    () =>
      filteredApps().length > 0 &&
      filteredApps().every((app) => selectedPackages().has(app.id))
  );

  const toggleSelect = (pkg: string) => {
    const current = new Set(selectedPackages());
    if (current.has(pkg)) current.delete(pkg);
    else current.add(pkg);
    setSelectedPackages(current);
  };

  const toggleExpanded = (pkg: string) => {
    const current = new Set(expanded());
    if (current.has(pkg)) current.delete(pkg);
    else current.add(pkg);
    setExpanded(current);
  };

  const clearSelection = () => setSelectedPackages(new Set<string>());

  const selectVisible = () => {
    if (allVisibleSelected()) {
      clearSelection();
      return;
    }
    setSelectedPackages(new Set(filteredApps().map((app) => app.id)));
  };

  const selectRecommended = () => {
    const recommended = filteredApps()
      .filter((app) => app.removal === "recommended" && app.status === "enabled")
      .map((app) => app.id);
    setSelectedPackages(new Set(recommended));
    if (recommended.length) {
      toast(`${recommended.length} recommended package${recommended.length > 1 ? "s" : ""} selected`, "info");
    } else {
      toast("No recommended packages in the current view", "info");
    }
  };

  const applyAction = async (
    app: AppItem,
    action: "disable" | "uninstall" | "enable" | "restore"
  ): Promise<boolean> => {
    const commands: Record<string, string[]> = {
      disable: ["shell", "pm", "disable-user", "--user", "0", app.id],
      uninstall: ["shell", "pm", "uninstall", "-k", "--user", "0", app.id],
      enable: ["shell", "pm", "enable", app.id],
      restore: ["shell", "cmd", "package", "install-existing", app.id],
    };
    const res = await runCommand("adb", commands[action], {
      quiet: true,
      label: `${action} ${app.id}`,
      timeout: 120_000,
    });
    return !!res;
  };

  const confirmAction = async (
    action: "disable" | "uninstall" | "enable" | "restore",
    targets: AppItem[]
  ) => {
    if (!targets.length) return false;
    if (
      !state.preferences.confirmDestructive ||
      action === "enable" ||
      action === "restore"
    ) {
      return true;
    }

    const risky = targets.filter((app) =>
      ["advanced", "expert", "unsafe"].includes(app.removal)
    );
    const lines = [
      `Are you sure you want to ${action} ${targets.length} app${targets.length > 1 ? "s" : ""}?`,
    ];
    if (targets.length <= 6) {
      lines.push("", ...targets.map((app) => `• ${app.name} (${app.id})`));
    }
    if (risky.length) {
      lines.push(
        "",
        `⚠ ${risky.length} package${risky.length > 1 ? "s are" : " is"} marked Advanced/Expert/Unsafe. Removing core packages can break features or cause boot loops.`
      );
    }
    return props.onShowConfirm(lines.join("\n"));
  };

  const handleSingle = async (
    app: AppItem,
    action: "disable" | "uninstall" | "enable" | "restore"
  ) => {
    if (!(await confirmAction(action, [app]))) return;
    const ok = await applyAction(app, action);
    const past: Record<string, string> = {
      disable: "disabled",
      uninstall: "uninstalled",
      enable: "enabled",
      restore: "restored",
    };
    toast(
      ok ? `${app.name} ${past[action]}` : `Failed to ${action} ${app.name}`,
      ok ? "success" : "error"
    );
    if (ok) void listApps(true);
  };

  const handleBatch = async (action: "disable" | "uninstall" | "enable" | "restore") => {
    const targets = selectedApps().filter((app) => {
      if (action === "disable" || action === "uninstall") return app.status === "enabled";
      if (action === "enable") return app.status === "disabled";
      return app.status === "removed";
    });
    if (!targets.length) return;
    if (!(await confirmAction(action, targets))) return;

    let done = 0;
    let failed = 0;
    setBatchProgress({ action, done, total: targets.length });
    log(`Starting batch ${action} for ${targets.length} packages...`, "CMD");

    for (const app of targets) {
      const ok = await applyAction(app, action);
      if (ok) done += 1;
      else failed += 1;
      setBatchProgress({ action, done: done + failed, total: targets.length });
    }

    setBatchProgress(null);
    const past: Record<string, string> = {
      disable: "disabled",
      uninstall: "uninstalled",
      enable: "enabled",
      restore: "restored",
    };
    toast(
      `${done} package${done === 1 ? "" : "s"} ${past[action]}${failed ? `, ${failed} failed` : ""}`,
      failed ? "warning" : "success",
      6000
    );
    clearSelection();
    void listApps(true);
  };

  const exportSelection = async () => {
    const targets = selectedApps();
    if (!targets.length) return;
    const contents = [
      `# A.S.C.E.N.D. package selection (${new Date().toLocaleString()})`,
      "# package\tstatus\tsafety\tname",
      ...targets.map(
        (app) => `${app.id}\t${app.status}\t${app.removal}\t${app.name}`
      ),
    ].join("\n");

    const destination = await saveFileDialog("ascend-packages.txt", [
      { name: "Text file", extensions: ["txt"] },
    ]);
    if (!destination) return;

    try {
      await writeTextFile(destination, contents);
      toast("Selection exported", "success");
    } catch (error: any) {
      toast("Could not export selection", "error");
      log(`Export failed: ${error?.message || error}`, "ERROR");
    }
  };

  const copyPackages = async () => {
    const text = selectedApps().map((app) => app.id).join("\n");
    const ok = await copyText(text);
    toast(ok ? "Package list copied" : "Could not copy packages", ok ? "success" : "error");
  };

  const statusBadge = (status: AppStatus) => {
    if (status === "disabled") return { label: "Disabled", icon: "fa-solid fa-ban" };
    if (status === "removed") return { label: "Removed", icon: "fa-solid fa-ghost" };
    return { label: "Enabled", icon: "fa-solid fa-circle-check" };
  };

  const counts = statusCounts;

  return (
    <div
      id="apps-tab"
      class={`tab-content ${state.activeTab === "apps-tab" ? "active" : ""}`}
    >
      <div class="debloater-container">
        <div class="debloater-header">
          <div class="debloater-search">
            <i class="fa-solid fa-magnifying-glass" />
            <input
              ref={searchRef}
              type="text"
              id="app-search-input"
              placeholder="Search packages, names, descriptions…  (Ctrl+F)"
              value={search()}
              onInput={(event) => setSearch(event.currentTarget.value)}
            />
            <Show when={search()}>
              <button
                class="icon-btn"
                title="Clear search"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <i class="fa-solid fa-xmark" />
              </button>
            </Show>
          </div>

          <div class="header-filters">
            <div class="filter-select">
              <i class="fa-solid fa-shield-halved" />
              <select
                value={safetyFilter()}
                onChange={(event) => setSafetyFilter(event.currentTarget.value)}
                aria-label="Filter by removal safety"
              >
                <option value="all">All safety</option>
                <For each={availableSafeties()}>
                  {(item) => <option value={item}>{item}</option>}
                </For>
              </select>
            </div>

            <div class="filter-select">
              <i class="fa-solid fa-list-ul" />
              <select
                value={listFilter()}
                onChange={(event) => setListFilter(event.currentTarget.value)}
                aria-label="Filter by package list"
              >
                <option value="all">All lists</option>
                <For each={availableLists()}>
                  {(item) => <option value={item}>{item}</option>}
                </For>
              </select>
            </div>

            <div class="filter-select">
              <i class="fa-solid fa-arrow-down-a-z" />
              <select
                value={sortMode()}
                onChange={(event) => setSortMode(event.currentTarget.value as SortMode)}
                aria-label="Sort packages"
              >
                <option value="name">Name</option>
                <option value="package">Package</option>
                <option value="safety">Safety</option>
                <option value="status">Status</option>
              </select>
            </div>

            <button
              class="btn-secondary refresh-apps-btn"
              title="Reload package list from device"
              onClick={() => void listApps(true)}
              disabled={loading()}
            >
              <i class={`fa-solid fa-arrows-rotate ${loading() ? "fa-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div class="debloater-toolbar">
          <div class="app-filters" role="tablist" aria-label="Package origin">
            <For
              each={[
                { value: "all", label: "All" },
                { value: "user", label: "User" },
                { value: "system", label: "System" },
              ]}
            >
              {(option) => (
                <button
                  class={`app-filter-btn ${state.currentAppFilter === option.value ? "active" : ""}`}
                  onClick={() => setState("currentAppFilter", option.value as "all" | "user" | "system")}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>

          <div class="app-filters" role="tablist" aria-label="Package status">
            <For
              each={[
                { value: "all", label: "Any status", count: apps().length },
                { value: "enabled", label: "Enabled", count: counts().enabled },
                { value: "disabled", label: "Disabled", count: counts().disabled },
                { value: "removed", label: "Removed", count: counts().removed },
              ]}
            >
              {(option) => (
                <button
                  class={`app-filter-btn ${statusFilter() === option.value ? "active" : ""}`}
                  onClick={() => setStatusFilter(option.value as "all" | AppStatus)}
                >
                  {option.label}
                  <span class="filter-count">{option.count}</span>
                </button>
              )}
            </For>
          </div>

          <button
            class={cx("chip-toggle", curatedOnly() && "active")}
            title="Only show packages present in the curated debloat database"
            onClick={() => setCuratedOnly(!curatedOnly())}
          >
            <i class="fa-solid fa-book-medical" /> Curated
          </button>

          <div class="toolbar-actions">
            <button class="btn-secondary small" onClick={selectVisible} disabled={!filteredApps().length}>
              <i class="fa-solid fa-check-double" />
              {allVisibleSelected() ? "Deselect all" : "Select visible"}
            </button>
            <button class="btn-secondary small" onClick={selectRecommended} disabled={!filteredApps().length}>
              <i class="fa-solid fa-wand-magic-sparkles" /> Recommended
            </button>
            <span class="result-count">
              {filteredApps().length} of {apps().length}
            </span>
          </div>
        </div>

        <Show when={batchProgress()}>
          {(progress) => (
            <div class="batch-progress">
              <div class="batch-progress-text">
                <i class="fa-solid fa-circle-notch fa-spin" />
                <span>
                  {progress().action === "uninstall" ? "Uninstalling" : progress().action === "disable" ? "Disabling" : progress().action === "enable" ? "Enabling" : "Restoring"}{" "}
                  {progress().done} / {progress().total}
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

        <div id="app-list-container">
          <Show
            when={!loading()}
            fallback={
              <div class="app-skeleton-list">
                <For each={Array.from({ length: 6 })}>
                  {() => (
                    <div class="app-list-item skeleton-card">
                      <div class="skeleton-line" style={{ width: "45%" }} />
                      <div class="skeleton-line" style={{ width: "70%" }} />
                      <div class="skeleton-line" style={{ width: "30%" }} />
                    </div>
                  )}
                </For>
              </div>
            }
          >
            <Show
              when={state.currentDevice}
              fallback={
                <EmptyState
                  icon="fa-solid fa-mobile-screen-button"
                  title="Select a device"
                  description="Connect a device to browse and debloat installed packages."
                />
              }
            >
              <Show
                when={filteredApps().length > 0}
                fallback={
                  <EmptyState
                    icon="fa-solid fa-filter-circle-xmark"
                    title="No packages match"
                    description="Try changing the search term or filters."
                  >
                    <button
                      class="btn-secondary"
                      onClick={() => {
                        setSearch("");
                        setSafetyFilter("all");
                        setListFilter("all");
                        setStatusFilter("all");
                        setState("currentAppFilter", "all");
                        setCuratedOnly(false);
                      }}
                    >
                      Reset filters
                    </button>
                  </EmptyState>
                }
              >
                <For each={filteredApps()}>
                  {(app) => {
                    const isSelected = () => selectedPackages().has(app.id);
                    const isExpanded = () => expanded().has(app.id);
                    const badge = () => statusBadge(app.status);
                    return (
                      <div
                        class={cx(
                          "app-list-item",
                          isSelected() && "selected",
                          isExpanded() && "expanded",
                          `status-${app.status}`
                        )}
                      >
                        <div
                          class="app-item-header"
                          onClick={() => toggleExpanded(app.id)}
                          role="button"
                          tabindex="0"
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleExpanded(app.id);
                            }
                          }}
                        >
                          <button
                            type="button"
                            class="app-checkbox"
                            aria-label={`${isSelected() ? "Deselect" : "Select"} ${app.name}`}
                            aria-pressed={isSelected()}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSelect(app.id);
                            }}
                          >
                            <i class="fa-solid fa-check" />
                          </button>

                          <div class={`app-icon status-${app.status}`}>
                            <i
                              class={
                                app.status === "removed"
                                  ? "fa-solid fa-ghost"
                                  : app.system
                                    ? "fa-solid fa-microchip"
                                    : "fa-brands fa-android"
                              }
                            />
                          </div>

                          <div class="app-info">
                            <div class="app-info-name">
                              <span class="app-name">{app.name}</span>
                              <span class={`app-status-badge ${app.status}`}>
                                <i class={badge().icon} /> {badge().label}
                              </span>
                            </div>
                            <div class="app-info-pkg" title={app.id}>
                              {app.id}
                            </div>
                          </div>

                          <div class="app-item-badges">
                            <span class={`app-safety-badge ${app.removal}`} title="Removal safety">
                              {app.removal}
                            </span>
                            <span class="app-list-badge">{app.list}</span>
                          </div>

                          <i
                            class={`fa-solid fa-chevron-down app-expand-icon ${isExpanded() ? "rotated" : ""}`}
                          />
                        </div>

                        <Show when={isExpanded()}>
                          <div class="app-card-body">
                            <div class="app-details-desc">{app.description}</div>

                            <Show when={app.labels.length}>
                              <div class="app-tag-row">
                                <For each={app.labels}>
                                  {(label) => <span class="app-tag">{label}</span>}
                                </For>
                              </div>
                            </Show>

                            <div class="app-details-grid">
                              <strong>Dependencies</strong>
                              <span>
                                {app.dependencies.length ? app.dependencies.join(", ") : "none"}
                              </span>
                              <strong>Needed by</strong>
                              <span>{app.neededBy.length ? app.neededBy.join(", ") : "none"}</span>
                            </div>

                            <div class="app-card-actions">
                              <Show when={app.status === "enabled"}>
                                <button
                                  class="btn-warning small"
                                  onClick={() => void handleSingle(app, "disable")}
                                >
                                  <i class="fa-solid fa-ban" /> Disable
                                </button>
                                <button
                                  class="btn-danger small"
                                  onClick={() => void handleSingle(app, "uninstall")}
                                >
                                  <i class="fa-solid fa-trash" /> Uninstall
                                </button>
                              </Show>
                              <Show when={app.status === "disabled"}>
                                <button
                                  class="btn-primary small"
                                  onClick={() => void handleSingle(app, "enable")}
                                >
                                  <i class="fa-solid fa-rotate-left" /> Enable
                                </button>
                              </Show>
                              <Show when={app.status === "removed"}>
                                <button
                                  class="btn-primary small"
                                  onClick={() => void handleSingle(app, "restore")}
                                >
                                  <i class="fa-solid fa-download" /> Restore
                                </button>
                              </Show>
                              <CopyButton value={app.id} label="package name" />
                              <button
                                class="icon-btn"
                                title="Copy package details"
                                aria-label="Copy package details"
                                onClick={async () => {
                                  const text = `${app.name} (${app.id})\nSafety: ${app.removal}\nList: ${app.list}\n\n${app.description}`;
                                  const ok = await copyText(text);
                                  toast(ok ? "Package details copied" : "Could not copy", ok ? "success" : "error");
                                }}
                              >
                                <i class="fa-solid fa-circle-info" />
                              </button>
                            </div>
                          </div>
                        </Show>
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
          <strong>{selectedPackages().size}</strong> selected
        </div>
        <div class="selection-actions">
          <Show when={selectedApps().some((app) => app.status === "enabled")}>
            <button
              id="selection-action-disable"
              class="btn-warning"
              onClick={() => void handleBatch("disable")}
            >
              <i class="fa-solid fa-ban" /> Disable
            </button>
            <button
              id="selection-action-uninstall"
              class="btn-danger"
              onClick={() => void handleBatch("uninstall")}
            >
              <i class="fa-solid fa-trash" /> Uninstall
            </button>
          </Show>
          <Show when={selectedApps().some((app) => app.status === "disabled")}>
            <button class="btn-primary" onClick={() => void handleBatch("enable")}>
              <i class="fa-solid fa-rotate-left" /> Enable
            </button>
          </Show>
          <Show when={selectedApps().some((app) => app.status === "removed")}>
            <button class="btn-primary" onClick={() => void handleBatch("restore")}>
              <i class="fa-solid fa-download" /> Restore
            </button>
          </Show>
          <button class="icon-btn" title="Copy package names" aria-label="Copy package names" onClick={copyPackages}>
            <i class="fa-regular fa-copy" />
          </button>
          <button class="icon-btn" title="Export selection" aria-label="Export selection" onClick={exportSelection}>
            <i class="fa-solid fa-file-export" />
          </button>
        </div>
        <button
          id="selection-action-clear"
          class="btn-secondary"
          title="Deselect all"
          aria-label="Deselect all"
          onClick={clearSelection}
        >
          <i class="fa-solid fa-xmark" />
        </button>
      </div>
    </div>
  );
};
