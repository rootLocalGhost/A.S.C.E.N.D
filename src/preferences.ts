export type Accent = "red" | "cyan" | "green" | "violet" | "amber";
export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export interface Preferences {
  autoRefresh: boolean;
  refreshInterval: number;
  deviceMonitor: boolean;
  accent: Accent;
  theme: Theme;
  compact: boolean;
  toasts: boolean;
  reduceMotion: boolean;
  confirmDestructive: boolean;
  sidebarCollapsed: boolean;
  logDrawerOpen: boolean;
  logAutoScroll: boolean;
}

const STORAGE_KEY = "ascend.preferences.v1";

export const defaultPreferences: Preferences = {
  autoRefresh: true,
  refreshInterval: 8,
  deviceMonitor: true,
  accent: "red",
  theme: "system",
  compact: false,
  toasts: true,
  reduceMotion: false,
  confirmDestructive: true,
  sidebarCollapsed: false,
  logDrawerOpen: false,
  logAutoScroll: true,
};

export const accents: Record<Accent, { label: string; color: string; dark: string }> = {
  red: { label: "Crimson", color: "#ff0b55", dark: "#cf0f47" },
  cyan: { label: "Cyan", color: "#22d3ee", dark: "#0891b2" },
  green: { label: "Emerald", color: "#34d399", dark: "#059669" },
  violet: { label: "Violet", color: "#a78bfa", dark: "#7c3aed" },
  amber: { label: "Amber", color: "#fbbf24", dark: "#d97706" },
};

export const themes: Array<{ value: Theme; label: string; icon: string }> = [
  { value: "dark", label: "Dark", icon: "fa-solid fa-moon" },
  { value: "light", label: "Light", icon: "fa-solid fa-sun" },
  { value: "system", label: "System", icon: "fa-solid fa-circle-half-stroke" },
];

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === "system") return systemPrefersDark ? "dark" : "light";
  return theme;
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultPreferences };
    const parsed = JSON.parse(raw);
    const merged = { ...defaultPreferences, ...parsed };
    if (!themes.some((theme) => theme.value === merged.theme)) {
      merged.theme = defaultPreferences.theme;
    }
    return merged;
  } catch {
    return { ...defaultPreferences };
  }
}

export function savePreferences(preferences: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable in private contexts; preferences are non-critical.
  }
}
