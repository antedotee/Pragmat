import { state, tasksForView, loggedTasksForView, distinctTagsForView, burstProgress, type View, type Task } from "../state";
import { icon, type IconName } from "../icons";
import { progressRing } from "./progress-ring";
import { createTaskEl, type RowHandlers } from "./task-item";
import { TAB_SPRING } from "../spring";
import { autosizeTextarea, autosizeHeight, springHeight, staggerReveal, spring, lerp, clamp01 } from "./anim";

export interface BoardRefs {
  titleEl: HTMLElement;
  countEl: HTMLElement;
  notesEl: HTMLTextAreaElement;
  listEl: HTMLElement;
  tagBarEl: HTMLElement;
}

export interface BoardHandlers extends RowHandlers {
  onToggleTag: (tag: string) => void;
  onRenameLane: (type: "burst" | "arc", id: number, name: string) => void;
  onSaveNotes: (type: "burst" | "arc", id: number, notes: string) => void;
}

function laneName(v: View): string {
  if (v.type === "burst") return state.bursts.find((x) => x.id === v.id)?.name ?? "";
  if (v.type === "arc") return state.arcs.find((x) => x.id === v.id)?.name ?? "";
  return "";
}

function laneNotes(v: View): string {
  if (v.type === "burst") return state.bursts.find((x) => x.id === v.id)?.notes ?? "";
  if (v.type === "arc") return state.arcs.find((x) => x.id === v.id)?.notes ?? "";
  return "";
}

// A free-text notes field under the burst/arc title. Auto-grows with its
// content, pushing the tag bar + task list down (the board is a flex column).
function renderNotes(refs: BoardRefs, view: View, h: BoardHandlers): void {
  const ta = refs.notesEl;
  if (view.type !== "burst" && view.type !== "arc") {
    ta.style.display = "none";
    ta.value = "";
    return;
  }
  const type = view.type;
  const id = view.id!;
  ta.style.display = "";
  ta.style.width = ""; // clear any stale hug-width; CSS now stretches it full-width
  ta.value = laneNotes(view);
  const autosize = () => autosizeHeight(ta);
  ta.oninput = () => {
    autosize();
    h.onSaveNotes(type, id, ta.value);
  };
  autosize();
}

export function focusHeaderTitle(refs: BoardRefs): void {
  const input = refs.titleEl.querySelector<HTMLTextAreaElement>(".board-title-input");
  input?.focus(); // empty value → cursor at start, no select-all highlight
}

function iconForView(v: View): IconName {
  switch (v.type) {
    case "raw": return "raws";
    case "today": return "today";
    case "future": return "future";
    case "whenever": return "whenever";
    case "downtheroad": return "downtheroad";
    case "logs": return "logs";
    case "bin": return "bin";
    case "burst": return "burst";
    case "arc": return "arc";
  }
}

export function titleForView(v: View): string {
  switch (v.type) {
    case "raw": return "Raws";
    case "today": return "Today";
    case "future": return "Future";
    case "whenever": return "Whenever";
    case "downtheroad": return "Down the road";
    case "logs": return "Logs";
    case "bin": return "Bin";
    case "burst": {
      const b = state.bursts.find((x) => x.id === v.id);
      return b && b.name ? b.name : "New Burst";
    }
    case "arc": {
      const a = state.arcs.find((x) => x.id === v.id);
      return a && a.name ? a.name : "New Arc";
    }
  }
}

function emptyHintFor(v: View): string {
  if (v.type === "logs") return "Completed to-dos land here";
  if (v.type === "bin") return "Nothing in the bin";
  if (v.type === "raw") return "Dump anything here — sort it later";
  return "Press ⌘N to add a to-do";
}

export function emptyState(v: View): HTMLElement {
  const div = document.createElement("div");
  div.className = "empty";
  div.textContent = emptyHintFor(v);
  return div;
}

export function renderHeader(refs: BoardRefs, view: View, _count: number, h: BoardHandlers): void {
  refs.countEl.textContent = ""; // count beside the title removed
  // bursts show a completion ring in the icon slot; everything else keeps its glyph
  const iconHtml =
    view.type === "burst"
      ? `<span class="board-icon">${progressRing(21, burstProgress(view.id!))}</span>`
      : `<span class="board-icon">${icon(iconForView(view), 21)}</span>`;

  if (view.type === "burst" || view.type === "arc") {
    refs.titleEl.innerHTML = iconHtml;
    // textarea (not input) so a long name wraps and the header grows to fit it.
    const input = document.createElement("textarea");
    input.className = "board-title-input";
    input.value = laneName(view);
    input.placeholder = view.type === "burst" ? "New Burst" : "New Arc";
    input.rows = 1;
    input.spellcheck = false;
    const type = view.type;
    const id = view.id!;
    const sizeInput = () => autosizeTextarea(input);
    input.addEventListener("input", () => {
      sizeInput();
      h.onRenameLane(type, id, input.value);
    });
    input.addEventListener("blur", () => h.onRenameLane(type, id, input.value.trim()));
    input.addEventListener("keydown", (e) => {
      // names are single-line: Enter/Escape commit + blur (no newline)
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        input.blur();
      }
    });
    refs.titleEl.appendChild(input);
    requestAnimationFrame(sizeInput); // size to the current name once in the DOM
  } else {
    refs.titleEl.innerHTML = iconHtml + `<span class="board-title-text">${titleForView(view)}</span>`;
  }
}

