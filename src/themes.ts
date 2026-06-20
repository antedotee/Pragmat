// Theme engine. Each theme maps to the app's design tokens; per-theme accent.
export interface ThemeTokens {
  bg: string;
  sidebar: string;
  surface: string;
  text: string;
  textDim: string;
  textFaint: string;
  line: string;
  checkBorder: string;
  accent: string;
  onAccent?: string;
}

export interface Theme {
  id: string;
  name: string;
  group: string;
  dark: boolean;
  tokens: ThemeTokens;
}

export const THEMES: Theme[] = [
  // — Claude (Anthropic warm cream + coral) —
  {
    id: "claude",
    name: "Claude",
    group: "Claude",
    dark: false,
    tokens: { bg: "#faf9f5", sidebar: "#f5f0e8", surface: "#efe9de", text: "#141413", textDim: "#6c6a64", textFaint: "#8e8b82", line: "#e6dfd8", checkBorder: "#d3c9bc", accent: "#cc785c", onAccent: "#ffffff" },
  },
  {
    id: "claude-dark",
    name: "Claude Dark",
    group: "Claude",
    dark: true,
    tokens: { bg: "#181715", sidebar: "#1f1e1b", surface: "#252320", text: "#faf9f5", textDim: "#a09d96", textFaint: "#73706a", line: "#2e2c28", checkBorder: "#3d3a35", accent: "#cc785c", onAccent: "#ffffff" },
  },
  // — Catppuccin (authoritative palette) —
  {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    group: "Catppuccin",
    dark: false,
    tokens: { bg: "#eff1f5", sidebar: "#e6e9ef", surface: "#e6e9ef", text: "#4c4f69", textDim: "#6c6f85", textFaint: "#8c8fa1", line: "#ccd0da", checkBorder: "#9ca0b0", accent: "#e64553" },
  },
  {
    id: "catppuccin-frappe",
    name: "Catppuccin Frappé",
    group: "Catppuccin",
    dark: true,
    tokens: { bg: "#303446", sidebar: "#292c3c", surface: "#292c3c", text: "#c6d0f5", textDim: "#a5adce", textFaint: "#838ba7", line: "#414559", checkBorder: "#737994", accent: "#ca9ee6" },
  },
  {
    id: "catppuccin-macchiato",
    name: "Catppuccin Macchiato",
    group: "Catppuccin",
    dark: true,
    tokens: { bg: "#24273a", sidebar: "#1e2030", surface: "#1e2030", text: "#cad3f5", textDim: "#a5adcb", textFaint: "#8087a2", line: "#363a4f", checkBorder: "#6e738d", accent: "#c6a0f6" },
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    group: "Catppuccin",
    dark: true,
    tokens: { bg: "#1e1e2e", sidebar: "#181825", surface: "#181825", text: "#cdd6f4", textDim: "#a6adc8", textFaint: "#7f849c", line: "#313244", checkBorder: "#6c7086", accent: "#cba6f7" },
  },
  // — Standalone classics —
  {
    id: "dracula",
    name: "Dracula",
    group: "Classic",
    dark: true,
    tokens: { bg: "#282a36", sidebar: "#21222c", surface: "#21222c", text: "#f8f8f2", textDim: "#9aa0c4", textFaint: "#6272a4", line: "#44475a", checkBorder: "#6272a4", accent: "#bd93f9" },
  },
  {
    id: "nord",
    name: "Nord",
    group: "Classic",
    dark: true,
    tokens: { bg: "#2e3440", sidebar: "#272c36", surface: "#3b4252", text: "#eceff4", textDim: "#d8dee9", textFaint: "#7b8394", line: "#3b4252", checkBorder: "#4c566a", accent: "#88c0d0" },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    group: "Classic",
    dark: true,
    tokens: { bg: "#1a1b26", sidebar: "#16161e", surface: "#1f2335", text: "#c0caf5", textDim: "#9aa5ce", textFaint: "#565f89", line: "#2f334d", checkBorder: "#565f89", accent: "#7aa2f7" },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    group: "Classic",
    dark: true,
    tokens: { bg: "#282828", sidebar: "#1d2021", surface: "#32302f", text: "#ebdbb2", textDim: "#d5c4a1", textFaint: "#928374", line: "#3c3836", checkBorder: "#504945", accent: "#fe8019" },
  },
  {
    id: "gruvbox-light",
    name: "Gruvbox Light",
    group: "Classic",
    dark: false,
    tokens: { bg: "#fbf1c7", sidebar: "#f2e5bc", surface: "#f9f5d7", text: "#3c3836", textDim: "#665c54", textFaint: "#928374", line: "#ebdbb2", checkBorder: "#bdae93", accent: "#d65d0e" },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    group: "Classic",
    dark: false,
    tokens: { bg: "#fdf6e3", sidebar: "#eee8d5", surface: "#fdf6e3", text: "#586e75", textDim: "#657b83", textFaint: "#93a1a1", line: "#e3dcc6", checkBorder: "#b9c0a8", accent: "#268bd2" },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    group: "Classic",
    dark: true,
    tokens: { bg: "#002b36", sidebar: "#073642", surface: "#073642", text: "#93a1a1", textDim: "#839496", textFaint: "#586e75", line: "#0e3d49", checkBorder: "#586e75", accent: "#268bd2" },
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    group: "Rosé Pine",
    dark: true,
    tokens: { bg: "#191724", sidebar: "#1f1d2e", surface: "#1f1d2e", text: "#e0def4", textDim: "#908caa", textFaint: "#6e6a86", line: "#2a2837", checkBorder: "#524f67", accent: "#eb6f92" },
  },
  {
    id: "rose-pine-dawn",
    name: "Rosé Pine Dawn",
    group: "Rosé Pine",
    dark: false,
    tokens: { bg: "#faf4ed", sidebar: "#fffaf3", surface: "#fffaf3", text: "#575279", textDim: "#797593", textFaint: "#9893a5", line: "#f2e9e1", checkBorder: "#cecacd", accent: "#d7827e" },
  },
  {
    id: "one-dark",
    name: "One Dark",
    group: "Classic",
    dark: true,
    tokens: { bg: "#282c34", sidebar: "#21252b", surface: "#21252b", text: "#abb2bf", textDim: "#9da5b4", textFaint: "#5c6370", line: "#3b4048", checkBorder: "#4b5263", accent: "#61afef" },
  },
  {
    id: "everforest",
    name: "Everforest",
    group: "Classic",
    dark: true,
    tokens: { bg: "#2d353b", sidebar: "#272e33", surface: "#272e33", text: "#d3c6aa", textDim: "#9da9a0", textFaint: "#7a8478", line: "#3d484d", checkBorder: "#4f585e", accent: "#a7c080" },
  },
];

