import { state, countForView, burstProgress, anyOverdueDeadline, type View, type ViewType, type Burst, type Arc } from "../state";
import { icon, type IconName } from "../icons";
import { spring, lerp } from "./anim";
import { enableDragReorder } from "./drag-reorder";
import { progressRing, setRingProgress } from "./progress-ring";

export interface SidebarHandlers {
  onSelect: (view: View) => void;
  onNew: (anchor: HTMLElement) => void;
  onSettings: () => void;
  // Commit a reordered lane: `id` now sits between `prevId` and `nextId` (null = section edge).
  onReorderLane: (type: "burst" | "arc", id: number, prevId: number | null, nextId: number | null) => void;
}

// `withCount` adds a low-key tally badge (Raws / Today only).
function navItem(type: ViewType, iconName: IconName, label: string, h: SidebarHandlers, withCount = false): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-item";
  btn.dataset.view = type;
  const count = withCount ? `<span class="nav-count">${countText(type)}</span>` : "";
  // Today carries a red overdue dot, toggled by refreshSidebarCounts.
  const overdue = type === "today" ? `<span class="nav-overdue"></span>` : "";
  btn.innerHTML = `<span class="nav-icon">${icon(iconName, 16)}</span><span class="nav-label">${label}</span>${overdue}${count}`;
  btn.addEventListener("click", () => h.onSelect({ type }));
  return btn;
}

function countText(type: ViewType): string {
  const n = countForView({ type });
  return n > 0 ? String(n) : "";
}

// Keep the Raws/Today badges + burst progress rings in sync after task
// mutations (no full re-render).
export function refreshSidebarCounts(root: HTMLElement): void {
  for (const type of ["raw", "today"] as const) {
    const el = root.querySelector<HTMLElement>(`.nav-item[data-view="${type}"]:not([data-id]) .nav-count`);
    if (el) el.textContent = countText(type);
  }
  // Red dot on Today while any deadline is overdue (cleared once all are done).
  const dot = root.querySelector<HTMLElement>(`.nav-item[data-view="today"]:not([data-id]) .nav-overdue`);
  if (dot) dot.classList.toggle("on", anyOverdueDeadline());
  for (const b of state.bursts) {
    const svg = root.querySelector(`.nav-item.lane[data-view="burst"][data-id="${b.id}"] .pie`);
    if (svg) setRingProgress(svg, burstProgress(b.id));
  }
}

function laneItem(type: "burst" | "arc", item: Burst | Arc, iconName: IconName, h: SidebarHandlers): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "nav-item lane";
  row.dataset.view = type;
  row.dataset.id = String(item.id);
  row.tabIndex = 0;

  const ic = document.createElement("span");
  ic.className = "nav-icon";
  // bursts show a completion ring in the icon slot; arcs keep their glyph
  ic.innerHTML = type === "burst" ? progressRing(16, burstProgress(item.id)) : icon(iconName, 16);

  const label = document.createElement("span");
  label.className = "nav-label lane-name";
  label.textContent = item.name || (type === "burst" ? "New Burst" : "New Arc");

  // Primary button only — a right-click must open the context menu without
  // selecting/navigating to the lane (mousedown fires for every button).
  row.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    h.onSelect({ type, id: item.id });
  });
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      h.onSelect({ type, id: item.id });
    }
  });

  row.append(ic, label);
  return row;
}

function laneSection(title: string, type: "burst" | "arc", items: (Burst | Arc)[], iconName: IconName, h: SidebarHandlers): HTMLElement {
  const section = document.createElement("section");
  section.className = "nav-section";
  const head = document.createElement("div");
  head.className = "section-head";
  head.innerHTML = `<h2>${title}</h2>`;
  section.append(head);
  for (const item of items) section.append(laneItem(type, item, iconName, h));
  return section;
}

// Pointer-drag reorder within a lane section. clampToList keeps the dragged lane
// inside its own section — drag past the edge and it just lands at the top/bottom,
// never crossing into the other section. The pill re-seats on drop in case the
// active lane moved.
function wireLaneReorder(root: HTMLElement, section: HTMLElement, type: "burst" | "arc", h: SidebarHandlers): void {
  enableDragReorder(section, {
    canDrag: () => true,
    rowSelector: ".nav-item.lane",
    canStart: () => true,
    clampToList: true,
    onDrop: (id, prevId, nextId) => {
      h.onReorderLane(type, id, prevId, nextId);
      setActive(root, state.view);
    },
  });
}