// Tracks the tag pill indicator's current geometry so it can spring smoothly
// from one pill to the next (and not flash) — mirrors the sidebar pill.
let tagLast: { x: number; w: number } | null = null;

export function renderTagBar(refs: BoardRefs, view: View, activeTag: string | null, h: BoardHandlers): void {
  const bar = refs.tagBarEl;
  bar.innerHTML = "";
  tagLast = null;
  if (view.type !== "burst" && view.type !== "arc") {
    bar.style.display = "none";
    return;
  }
  const tags = distinctTagsForView(view);
  if (tags.length === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "";

  const indicator = document.createElement("div");
  indicator.className = "tag-indicator";
  bar.append(indicator);

  for (const tag of tags) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-pill";
    chip.dataset.tag = tag;
    chip.textContent = tag;
    chip.addEventListener("click", () => h.onToggleTag(tag));
    bar.append(chip);
  }
  moveTagIndicator(refs, activeTag, false);
}

// Slide the tag pill indicator to the active filter — same spring as the
// sidebar label pill. Does NOT rebuild the bar, so the slide is smooth.
export function moveTagIndicator(refs: BoardRefs, activeTag: string | null, animate: boolean): void {
  const bar = refs.tagBarEl;
  const indicator = bar.querySelector<HTMLElement>(".tag-indicator");
  if (!indicator) return;

  bar.querySelectorAll<HTMLElement>(".tag-pill").forEach((p) =>
    p.classList.toggle("active", activeTag !== null && p.dataset.tag === activeTag),
  );

  const active = activeTag ? bar.querySelector<HTMLElement>(`.tag-pill[data-tag="${CSS.escape(activeTag)}"]`) : null;
  if (!active) {
    indicator.style.opacity = "0";
    tagLast = null;
    return;
  }

  const pr = active.getBoundingClientRect();
  const br = bar.getBoundingClientRect();
  const x = pr.left - br.left;
  const w = pr.width;
  indicator.style.top = `${pr.top - br.top}px`;
  indicator.style.height = `${pr.height}px`;
  indicator.style.opacity = "1";
  indicator.getAnimations().forEach((a) => a.cancel());

  if (!animate || tagLast === null) {
    indicator.style.transform = `translateX(${x}px)`;
    indicator.style.width = `${w}px`;
  } else {
    const sx = tagLast.x;
    const sw = tagLast.w;
    indicator.style.transform = `translateX(${sx}px)`; // base = current (no flash)
    indicator.style.width = `${sw}px`;
    const anim = spring(indicator, (t) => ({
      transform: `translateX(${lerp(sx, x, t)}px)`,
      width: `${lerp(sw, w, t)}px`,
    }));
    anim.addEventListener("finish", () => {
      indicator.style.transform = `translateX(${x}px)`;
      indicator.style.width = `${w}px`;
      anim.cancel();
    });
  }
  tagLast = { x, w };
}

// Spring the whole content block in (used on label switch) — the same
// FluidTabs spring as the sliding pill, so the transition feels like one motion.
function animateContentIn(el: HTMLElement): void {
  el.getAnimations().forEach((a) => a.cancel());
  spring(
    el,
    (t) => ({ opacity: String(clamp01(t)), transform: `translateY(${(1 - t) * 10}px)` }),
    TAB_SPRING,
    { fill: "backwards" },
  );
}

// Render the full to-do list (all rows for the view), optionally springing in.
export function renderList(refs: BoardRefs, view: View, h: BoardHandlers, animateIn = false): void {
  const tasks = tasksForView(view);
  refs.listEl.innerHTML = "";
  if (tasks.length === 0) {
    refs.listEl.appendChild(emptyState(view));
  } else if (view.type === "today") {
    appendGroupedByLane(refs.listEl, tasks, h); // show which burst/arc each to-do belongs to
  } else {
    for (const task of tasks) refs.listEl.appendChild(createTaskEl(task, h));
  }
  if (animateIn) animateContentIn(refs.listEl);
}

