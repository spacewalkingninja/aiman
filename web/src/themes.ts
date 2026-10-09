import xpCssUrl from "xp.css/dist/XP.css?url";
import win98CssUrl from "98.css/dist/98.css?url";

export type Theme = {
  id: string;
  name: string;
  description: string;
  /** Optional extra stylesheet loaded only while this theme is active. */
  css?: string;
  vars: Record<string, string>;
};

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

const base = (o: Partial<Record<string, string>>) => ({
  "--radius": "8px",
  "--tab-radius": "999px",
  "--pill-radius": "999px",
  "--btn-border": "1px solid var(--border)",
  "--input-border": "1px solid var(--border)",
  "--btn-hover": "#3a4150",
  "--accent-fg": "#ffffff",
  "--accent-soft": "rgba(91,157,255,0.10)",
  "--text-2": "#c3c9d4",
  "--font": SANS,
  "--font-size": "14px",
  "--code-bg": "#0a0c0f",
  "--term-bg": "#0d1117",
  "--term-fg": "#c9d1d9",
  "--term-cursor": "#c9d1d9",
  "--cm-map-bg": "#0a0c0f",
  "--cm-dir-bg": "rgba(38,50,70,0.5)",
  "--cm-dir-hover": "rgba(52,68,95,0.6)",
  "--cm-dir-border": "#33415a",
  "--cm-file-bg": "#12161d",
  "--cm-label-fg": "#c9d1d9",
  "--cm-code-fg": "#9aa6b6",
  "--scroll-thumb": "#2b303a",
  "--overlay-bg": "rgba(0,0,0,0.5)",
  "--panel-shadow": "0 12px 48px rgba(0,0,0,0.55)",
  "--question-bg": "#10192b",
  "--question-border": "#2b3a55",
  "--permission-bg": "#241f0f",
  "--permission-border": "#6b5a1a",
  "--mark-bg": "#5b4a1a",
  "--mark-fg": "#ffffff",
  "--diff-bg": "#0a0c0f",
  "--diff-ctx": "#c3c9d4",
  ...o,
});

