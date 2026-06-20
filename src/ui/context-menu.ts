import { icon, type IconName } from "../icons";

// A right-click menu that reuses the "New" popover's box + motion. Items with
// `children` are submenus: hovering the row flies a child menu out to the side
// (macOS-style), clamped on-screen and scrollable. Open/close run through the
// CSS `.open`/`.closing` transitions on `.new-popover` (NOT WAAPI) — CSS plays
// even when the OS has Reduce Motion on, which WebKit applies to Web Animations.

export type ContextItem =
  | "sep"
  | { label: string; icon?: IconName; danger?: boolean; onPick?: () => void; children?: ContextItem[] };

interface MenuOpts {
  minWidth?: number; // floor on the menu width
  openMs?: number; // open-animation duration (default = the soft disclosure spring's own)
}

const OPEN_DELAY = 90; // hover dwell before a submenu opens (avoids flicker passing over)
const CLOSE_DELAY = 180; // grace period to cross from the row into its submenu

let rootClose: (() => void) | null = null;

export function closeContextMenu(): void {
  rootClose?.();
}

export function openContextMenu(x: number, y: number, items: ContextItem[], opts: MenuOpts = {}): void {
  rootClose?.(); // only one chain at a time

  const chain = new Set<HTMLElement>(); // every menu currently open (root + submenus)
  let dismissed = false;
  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    rootClose = null;
    document.removeEventListener("mousedown", onOut, true);
    document.removeEventListener("keydown", onKey, true);
    root.close();
  }
  function onOut(e: MouseEvent): void {
    for (const el of chain) if (el.contains(e.target as Node)) return;
    dismiss();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
    }
  }

  const root = buildMenu(items, opts, dismiss, chain);
  document.body.appendChild(root.el);
  // anchor at the cursor, clamped so the menu stays on screen
  const r = root.el.getBoundingClientRect();
  root.el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  root.el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  playOpen(root.el, "top left");

  rootClose = dismiss;
  window.setTimeout(() => {
    document.addEventListener("mousedown", onOut, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}

interface Built {
  el: HTMLDivElement;
  close: () => void;
}

function buildMenu(items: ContextItem[], opts: MenuOpts, dismiss: () => void, chain: Set<HTMLElement>): Built {
  const pop = document.createElement("div");
  pop.className = "new-popover ctx-menu";
  if (opts.minWidth != null) pop.style.minWidth = `${opts.minWidth}px`;
  chain.add(pop);

  let child: Built | null = null;
  let openT = 0;
  let closeT = 0;
  let closed = false;

  function closeChild(): void {
    child?.close();
    child = null;
  }
  function close(): void {
    if (closed) return;
    closed = true;
    clearTimeout(openT);
    clearTimeout(closeT);
    closeChild();
    chain.delete(pop);
    animateOut(pop);
  }

  for (const it of items) {
    if (it === "sep") {
      const s = document.createElement("div");
      s.className = "ctx-sep";
      pop.append(s);
      continue;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ctx-item" + (it.danger ? " danger" : "");
    const ic = `<span class="ctx-icon">${it.icon ? icon(it.icon, 15) : ""}</span>`;
    const chev = it.children ? `<span class="ctx-chevron">›</span>` : "";
    b.innerHTML = `${ic}<span class="ctx-label">${it.label}</span>${chev}`;

    if (it.children) {
      const kids = it.children;
      const openChild = (): void => {
        clearTimeout(closeT);
        if (child) return;
        const c = buildMenu(kids, opts, dismiss, chain);
        document.body.appendChild(c.el);
        positionBeside(c.el, b, pop);
        playOpen(c.el, "left top");
        c.el.addEventListener("mouseenter", () => clearTimeout(closeT));
        c.el.addEventListener("mouseleave", () => (closeT = window.setTimeout(closeChild, CLOSE_DELAY)));
        child = c;
      };
      b.addEventListener("mouseenter", () => {
        clearTimeout(closeT);
        openT = window.setTimeout(openChild, OPEN_DELAY);
      });
      b.addEventListener("mouseleave", () => {
        clearTimeout(openT);
        closeT = window.setTimeout(closeChild, CLOSE_DELAY);
      });
      b.addEventListener("click", () => {
        clearTimeout(openT);
        openChild();
      });
    } else {
      b.addEventListener("mouseenter", closeChild); // moving to a sibling closes any open submenu
      b.addEventListener("click", () => {
        dismiss();
        it.onPick?.();
      });
    }
    pop.append(b);
  }

  return { el: pop, close };
}

// Place a submenu beside its parent row: to the right, or flipped left if it
// would overflow; vertically aligned to the row and clamped to the viewport.
function positionBeside(childEl: HTMLElement, itemEl: HTMLElement, parentEl: HTMLElement): void {
  const ir = itemEl.getBoundingClientRect();
  const pr = parentEl.getBoundingClientRect();
  const cr = childEl.getBoundingClientRect();
  let left = pr.right - 4; // slight overlap so the pointer can cross without a gap
  if (left + cr.width > window.innerWidth - 8) left = pr.left - cr.width + 4; // flip to the left
  const top = Math.max(8, Math.min(ir.top - 6, window.innerHeight - cr.height - 8));
  childEl.style.left = `${Math.max(8, left)}px`;
  childEl.style.top = `${top}px`;
}

function playOpen(el: HTMLElement, origin: string): void {
  el.style.transformOrigin = origin;
  // CSS `.open` transition (plays under Reduce Motion, unlike WAAPI). Force a
  // reflow so the resting state commits before flipping to `.open`.
  void el.offsetWidth;
  el.classList.add("open");
}

function animateOut(el: HTMLElement): void {
  el.classList.remove("open");
  el.classList.add("closing");
  el.addEventListener("transitionend", () => el.remove(), { once: true });
  window.setTimeout(() => el.remove(), 250); // fallback if transitionend doesn't fire
}