// Today groups its to-dos under burst/arc headings: unfiled ones first (no
// heading), then each burst (sidebar order), then each arc. Headings are plain
// <li> WITHOUT the `.task` class, so selection and drag (both keyed on `.task`)
// skip them automatically. To-dos keep their burst_id/arc_id in Today, so a drag
// only reshuffles sort_order — the next render re-groups under the same heading.
function appendGroupedByLane(list: HTMLElement, tasks: Task[], h: BoardHandlers): void {
  for (const t of tasks) if (t.burst_id == null && t.arc_id == null) list.appendChild(createTaskEl(t, h));
  for (const b of state.bursts) appendLane(list, "burst", b.name || "New Burst", tasks.filter((t) => t.burst_id === b.id), h);
  for (const a of state.arcs) appendLane(list, "arc", a.name || "New Arc", tasks.filter((t) => t.arc_id === a.id), h);
}

function appendLane(list: HTMLElement, ic: IconName, name: string, tasks: Task[], h: BoardHandlers): void {
  if (!tasks.length) return;
  const head = document.createElement("li");
  head.className = "task-group";
  const i = document.createElement("span");
  i.className = "task-group-ic";
  i.innerHTML = icon(ic, 13);
  const n = document.createElement("span");
  n.className = "task-group-name";
  n.textContent = name; // textContent, not innerHTML — lane names are free text
  head.append(i, n);
  list.appendChild(head);
  for (const t of tasks) list.appendChild(createTaskEl(t, h));
}

// Drop any group heading no longer followed by a to-do — e.g. when the last
// to-do in a burst/arc group is completed/removed without a full re-render. A
// heading owns rows until the next heading (or list end). No-op when ungrouped.
export function pruneEmptyGroups(list: HTMLElement): void {
  for (const head of list.querySelectorAll<HTMLElement>(".task-group")) {
    const next = head.nextElementSibling;
    if (!next || next.classList.contains("task-group")) head.remove();
  }
}

// Tag filtering = show/hide existing rows (no rebuild) → nothing competes with
// the sliding pill, so the switch stays smooth.
export function applyTagFilter(refs: BoardRefs, activeTag: string | null): void {
  refs.listEl.querySelectorAll<HTMLElement>(".task").forEach((row) => {
    if (!activeTag) {
      row.style.display = "";
      return;
    }
    const task = state.tasks.find((t) => t.id === Number(row.dataset.id));
    row.style.display = task && task.tags.includes(activeTag) ? "" : "none";
  });
}

// Completed to-dos in a burst/arc live here, hidden behind a "Show logged items"
// toggle below the active list. Collapsed by default; ephemeral (resets on view
// switch via renderBoard). Call standalone to refresh after a completion.
let loggedExpanded = false;

export function renderLogged(refs: BoardRefs, view: View, h: BoardHandlers): void {
  refs.listEl.querySelector(".logged-section")?.remove(); // idempotent refresh
  const logged = loggedTasksForView(view);
  if (logged.length === 0) {
    loggedExpanded = false; // nothing left to show → drop the open state
    return;
  }

  const section = document.createElement("li");
  section.className = "logged-section";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "logged-toggle";
  const setLabel = () => (toggle.textContent = loggedExpanded ? "Hide logged items" : "Show logged items");
  setLabel();

  const items = document.createElement("div");
  items.className = "logged-items";
  for (const t of logged) items.appendChild(createTaskEl(t, h));

  // Show/hide reuses the card's height-spring — inline, no overlay/focus. The
  // toggle stays put; the panel grows beneath it (height: 0 ↔ measured).
  if (loggedExpanded) {
    items.style.height = "auto";
    items.style.overflow = "visible";
  } else {
    items.style.height = "0px";
    items.style.overflow = "hidden";
  }

  let anim: Animation | null = null;
  toggle.addEventListener("click", () => {
    loggedExpanded = !loggedExpanded;
    setLabel();
    anim?.cancel();
    if (loggedExpanded) {
      const rows = [...items.children] as HTMLElement[];
      items.style.height = "auto";
      const target = items.offsetHeight; // true open height
      items.style.height = "0px";
      items.style.overflow = "hidden";
      for (const r of rows) r.style.opacity = "0"; // hidden while it grows
      void items.getBoundingClientRect();
      anim = springHeight(items, 0, target);
      anim.finished.then(
        () => {
          items.style.height = "auto"; // hand back to natural flow
          items.style.overflow = "visible";
          staggerReveal(rows);
        },
        () => {}, // collapsed mid-grow
      );
    } else {
      const cur = items.offsetHeight;
      items.style.overflow = "hidden";
      anim = springHeight(items, cur, 0);
    }
  });

  section.append(toggle, items);
  refs.listEl.appendChild(section);
}

export function renderBoard(
  refs: BoardRefs,
  view: View,
  h: BoardHandlers,
  activeTag: string | null,
  animateIn = false,
): void {
  loggedExpanded = false; // view switch → logged section starts collapsed
  renderHeader(refs, view, tasksForView(view).length, h);
  renderNotes(refs, view, h);
  renderTagBar(refs, view, activeTag, h);
  renderList(refs, view, h, animateIn);
  renderLogged(refs, view, h);
  applyTagFilter(refs, activeTag);
}