export const THEMES: Theme[] = [
  {
    id: "dark",
    name: "Aiman Dark",
    description: "Modern dark (default).",
    vars: base({}),
  },
  {
    id: "light",
    name: "Aiman Light",
    description: "Clean, bright, minimal.",
    vars: base({
      "--bg": "#f4f5f7",
      "--bg-2": "#ffffff",
      "--bg-3": "#eceef2",
      "--border": "#d7dbe2",
      "--text": "#1b1f24",
      "--muted": "#667085",
      "--accent": "#2563eb",
      "--accent-2": "#2563eb",
      "--green": "#059669",
      "--amber": "#b45309",
      "--red": "#dc2626",
      "--purple": "#7c3aed",
      "--btn-hover": "#b9c0cc",
      "--accent-soft": "rgba(37,99,235,0.10)",
      "--text-2": "#4b5563",
      "--code-bg": "#f0f2f5",
      "--scroll-thumb": "#c4c9d2",
      "--overlay-bg": "rgba(20,24,30,0.35)",
      "--panel-shadow": "0 12px 48px rgba(20,24,30,0.22)",
      "--question-bg": "#eef4ff",
      "--question-border": "#bcd0f5",
      "--permission-bg": "#fff7e6",
      "--permission-border": "#e6c98a",
      "--mark-bg": "#fde68a",
      "--mark-fg": "#1b1f24",
      "--diff-ctx": "#4b5563",
    }),
  },
  {
    id: "winxp",
    name: "Windows XP",
    description: "Luna blue, beveled controls, Tahoma.",
    css: xpCssUrl,
    vars: base({
      "--bg": "#ece9d8",
      "--bg-2": "#f4f1e4",
      "--bg-3": "#d6e4f7",
      "--border": "#aca899",
      "--text": "#0a0a0a",
      "--muted": "#5a5a5a",
      "--accent": "#2a5db0",
      "--accent-2": "#3d7ad6",
      "--green": "#2f8f2f",
      "--amber": "#c07a00",
      "--red": "#c62828",
      "--purple": "#7b2fb5",
      "--radius": "3px",
      "--tab-radius": "3px 3px 0 0",
      "--pill-radius": "3px",
      "--btn-border": "1px solid #7a7a6a",
      "--input-border": "1px solid #7a7a6a",
      "--btn-hover": "#c8b47e",
      "--accent-fg": "#ffffff",
      "--text-2": "#333333",
      "--font": '"Tahoma", "Segoe UI", Verdana, sans-serif',
      "--font-size": "13px",
      "--code-bg": "#ffffff",
      "--term-bg": "#000000",
      "--term-fg": "#c0c0c0",
      "--scroll-thumb": "#cdc9b8",
      "--panel-shadow": "0 10px 34px rgba(0,0,0,0.35)",
      "--question-bg": "#eef4ff",
      "--permission-bg": "#fff6d8",
      "--mark-bg": "#3355cc",
      "--mark-fg": "#ffffff",
      "--diff-bg": "#ffffff",
      "--diff-ctx": "#333333",
    }),
  },
  {
    id: "win98",
    name: "Windows 98",
    description: "Classic grey, outset bevels, MS Sans Serif.",
    css: win98CssUrl,
    vars: base({
      "--bg": "#c0c0c0",
      "--bg-2": "#c0c0c0",
      "--bg-3": "#d4d0c8",
      "--border": "#808080",
      "--text": "#000000",
      "--muted": "#404040",
      "--accent": "#000080",
      "--accent-2": "#000080",
      "--green": "#008000",
      "--amber": "#808000",
      "--red": "#800000",
      "--purple": "#800080",
      "--radius": "0px",
      "--tab-radius": "0px",
      "--pill-radius": "0px",
      "--btn-border": "2px outset #dfdfdf",
      "--input-border": "2px inset #dfdfdf",
      "--btn-hover": "#000080",
      "--accent-fg": "#ffffff",
      "--text-2": "#000000",
      "--font": '"MS Sans Serif", "Tahoma", Geneva, sans-serif',
      "--font-size": "12px",
      "--code-bg": "#000000",
      "--term-bg": "#000000",
      "--term-fg": "#c0c0c0",
      "--cm-map-bg": "#000000",
      "--cm-dir-bg": "#000080",
      "--cm-dir-hover": "#0000a0",
      "--cm-dir-border": "#000000",
      "--cm-file-bg": "#101010",
      "--cm-label-fg": "#ffffff",
      "--cm-code-fg": "#c0c0c0",
      "--scroll-thumb": "#c0c0c0",
      "--overlay-bg": "rgba(0,0,0,0.35)",
      "--panel-shadow": "4px 4px 0 rgba(0,0,0,0.5)",
      "--question-bg": "#c0c0c0",
      "--question-border": "#808080",
      "--permission-bg": "#ffffcc",
      "--permission-border": "#808080",
      "--mark-bg": "#000080",
      "--mark-fg": "#ffff00",
      "--diff-bg": "#000000",
      "--diff-ctx": "#c0c0c0",
    }),
  },
  {
    id: "winamp",
    name: "Skeuomorphic",
    description: "Winamp-style brushed metal with green LED glow.",
    vars: base({
      "--bg": "#1b1d22",
      "--bg-2": "#2a2d34",
      "--bg-3": "#3a3e47",
      "--border": "#4a4f5a",
      "--text": "#d8ffe2",
      "--muted": "#79e39a",
      "--accent": "#5fe38a",
      "--accent-2": "#2f9b57",
      "--green": "#5fe38a",
      "--amber": "#ffd34d",
      "--red": "#ff5c5c",
      "--purple": "#b98cff",
      "--radius": "3px",
      "--tab-radius": "3px",
      "--pill-radius": "3px",
      "--btn-border": "1px solid #5b616d",
      "--input-border": "1px solid #5b616d",
      "--btn-hover": "#5fe38a",
      "--accent-fg": "#05210f",
      "--accent-soft": "rgba(95,227,138,0.12)",
      "--text-2": "#a9e9bd",
      "--font": '"Tahoma", "Verdana", sans-serif',
      "--font-size": "12px",
      "--code-bg": "#0a0f0b",
      "--term-bg": "#04120a",
      "--term-fg": "#5fe38a",
      "--term-cursor": "#5fe38a",
      "--cm-map-bg": "#0a0f0b",
      "--cm-dir-bg": "rgba(47,155,87,0.32)",
      "--cm-dir-hover": "rgba(95,227,138,0.32)",
      "--cm-dir-border": "#2f9b57",
      "--cm-file-bg": "#0f1a12",
      "--cm-label-fg": "#a9e9bd",
      "--cm-code-fg": "#7fce97",
      "--scroll-thumb": "#3a3e47",
      "--panel-shadow": "0 0 0 1px #000, 0 10px 34px rgba(0,0,0,0.7)",
      "--question-bg": "#0f1a12",
      "--question-border": "#2f9b57",
      "--permission-bg": "#1f1a0a",
      "--permission-border": "#7a6a1a",
      "--mark-bg": "#2f9b57",
      "--mark-fg": "#05210f",
      "--diff-bg": "#0a0f0b",
      "--diff-ctx": "#a9e9bd",
    }),
  },
  {
    id: "aqua",
    name: "macOS Aqua",
    description: "Glossy light blue with soft rounded panels.",
    vars: base({
      "--bg": "#eef1f6",
      "--bg-2": "#ffffff",
      "--bg-3": "#e2e8f4",
      "--border": "#c7d0e0",
      "--text": "#14202e",
      "--muted": "#5f6f86",
      "--accent": "#0a6cff",
      "--accent-2": "#0a84ff",
      "--green": "#1aa260",
      "--amber": "#c98500",
      "--red": "#e02b2b",
      "--purple": "#8e44e0",
      "--radius": "10px",
      "--btn-hover": "#a9b8d0",
      "--accent-soft": "rgba(10,132,255,0.12)",
      "--text-2": "#3f4d63",
      "--code-bg": "#f3f5f9",
      "--scroll-thumb": "#c2cbdb",
      "--overlay-bg": "rgba(20,32,46,0.35)",
      "--panel-shadow": "0 16px 50px rgba(20,32,46,0.28)",
      "--question-bg": "#eaf2ff",
      "--question-border": "#bcd4ff",
      "--permission-bg": "#fff6e6",
      "--permission-border": "#e6c98a",
      "--mark-bg": "#ffe08a",
      "--mark-fg": "#14202e",
      "--diff-bg": "#f3f5f9",
      "--diff-ctx": "#3f4d63",
    }),
  },
  {
    id: "nord",
    name: "Nord",
    description: "Arctic, cool blue-grey developer palette.",
    vars: base({
      "--bg": "#2e3440",
      "--bg-2": "#3b4252",
      "--bg-3": "#434c5e",
      "--border": "#4c566a",
      "--text": "#eceff4",
      "--muted": "#9aa5b7",
      "--accent": "#88c0d0",
      "--accent-2": "#5e81ac",
      "--green": "#a3be8c",
      "--amber": "#ebcb8b",
      "--red": "#bf616a",
      "--purple": "#b48ead",
      "--radius": "8px",
      "--btn-hover": "#81a1c1",
      "--accent-fg": "#2e3440",
      "--accent-soft": "rgba(136,192,208,0.14)",
      "--text-2": "#d8dee9",
      "--code-bg": "#272c36",
      "--term-bg": "#2e3440",
      "--term-fg": "#d8dee9",
      "--cm-map-bg": "#272c36",
      "--cm-dir-bg": "rgba(94,129,172,0.35)",
      "--cm-dir-hover": "rgba(129,161,193,0.4)",
      "--cm-dir-border": "#5e81ac",
      "--cm-file-bg": "#333a47",
      "--cm-label-fg": "#e5e9f0",
      "--cm-code-fg": "#c2ccd9",
      "--scroll-thumb": "#434c5e",
      "--question-bg": "#3b4252",
      "--question-border": "#5e81ac",
      "--permission-bg": "#463f2e",
      "--permission-border": "#8a7a4a",
      "--mark-bg": "#ebcb8b",
      "--mark-fg": "#2e3440",
      "--diff-bg": "#272c36",
      "--diff-ctx": "#d8dee9",
    }),
  },
  {
    id: "crt",
    name: "Phosphor CRT",
    description: "Retro green-on-black terminal glow.",
    vars: base({
      "--bg": "#030903",
      "--bg-2": "#061206",
      "--bg-3": "#0a1e0a",
      "--border": "#14501f",
      "--text": "#4dff7a",
      "--muted": "#2fae56",
      "--accent": "#39ff77",
      "--accent-2": "#22cc55",
      "--green": "#39ff77",
      "--amber": "#d6ff4d",
      "--red": "#ff5b5b",
      "--purple": "#9cff6a",
      "--radius": "0px",
      "--tab-radius": "0px",
      "--pill-radius": "0px",
      "--btn-border": "1px solid #14501f",
      "--input-border": "1px solid #14501f",
      "--btn-hover": "#39ff77",
      "--accent-fg": "#031406",
      "--accent-soft": "rgba(57,255,119,0.12)",
      "--text-2": "#39d466",
      "--font": MONO,
      "--font-size": "13px",
      "--code-bg": "#020702",
      "--term-bg": "#020702",
      "--term-fg": "#39ff77",
      "--term-cursor": "#39ff77",
      "--cm-map-bg": "#020702",
      "--cm-dir-bg": "rgba(34,204,85,0.22)",
      "--cm-dir-hover": "rgba(57,255,119,0.28)",
      "--cm-dir-border": "#14501f",
      "--cm-file-bg": "#051005",
      "--cm-label-fg": "#4dff7a",
      "--cm-code-fg": "#2fae56",
      "--scroll-thumb": "#14501f",
      "--panel-shadow": "0 0 24px rgba(57,255,119,0.25)",
      "--question-bg": "#061206",
      "--question-border": "#14501f",
      "--permission-bg": "#141206",
      "--permission-border": "#6a6a1a",
      "--mark-bg": "#39ff77",
      "--mark-fg": "#031406",
      "--diff-bg": "#020702",
      "--diff-ctx": "#39d466",
    }),
  },
];

