import { openModal } from "./modal";
import { THEMES, applyTheme, savedThemeId, type Theme } from "../themes";

function swatch(t: Theme, active: boolean): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "theme-swatch" + (active ? " active" : "");
  el.dataset.id = t.id;
  el.innerHTML = `
    <span class="ts-preview" style="background:${t.tokens.bg}">
      <span class="ts-bar" style="background:${t.tokens.sidebar}"></span>
      <span class="ts-rows">
        <span class="ts-dot" style="background:${t.tokens.accent}"></span>
        <span class="ts-line" style="background:${t.tokens.text}"></span>
        <span class="ts-line short" style="background:${t.tokens.textFaint}"></span>
      </span>
    </span>
    <span class="ts-name">${t.name}</span>`;
  return el;
}

export function openSettings(onThemeChange: () => void): void {
  const root = document.createElement("div");
  root.className = "settings";
  root.innerHTML = `<h2 class="set-title">Settings</h2>
    <section class="set-section"><h3 class="set-label">Theme</h3><div class="theme-grid"></div></section>`;

  const grid = root.querySelector(".theme-grid")!;
  const current = savedThemeId();
  for (const t of THEMES) {
    const el = swatch(t, t.id === current);
    el.addEventListener("click", () => {
      applyTheme(t.id);
      grid.querySelectorAll(".theme-swatch.active").forEach((e) => e.classList.remove("active"));
      el.classList.add("active");
      onThemeChange();
    });
    grid.append(el);
  }

  openModal(root, { className: "modal-settings" });
}
