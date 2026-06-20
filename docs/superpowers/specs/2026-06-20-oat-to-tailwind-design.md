# oat → Tailwind (full utility rewrite) — design

**Date:** 2026-06-20
**Status:** approved; implementing without a separate review gate (per user)

## Why

`oat` causes recurring breakage. Findings:

- `src/vendor/oat.min.js` defines only `ot-tabs` and `ot-dropdown` web components —
  **neither is used**. Dead weight.
- `src/vendor/oat.min.css` — the app uses **zero** oat utility/component classes. Every
  class is bespoke (`.task`, `.cp`, `.checkbox`, `.nav-item`, …). The only effect oat has
  is its **base reset** (button padding, `textarea min-height:5rem`, input margins, focus
  ring, `align-items` on buttons) — the exact source of the bugs (pill toggle, textarea
  heights, etc.).
- Real styling: `src/styles/app.css` (~1500 lines, hand-written) + `src/styles/theme.css`
  (tokens + `@font-face`).

Chosen approach (user): **full utility rewrite** — convert components to inline Tailwind
utilities, move JS hooks off styling classes.

## Linchpin: runtime theming must survive

`src/themes.ts` `applyTheme()` swaps 17 themes live by writing CSS custom properties
(`--bg`, `--accent`, `--text-faint`, …) onto `document.documentElement`. Therefore colors
**must remain runtime CSS variables**; Tailwind must reference them, not inline literals.
Tailwind v4 `@theme inline` does this. **themes.ts is untouched.**

## Design

### 1. Tailwind v4 setup (CSS-first, no config/PostCSS)
- `npm i -D tailwindcss @tailwindcss/vite`; add `tailwindcss()` to `vite.config.ts`.
- New `src/styles/tailwind.css`, the single style entry:
  - `@import "tailwindcss";` → **Preflight** is the reset (replaces oat: buttons unpadded →
    no pill; no textarea `min-height:5rem`; predictable margins/box-sizing).
  - `@theme inline { … }` token bridge (below).
  - `@utility`/residual CSS block (below).
- Delete `src/vendor/oat.min.js` + `src/vendor/oat.min.css`; drop both imports from
  `src/main.ts`. Drop the `declare module "*/oat.min.js"` line in `src/vite-env.d.ts`.
- `src/styles/theme.css` keeps `@font-face` + the raw `:root` token fallbacks.

### 2. Token bridge
In `tailwind.css`:

```css
@theme inline {
  --color-bg: var(--bg);
  --color-sidebar: var(--bg-sidebar);
  --color-surface: var(--surface);
  --color-hover: var(--hover);
  --color-sel: var(--sel);
  --color-text: var(--text);
  --color-dim: var(--text-dim);
  --color-faint: var(--text-faint);
  --color-line: var(--line);
  --color-check: var(--check-border);
  --color-accent: var(--accent);
  --color-accent-press: var(--accent-press);
  --color-on-accent: var(--on-accent);
  --radius-row: var(--radius-row);
  --radius-card: var(--radius-card);
  --ease-out: var(--ease-out);
  --ease-in-out: var(--ease-in-out);
  --ease-spring: var(--ease-spring);
  --font-sans: var(--font-sans);
  --font-serif: var(--font-serif);
  --font-mono: var(--font-mono);
  --shadow-modal: var(--shadow-modal);
}
```

Yields `bg-bg`, `text-faint`, `border-line`, `bg-accent`, `text-on-accent`, `rounded-card`,
`ease-[…]`, `font-mono`, `shadow-modal`, etc. — all resolving to the live vars, so theme
swaps propagate with no rebuild.

### 3. Decouple styling from JS hooks (the crux)
JS currently finds/toggles elements by styling classes: `.task`, `.cp`, `.checkbox`,
`.cp-title`, `.logged-section`, `.selected`, `.done`, `.expanded`, `.dragging`,
`.drop-target`, `.leaving`, `.placeholder`, `.open`, `.closing`, … (drag-reorder, task-item,
todo-card, board, sidebar, popovers).

- **Styling → Tailwind utilities**, inline in `className`.
- **JS hooks → `data-*` attributes**: `data-task`, `data-cp`, `data-checkbox`, `data-row`,
  … Selectors become `[data-task]`, `closest("[data-cp]")`, etc.
- **Dynamic state → `data-*` flags + Tailwind `data-[…]:` variants**: a row carries
  `data-done`; its title is `data-[done]:text-faint data-[done]:opacity-60`. `.cp:hover
  .cp-del` → `group`/`group-hover:opacity-100`. JS sets/removes the attribute (e.g.
  `el.toggleAttribute("data-done", v)`); no class-string surgery.
- The spring system (`spring.ts`/`anim.ts`) animates passed-in elements via WAAPI inline
  styles — unaffected; it just needs the elements, which it gets from the same refs.

### 4. Maintainability — shared class clusters
A utility rewrite in vanilla TS rots when long class strings get copy-pasted. New
`src/ui/cls.ts` exports named constants for reused atoms — `CHIP`, `CHECKBOX`, `NAV_ITEM`,
`META_IC`, `POPOVER`, `CP_TOGGLE`, … One source of truth per atom; genuine one-offs stay
inline. Not `@apply` — real utilities, just DRY.

### 5. What stays as CSS (irreducible)
- `spring.ts`/`anim.ts` inline-style animations (untouched).
- `theme.css` `@font-face` + raw token fallbacks; the `@theme` bridge.
- A small, clearly-commented residue in `tailwind.css` for anything `group`/`peer`/`data-`
  variants can't express (target: near-zero — e.g. a keyframe if one exists, scrollbar
  styling, `::placeholder` quirks).

### 6. Phasing (each phase independently verifiable; app always runs)
1. **Foundation:** install Tailwind, plugin, `tailwind.css` (Preflight + token bridge),
   remove oat, rewire imports. `app.css` kept temporarily so the app still renders on top of
   Preflight. Reconcile any Preflight-vs-oat reset differences. Build green.
2. **`cls.ts` + first area:** to-do row (`task-item.ts`) + card (`todo-card.ts`) → utilities
   + data hooks; delete their `app.css` rules. Update drag-reorder/anim selectors to data
   hooks. Verify in the running app (light + dark theme).
3. Per-area, repeat: sidebar (`sidebar.ts`), New popover + context menu, modal, settings,
   progress-ring, board/foot/empty states, chips.
4. **Scrub:** delete `app.css`; remove every "override oat" comment and dead reference;
   confirm no `.vendor/oat*` remains; final build + full-app visual pass.

### Constraints / gotchas
- **No dynamically-constructed class fragments** (`` `text-${x}` ``). Tailwind only detects
  complete literal class strings; build every class as a full literal (conditional whole
  strings are fine).
- Verification is visual (no CSS tests; DB needs the Tauri runtime). Each phase: run the
  app, eyeball the area in a light + a dark theme (catches token-bridge errors), confirm
  drag + animations still work.

## Out of scope
- Restyling/redesign — output must match current appearance.
- Changing themes.ts or the spring system.
- Adding a `tailwind.config.js` (v4 CSS-first only).