const DEFAULT_ID = "claude";
const STORAGE_KEY = "pragmat.theme.v2"; // bumped so the app adopts the Claude default once

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Lighten (dark themes) or darken (light themes) for press feedback.
function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function savedThemeId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_ID;
  } catch {
    return DEFAULT_ID;
  }
}

export function applyTheme(id: string): void {
  const theme = getTheme(id);
  const t = theme.tokens;
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(k, v);

  set("--bg", t.bg);
  set("--bg-sidebar", t.sidebar);
  set("--surface", t.surface);
  set("--hover", theme.dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)");
  set("--sel", rgba(t.accent, 0.2));
  set("--text", t.text);
  set("--text-dim", t.textDim);
  set("--text-faint", t.textFaint);
  set("--line", t.line);
  set("--check-border", t.checkBorder);
  set("--accent", t.accent);
  set("--accent-press", shade(t.accent, theme.dark ? 0.08 : -0.1));
  set("--on-accent", t.onAccent ?? (theme.dark ? t.bg : "#ffffff"));
  set("--shadow-modal", theme.dark ? "0 16px 50px rgba(0,0,0,0.55)" : "0 16px 50px rgba(0,0,0,0.18)");

  root.dataset.theme = id;
  root.style.colorScheme = theme.dark ? "dark" : "light";

  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