export function renderSidebar(root: HTMLElement, h: SidebarHandlers): void {
  root.innerHTML = "";

  // Inner wrapper holds the content at a fixed width so it clips (not squishes)
  // when the sidebar track collapses to 0 during the open/close animation.
  const inner = document.createElement("div");
  inner.className = "sidebar-inner";

  const main = document.createElement("div");
  main.className = "nav-main";

  // The selection pill lives INSIDE the scroll container so it shares the nav
  // items' content width — i.e. it shrinks with them when the scrollbar appears
  // (no overflow past the edge, no clipped corners) and scrolls with the list.
  lastY = null; // fresh indicator element → no stale spring origin
  const indicator = document.createElement("div");
  indicator.className = "nav-indicator";
  main.append(indicator);

  const raws = document.createElement("nav");
  raws.className = "nav-group";
  raws.append(navItem("raw", "raws", "Raws", h, true));

  const when = document.createElement("nav");
  when.className = "nav-group";
  when.append(
    navItem("today", "today", "Today", h, true),
    navItem("future", "future", "Future", h),
    navItem("whenever", "whenever", "Whenever", h),
    navItem("downtheroad", "downtheroad", "Down the road", h),
  );

  const archive = document.createElement("nav");
  archive.className = "nav-group";
  archive.append(
    navItem("logs", "logs", "Logs", h),
    navItem("bin", "bin", "Bin", h),
  );

  main.append(raws, when, archive);
  const burstSec = laneSection("Bursts", "burst", state.bursts, "burst", h);
  const arcSec = laneSection("Arcs", "arc", state.arcs, "arc", h);
  main.append(burstSec, arcSec);
  wireLaneReorder(root, burstSec, "burst", h);
  wireLaneReorder(root, arcSec, "arc", h);
  // Show the scrollbar only while actively scrolling (not on hover).
  let scrollTimer: number | undefined;
  main.addEventListener("scroll", () => {
    main.classList.add("scrolling");
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => main.classList.remove("scrolling"), 700);
  }, { passive: true });
  inner.append(main);

  const foot = document.createElement("div");
  foot.className = "sidebar-foot";
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "foot-btn foot-new";
  newBtn.innerHTML = `<span class="nav-icon">${icon("plus", 16)}</span><span>New</span>`;
  newBtn.addEventListener("click", () => h.onNew(newBtn));
  const setBtn = document.createElement("button");
  setBtn.type = "button";
  setBtn.className = "foot-btn foot-settings";
  setBtn.setAttribute("aria-label", "Settings");
  setBtn.innerHTML = `<span class="nav-icon">${icon("settings", 16)}</span>`;
  setBtn.addEventListener("click", h.onSettings);
  foot.append(newBtn, setBtn);
  inner.append(foot);

  root.append(inner);
}

function findActiveEl(root: HTMLElement, view: View): HTMLElement | null {
  if (view.type === "burst" || view.type === "arc") {
    return root.querySelector(`.nav-item[data-view="${view.type}"][data-id="${view.id}"]`);
  }
  return root.querySelector(`.nav-item[data-view="${view.type}"]:not([data-id])`);
}

// The sliding selection pill — ONE element, reused for every label (Today,
// Future, Logs, Bin, every burst + arc). Driven by a real spring (the FluidTabs
// feel: stiffness 380, damping 34, mass 0.75) via the Web Animations API.
let lastY: number | null = null;

function currentY(el: HTMLElement): number | null {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return null;
  try {
    return new DOMMatrixReadOnly(t).m42;
  } catch {
    return null;
  }
}

export function setActive(root: HTMLElement, view: View, animate = true): void {
  root.querySelectorAll(".nav-item.active").forEach((el) => el.classList.remove("active"));
  const el = findActiveEl(root, view);
  const main = root.querySelector<HTMLElement>(".nav-main");
  const indicator = root.querySelector<HTMLElement>(".nav-indicator");
  if (!el || !indicator || !main) {
    if (indicator) indicator.style.opacity = "0";
    lastY = null;
    return;
  }
  el.classList.add("active");
  // Position in the scroll container's content frame (unscrolled), so the
  // absolutely-positioned pill rides along as the list scrolls. Measure via
  // offsetTop, not getBoundingClientRect — a row mid drop/FLIP spring carries an
  // inline translateY, and reading its live rect seated the pill at that lifted
  // position, leaving the orange pill lagging in the wrong spot after a reorder.
  let targetY = 0;
  for (let node: HTMLElement | null = el; node && node !== main; node = node.offsetParent as HTMLElement | null) {
    targetY += node.offsetTop;
  }

  indicator.style.height = `${el.offsetHeight}px`;
  indicator.style.opacity = "1";

  const startY = currentY(indicator);
  indicator.getAnimations().forEach((a) => a.cancel());

  if (!animate || lastY === null || startY === null) {
    indicator.style.transform = `translateY(${targetY}px)`;
  } else {
    // Base stays at the CURRENT position so there's no one-frame flash to the
    // target before the spring kicks in; commit the target only on finish.
    indicator.style.transform = `translateY(${startY}px)`;
    const anim = spring(indicator, (t) => ({ transform: `translateY(${lerp(startY, targetY, t)}px)` }));
    anim.addEventListener("finish", () => {
      indicator.style.transform = `translateY(${targetY}px)`;
      anim.cancel();
    });
  }
  lastY = targetY;
}

export function setLaneName(root: HTMLElement, type: "burst" | "arc", id: number, name: string): void {
  const el = root.querySelector<HTMLElement>(`.nav-item.lane[data-view="${type}"][data-id="${id}"] .lane-name`);
  if (el) el.textContent = name || (type === "burst" ? "New Burst" : "New Arc");
}