export const DEFAULT_THEME = "dark";

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

// Union of every theme's variables, so switching between themes always clears
// all of them (not just the first theme's key set).
const ALL_KEYS = [...new Set(THEMES.flatMap((t) => Object.keys(t.vars)))];
const LIB_LINK_ID = "aiman-theme-lib";

/** Remove any theme library stylesheets (98.css / XP.css) from the document. */
function removeThemeLibs(): void {
  document
    .querySelectorAll('link[data-aiman-theme-lib], link[id^="aiman-theme-lib"]')
    .forEach((el) => el.remove());
}

/** Apply a theme by writing its variables onto <html> and tagging data-theme. */
export function applyTheme(id: string): void {
  const theme = getTheme(id);
  const root = document.documentElement;

  // Always detach a previously loaded theme stylesheet first so its global
  // element styles (buttons, inputs, fonts) can't leak into other themes.
  removeThemeLibs();

  // Clear previously-set variables, then apply this theme's full set.
  for (const k of ALL_KEYS) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;

  // Lazily attach the optional stylesheet for themes that need one.
  if (theme.css) {
    const link = document.createElement("link");
    link.id = LIB_LINK_ID;
    link.rel = "stylesheet";
    link.href = theme.css;
    link.dataset.aimanThemeLib = "1";
    document.head.appendChild(link);
  }
}

/** Read a resolved theme variable from the document (for canvas/xterm theming). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
