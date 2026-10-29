import { render } from "solid-js/web";
import { App } from "./App";
import { loadPreferences, resolveTheme } from "./preferences";

// Apply the theme before the first paint to avoid a dark/light flash.
const preferences = loadPreferences();
const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset.theme = resolveTheme(preferences.theme, systemPrefersDark);

const root = document.getElementById("root");
if (root) {
  render(() => <App />, root);
}
