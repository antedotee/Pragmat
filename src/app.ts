import {
  state,
  contextForView,
  tasksForView,
  addTask,
  setTaskStatus,
  deleteTask,
  addBurst,
  addArc,
  renameBurst,
  renameArc,
  setBurstNotes,
  setArcNotes,
  setTaskOrder,
  setBurstOrder,
  setArcOrder,
  burstProgress,
  moveTasks,
  duplicateTask,
  deleteBurst,
  deleteArc,
  todoHomeView,
  type View,
  type ViewType,
  type Task,
} from "./state";
import { toISODate } from "./date";
import { renderSidebar, setActive, setLaneName, refreshSidebarCounts, type SidebarHandlers } from "./ui/sidebar";
import {
  renderBoard,
  renderList,
  renderTagBar,
  renderLogged,
  moveTagIndicator,
  applyTagFilter,
  emptyState,
  focusHeaderTitle,
  pruneEmptyGroups,
  type BoardRefs,
  type BoardHandlers,
} from "./ui/board";
import { createTaskEl } from "./ui/task-item";
import { enableDragReorder } from "./ui/drag-reorder";
import { openContextMenu, type ContextItem } from "./ui/context-menu";
import { autosizeTextarea, autosizeHeight } from "./ui/anim";
import { setRingProgress } from "./ui/progress-ring";
import { openTodoCard, closeTodoCard } from "./ui/todo-card";
import { openNewPopover } from "./ui/new-popover";
import { openSettings } from "./ui/settings";
import { openSearch } from "./ui/search";
import { registerShortcuts } from "./keyboard";
import { undo as historyUndo, redo as historyRedo } from "./history";
import { springPath, springDurationMs, TAB_SPRING } from "./spring";

let sidebarEl: HTMLElement;
let listEl: HTMLElement;
let boardRefs: BoardRefs;
let sidebarHandlers: SidebarHandlers;
let activeTag: string | null = null;
const lingerTimers = new Map<number, number>(); // task id → pending "slide out after complete" timer

export function mount(appRoot: HTMLElement): void {
  appRoot.innerHTML = `
    <aside id="sidebar"></aside>
    <div id="sidebar-resize" class="sidebar-resize" title="Drag to resize · click to toggle (⌘\\)"></div>
    <main id="board">
      <header class="board-header">
        <h1 id="board-title"></h1>
        <span class="board-count" id="board-count"></span>
      </header>
      <textarea id="board-notes" class="board-notes" placeholder="Notes" rows="1" spellcheck="false"></textarea>
      <div class="tag-bar" id="board-tags"></div>
      <ul id="task-list"></ul>
    </main>`;

  sidebarEl = appRoot.querySelector<HTMLElement>("#sidebar")!;
  listEl = appRoot.querySelector<HTMLElement>("#task-list")!;
  boardRefs = {
    titleEl: appRoot.querySelector<HTMLElement>("#board-title")!,
    countEl: appRoot.querySelector<HTMLElement>("#board-count")!,
    notesEl: appRoot.querySelector<HTMLTextAreaElement>("#board-notes")!,
    listEl,
    tagBarEl: appRoot.querySelector<HTMLElement>("#board-tags")!,
  };

  sidebarHandlers = {
    onSelect: selectView,
    onNew: (anchor) => openNewPopover(anchor, { onBurst: newBurst, onArc: newArc }),
    onSettings: () => openSettings(() => setActive(sidebarEl, state.view, false)),
    onReorderLane: reorderLane,
  };

  renderSidebar(sidebarEl, sidebarHandlers);
  openW = clampWidth(openW);
  applyWidth(openW); // pin inner + track to the open width in px
  selectView({ type: "today" });

  initResizeHandle(appRoot.querySelector<HTMLElement>("#sidebar-resize")!);

  enableDragReorder(listEl, {
    // Future is a date-grouped agenda (order is by date), so flat drag-reorder
    // is disabled there — dates are changed via the card, not by dragging.
    canDrag: () => ["raw", "today", "whenever", "downtheroad", "burst", "arc"].includes(state.view.type),
    onDrop: reorderTask,
    selectedIds: () => [...listEl.querySelectorAll<HTMLElement>(".task.selected")].map((r) => Number(r.dataset.id)),
    dropTargetAt: sidebarDropTarget,
    onMoveTo: (ids, targetEl) =>
      void moveDraggedTo(ids, { type: targetEl.dataset.view as ViewType, id: targetEl.dataset.id ? Number(targetEl.dataset.id) : undefined }),
  });

  // clicking empty list space clears the multi-selection
  listEl.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest(".task")) clearSelection();
  });

  // right-click a to-do → context menu (acts on the whole selection if right-
  // clicking one of several selected rows)
  listEl.addEventListener("contextmenu", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLLIElement>(".task");
    if (!row || row.classList.contains("expanded") || row.closest(".logged-section")) return;
    e.preventDefault();
    openTodoMenu(e.clientX, e.clientY, row);
  });

  // right-click a burst/arc lane → its context menu
  sidebarEl.addEventListener("contextmenu", (e) => {
    const lane = (e.target as HTMLElement).closest<HTMLElement>(".nav-item.lane[data-view][data-id]");
    if (!lane) return;
    e.preventDefault();
    openLaneMenu(e.clientX, e.clientY, lane.dataset.view as "burst" | "arc", Number(lane.dataset.id));
  });

  registerShortcuts({
    newTask, newBurst, newArc, go: selectView, toggleSidebar, deleteSelected, undo, redo,
    search: () => openSearch({ onPickView: selectView, onPickTodo: revealTodo }),
  });
  window.addEventListener("resize", () => {
    if (sidebarOpen) {
      openW = clampWidth(openW);
      applyWidth(openW);
    }
    setActive(sidebarEl, state.view, false);
  });

  // Re-fit the auto-sized header title + burst/arc notes when the board width
  // changes — but NOT during the sidebar open/close animation, which fires this
  // every frame and would jitter the motion (animateTrack re-fits once at the end).
  new ResizeObserver(() => {
    if (!sbAnimating) refitBoardText();
  }).observe(appRoot.querySelector<HTMLElement>("#board")!);
  document.fonts?.ready.then(refitBoardText);
}

function refitBoardText(): void {
  const t = boardRefs.titleEl.querySelector<HTMLTextAreaElement>(".board-title-input");
  if (t) autosizeTextarea(t);
  if (boardRefs.notesEl.offsetParent) autosizeHeight(boardRefs.notesEl);
}

// --- sidebar: resize + collapse ----------------------------------------------
const SB_MIN = 180;
const SB_MAX = 360;
let sidebarOpen = true;
let openW = clampWidth(248); // user's chosen open width (px), live during a drag
let collapseRaf = 0;
let sbAnimating = false; // true while the open/close spring runs (pauses the board refit)

function clampWidth(w: number): number {
  const appW = document.getElementById("app")!.getBoundingClientRect().width || 1000;
  return Math.round(Math.max(SB_MIN, Math.min(SB_MAX, Math.min(w, appW - 320))));
}

// Track width (the grid column) and the fixed inner-content width.
function applyWidth(w: number): void {
  document.getElementById("app")!.style.setProperty("--sb-w", `${w}px`);
  sidebarEl.querySelector<HTMLElement>(".sidebar-inner")?.style.setProperty("width", `${w}px`);
}

// Collapse/expand the sidebar as a GPU transform slide. Animating the grid
// column (--sb-w) re-lays-out the board every frame → jank. Instead the grid
// stays OPEN during the motion and we translate #sidebar + #board together
// (pure compositing, no per-frame reflow). The grid commits to its resting
// state exactly once — before an open, after a close — so the board reflows
// just once. The board content is left-aligned, so the strip exposed on the
// right mid-slide is plain background: invisible. Same FluidTabs spring as the
// sliding pill (spring.ts). Interruptible: a new call cancels the prior rAF.
function slideSidebar(opening: boolean): void {
  cancelAnimationFrame(collapseRaf);
  const app = document.getElementById("app")!;
  const board = document.getElementById("board")!;

  if (opening) {
    // open the grid now (board reflows to its open width, once); the start
    // transform below shifts everything back to the closed look so there's no jump.
    app.style.setProperty("--sb-w", `${openW}px`);
    sidebarEl.querySelector<HTMLElement>(".sidebar-inner")?.style.setProperty("width", `${openW}px`);
  }
  const from = opening ? -openW : 0;
  const to = opening ? 0 : -openW;
  const set = (tx: number): void => {
    const v = `translateX(${tx}px)`;
    sidebarEl.style.transform = v;
    board.style.transform = v;
  };
  const finish = (): void => {
    if (!opening) app.style.setProperty("--sb-w", "0px"); // commit closed grid → board fills
    sidebarEl.style.transform = "";
    board.style.transform = "";
    sbAnimating = false;
    refitBoardText();
  };

  const path = springPath(from, to, TAB_SPRING);
  const dur = springDurationMs(path);
  const start = performance.now();
  sbAnimating = true;
  set(from);
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / dur);
    set(Math.round(path[Math.floor(t * (path.length - 1))]));
    if (t < 1) collapseRaf = requestAnimationFrame(step);
    else finish();
  };
  collapseRaf = requestAnimationFrame(step);
}

function toggleSidebar(): void {
  sidebarOpen = !sidebarOpen;
  slideSidebar(sidebarOpen);
}

// Drag the seam to resize; a click (no drag) toggles open/closed.
function initResizeHandle(handle: HTMLElement): void {
  const app = document.getElementById("app")!;
  let startX = 0;
  let startW = 0;
  let moved = false;
  let maxW = SB_MAX; // upper clamp — depends on app width, read once per drag
  let inner: HTMLElement | null = null;
  let pendingW = 0;
  let raf = 0;

  // Apply the width at most once per frame; no layout reads here (no thrash).
  const flush = (): void => {
    raf = 0;
    app.style.setProperty("--sb-w", `${pendingW}px`);
    inner?.style.setProperty("width", `${pendingW}px`);
  };

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    cancelAnimationFrame(collapseRaf);
    sbAnimating = false; // a drag takes over from any in-flight toggle
    sidebarEl.style.transform = ""; // clear any mid-slide transform
    document.getElementById("board")!.style.transform = "";
    moved = false;
    startX = e.clientX;
    startW = sidebarOpen ? openW : 0;
    // Read layout-dependent values ONCE — the window can't resize mid-drag.
    maxW = Math.min(SB_MAX, app.getBoundingClientRect().width - 320);
    inner = sidebarEl.querySelector<HTMLElement>(".sidebar-inner");
    handle.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
  });

  handle.addEventListener("pointermove", (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    if (Math.abs(e.clientX - startX) > 3) moved = true;
    if (!moved) return;
    openW = Math.round(Math.max(SB_MIN, Math.min(maxW, startW + (e.clientX - startX))));
    pendingW = openW;
    sidebarOpen = true;
    if (!raf) raf = requestAnimationFrame(flush); // coalesce to one layout/frame
  });

  const end = (e: PointerEvent) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    handle.classList.remove("dragging");
    document.body.style.cursor = "";
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (moved) flush(); // commit the final width
    else toggleSidebar(); // it was a click
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

// --- undo / redo -------------------------------------------------------------

async function undo(): Promise<void> {
  if (await historyUndo()) rerenderAfterRestore();
}
async function redo(): Promise<void> {
  if (await historyRedo()) rerenderAfterRestore();
}

// State was swapped wholesale (DB + memory) — rebuild the UI from scratch. The
// current view may point at a burst/arc the restore removed; fall back to Today.
function rerenderAfterRestore(): void {
  closeTodoCard();
  if (state.view.type === "burst" && !state.bursts.some((b) => b.id === state.view.id)) state.view = { type: "today" };
  if (state.view.type === "arc" && !state.arcs.some((a) => a.id === state.view.id)) state.view = { type: "today" };
  renderSidebar(sidebarEl, sidebarHandlers);
  selectView(state.view);
}

// --- views -------------------------------------------------------------------

// Post-mutation refresh: sidebar badges + every burst ring (in refreshSidebarCounts),
// plus the burst header ring when a burst is on screen — so progress sweeps live.
function refreshCounts(): void {
  refreshSidebarCounts(sidebarEl);
  if (state.view.type === "burst" && state.view.id != null) {
    const svg = boardRefs.titleEl.querySelector(".board-icon .pie");
    if (svg) setRingProgress(svg, burstProgress(state.view.id));
  }
}

function selectView(view: View): void {
  closeTodoCard();
  state.view = view;
  activeTag = null;
  setActive(sidebarEl, view);
  renderBoard(boardRefs, view, boardHandlers(), activeTag, true); // spring the content in
  refreshCounts();
}

// Search → reveal a to-do: open its home view, scroll its row into view, highlight it.
function revealTodo(task: Task): void {
  selectView(todoHomeView(task));
  const el = rowEl(task.id);
  if (!el) return;
  clearSelection();
  el.classList.add("selected");
  el.scrollIntoView({ block: "center" });
}

function boardHandlers(): BoardHandlers {
  return {
    view: state.view,
    onToggle: toggleTask,
    onOpen: openTodo,
    onToggleTag: toggleTag,
    onRenameLane: handleHeaderRename,
    onSaveNotes: (type, id, notes) => void (type === "burst" ? setBurstNotes(id, notes) : setArcNotes(id, notes)),
  };
}

// Delete a row: trash it (or, in the Bin, remove for good), then slide it out.
async function deleteRow(task: Task): Promise<void> {
  const el = rowEl(task.id);
  if (state.view.type === "bin") await deleteTask(task.id);
  else await setTaskStatus(task.id, "trashed");
  if (el) collapseAndRemove(el);
  refreshCounts();
}

// Delete every selected row (keyboard ⌫/Delete). Returns whether anything was
// deleted, so the key handler knows to consume the event.
function deleteSelected(): boolean {
  const rows = [...listEl.querySelectorAll<HTMLElement>(".task.selected:not(.expanded)")];
  if (!rows.length) return false;
  for (const el of rows) {
    const task = state.tasks.find((t) => t.id === Number(el.dataset.id));
    if (task) void deleteRow(task);
  }
  return true;
}

function clearSelection(): void {
  listEl.querySelectorAll(".task.selected").forEach((x) => x.classList.remove("selected"));
}

// The sidebar slot under the cursor that to-dos can be dropped onto (or null).
// Logs/Bin are excluded — re-filing onto them is meaningless / too destructive.
function sidebarDropTarget(x: number, y: number): HTMLElement | null {
  const item = document.elementFromPoint(x, y)?.closest<HTMLElement>("#sidebar .nav-item[data-view]");
  if (!item) return null;
  const v = item.dataset.view;
  // Logs/Bin: meaningless/destructive. Future: date-driven, so it's set via the
  // card's date picker, not by dropping a (dateless) to-do here.
  return v === "logs" || v === "bin" || v === "future" ? null : item;
}

// Commit a drag-move: re-file the to-do(s), then slide out the ones that no
// longer belong to the current view and refresh the rest (chips/counts/rings).
async function moveDraggedTo(ids: number[], dest: View): Promise<void> {
  await moveTasks(ids, dest);
  clearSelection();
  const stays = new Set(tasksForView(state.view).map((t) => t.id));
  for (const id of ids) {
    const el = rowEl(id);
    if (!el) continue;
    if (stays.has(id)) {
      const task = state.tasks.find((t) => t.id === id);
      if (task) el.replaceWith(createTaskEl(task, boardHandlers())); // refresh meta (e.g. Today chip)
    } else {
      collapseAndRemove(el);
    }
  }
  refreshCounts();
}

// --- right-click context menus -----------------------------------------------

// The to-do(s) a row's menu acts on: the whole selection if the row is part of a
// multi-selection, otherwise just that row.
function menuTargets(row: HTMLElement): number[] {
  const id = Number(row.dataset.id);
  if (!row.classList.contains("selected")) return [id];
  const sel = [...listEl.querySelectorAll<HTMLElement>(".task.selected")].map((r) => Number(r.dataset.id));
  return sel.length > 1 ? sel : [id];
}

function openTodoMenu(x: number, y: number, row: HTMLElement): void {
  const ids = menuTargets(row);
  const task = state.tasks.find((t) => t.id === Number(row.dataset.id));
  if (!task) return;
  const one = ids.length === 1;
  const allDone = ids.every((id) => state.tasks.find((t) => t.id === id)?.status === "done");
  const anyFiled = ids.some((id) => {
    const t = state.tasks.find((x) => x.id === id);
    return !!t && (t.burst_id !== null || t.arc_id !== null);
  });

  const items: ContextItem[] = [];
  if (one) items.push({ label: "Open", onPick: () => openTodo(task, row as HTMLLIElement) });
  items.push({
    label: allDone ? "Mark not done" : "Complete",
    icon: "check",
    onPick: () => ids.forEach((id) => { const t = state.tasks.find((x) => x.id === id); if (t) void toggleTask(t); }),
  });
  items.push({ label: "Move to…", icon: "future", children: moveItems(ids) });
  items.push("sep");
  items.push({ label: one ? "Duplicate" : `Duplicate ${ids.length}`, onPick: () => void duplicateRows(ids) });
  if (anyFiled) items.push({ label: "Remove from burst/arc", onPick: () => void moveDraggedTo(ids, { type: "raw" }) });
  items.push("sep");
  items.push({
    label: one ? "Delete" : `Delete ${ids.length}`,
    danger: true,
    icon: "bin",
    onPick: () => ids.forEach((id) => { const t = state.tasks.find((x) => x.id === id); if (t) void deleteRow(t); }),
  });
  openContextMenu(x, y, items);
}

// "Move to…" destinations (a submenu): schedule lanes, then every burst + arc.
function moveItems(ids: number[]): ContextItem[] {
  const items: ContextItem[] = [
    { label: "Raws", icon: "raws", onPick: () => void moveDraggedTo(ids, { type: "raw" }) },
    { label: "Today", icon: "today", onPick: () => void moveDraggedTo(ids, { type: "today" }) },
    // No "Future" — a to-do reaches Future by being given a date (in its card).
    { label: "Whenever", icon: "whenever", onPick: () => void moveDraggedTo(ids, { type: "whenever" }) },
    { label: "Down the road", icon: "downtheroad", onPick: () => void moveDraggedTo(ids, { type: "downtheroad" }) },
  ];
  if (state.bursts.length || state.arcs.length) items.push("sep");
  for (const b of state.bursts)
    items.push({ label: b.name || "New Burst", icon: "burst", onPick: () => void moveDraggedTo(ids, { type: "burst", id: b.id }) });
  for (const a of state.arcs)
    items.push({ label: a.name || "New Arc", icon: "arc", onPick: () => void moveDraggedTo(ids, { type: "arc", id: a.id }) });
  return items;
}

// Duplicate each id, dropping the copy's row right after the original (when it
// belongs to the current view).
async function duplicateRows(ids: number[]): Promise<void> {
  for (const id of ids) {
    const copy = await duplicateTask(id);
    if (!copy) continue;
    const after = rowEl(id);
    if (after && tasksForView(state.view).some((t) => t.id === copy.id)) {
      removeEmptyState();
      after.after(createTaskEl(copy, boardHandlers()));
    }
  }
  clearSelection();
  refreshCounts();
}

function openLaneMenu(x: number, y: number, type: "burst" | "arc", id: number): void {
  openContextMenu(
    x,
    y,
    [
      { label: "Rename", icon: "edit", onPick: () => { selectView({ type, id }); focusHeaderTitle(boardRefs); } },
      "sep",
      { label: type === "burst" ? "Delete burst" : "Delete arc", danger: true, icon: "bin", onPick: () => void deleteLane(type, id) },
    ],
    { minWidth: 132, openMs: 130 }, // small + snappy for the tiny burst/arc menu
  );
}

async function deleteLane(type: "burst" | "arc", id: number): Promise<void> {
  if (type === "burst") await deleteBurst(id);
  else await deleteArc(id);
  renderSidebar(sidebarEl, sidebarHandlers); // rebuild the lane list
  if (state.view.type === type && state.view.id === id) selectView({ type: "today" });
  else setActive(sidebarEl, state.view, false);
}

// A new fractional sort_order for a row dropped between two neighbours (one DB
// write, no renumber). null when the list had no other rows to anchor against.
function fracOrder(prev: { sort_order: number } | null, next: { sort_order: number } | null): number | null {
  if (prev && next) return (prev.sort_order + next.sort_order) / 2;
  if (prev) return prev.sort_order + 1;
  if (next) return next.sort_order - 1;
  return null;
}

// Move task `id` between its new neighbours.
function reorderTask(id: number, prevId: number | null, nextId: number | null): void {
  const find = (x: number | null) => (x != null ? state.tasks.find((t) => t.id === x) ?? null : null);
  const order = fracOrder(find(prevId), find(nextId));
  if (order != null) void setTaskOrder(id, order);
}

// Move a burst/arc lane between its new neighbours within its own section.
function reorderLane(type: "burst" | "arc", id: number, prevId: number | null, nextId: number | null): void {
  const lanes = type === "burst" ? state.bursts : state.arcs;
  const find = (x: number | null) => (x != null ? lanes.find((l) => l.id === x) ?? null : null);
  const order = fracOrder(find(prevId), find(nextId));
  if (order != null) void (type === "burst" ? setBurstOrder(id, order) : setArcOrder(id, order));
}

function toggleTag(tag: string): void {
  activeTag = activeTag === tag ? null : tag;
  moveTagIndicator(boardRefs, activeTag, true); // slide the tag pill (spring)
  applyTagFilter(boardRefs, activeTag); // show/hide rows — no rebuild, nothing competes
}

// --- creation ----------------------------------------------------------------

async function newTask(): Promise<void> {
  (document.activeElement as HTMLElement | null)?.blur?.();
  if (state.view.type === "logs" || state.view.type === "bin") {
    selectView({ type: "today" });
  }
  // In Future, a new to-do needs a date to have a home: use the selected row's
  // day ("cursor last position"), else today. It lands under that day; expanding
  // and changing the date moves it (closeTodoRow rebuilds).
  if (state.view.type === "future") {
    const sel = listEl.querySelector<HTMLElement>(".task.selected");
    const selTask = sel ? state.tasks.find((t) => t.id === Number(sel.dataset.id)) : null;
    const dayISO = selTask?.due_date ?? toISODate(new Date());
    const task = await addTask(contextForView(state.view), dayISO);
    renderList(boardRefs, state.view, boardHandlers());
    refreshCounts();
    const row = rowEl(task.id);
    if (row) openTodo(task, row as HTMLLIElement);
    return;
  }
  const task = await addTask(contextForView(state.view));
  removeEmptyState();
  const el = createTaskEl(task, boardHandlers());
  listEl.prepend(el);
  refreshCounts();
  openTodo(task, el);
}

async function newBurst(): Promise<void> {
  const burst = await addBurst();
  renderSidebar(sidebarEl, sidebarHandlers);
  selectView({ type: "burst", id: burst.id });
  focusHeaderTitle(boardRefs); // edit the name on the right
}

async function newArc(): Promise<void> {
  const arc = await addArc();
  renderSidebar(sidebarEl, sidebarHandlers);
  selectView({ type: "arc", id: arc.id });
  focusHeaderTitle(boardRefs);
}

// Edit the name on the right (board header) → reflect on the left (sidebar).
async function handleHeaderRename(type: "burst" | "arc", id: number, name: string): Promise<void> {
  if (type === "burst") await renameBurst(id, name);
  else await renameArc(id, name);
  setLaneName(sidebarEl, type, id, name);
}

// --- todo modal --------------------------------------------------------------

function openTodo(task: Task, li: HTMLLIElement, caret?: number): void {
  openTodoCard(li, task, {
    onClose: () => closeTodoRow(task),
    onNew: () => void newTask(),
    onTrash: (t) => setTaskStatus(t.id, "trashed"),
    onRestore: (t) => setTaskStatus(t.id, "open"),
    onDelete: (t) => deleteTask(t.id),
  }, caret);
}

// Closing a card touches only THAT row — no full list rebuild (that was the
// lag, and on ⌘N it used to nuke the freshly-opened card mid-type).
function closeTodoRow(task: Task): void {
  // Future agenda: a row's day-group depends on its date, which the card may have
  // just changed — rebuild so it lands under the right day, rather than swapping
  // the row in place where it used to sit.
  if (state.view.type === "future") {
    renderList(boardRefs, state.view, boardHandlers());
    refreshCounts();
    return;
  }
  const el = rowEl(task.id);
  if (!el) {
    maybeEmpty();
    return;
  }
  const lane = state.view.type === "burst" || state.view.type === "arc";
  const stillHere = tasksForView(state.view).some((t) => t.id === task.id);
  if (!stillHere) {
    collapseAndRemove(el); // schedule/status changed → animate it out
    if (lane) refreshLogged(); // completed in-card → may now be a logged item
    return;
  }
  // the card replaced the row's innerHTML — swap a fresh collapsed row back in
  el.replaceWith(createTaskEl(task, boardHandlers()));
  // a tag added in the card may be new to a burst/arc filter bar
  if (lane) {
    renderTagBar(boardRefs, state.view, activeTag, boardHandlers());
  }
  applyTagFilter(boardRefs, activeTag);
  refreshCounts();
}

// --- task mutations ----------------------------------------------------------

async function toggleTask(task: Task): Promise<void> {
  const el = rowEl(task.id);
  const lane = state.view.type === "burst" || state.view.type === "arc";
  if (task.status === "open" || task.status === "trashed") {
    await setTaskStatus(task.id, "done");
    if (el) {
      el.classList.add("done");
      // Linger ~1s so you can see it complete (and un-check to undo) before it goes.
      const timer = window.setTimeout(() => {
        lingerTimers.delete(task.id);
        collapseAndRemove(el);
        if (lane) refreshLogged(); // it now lives in the logged section
      }, 1000);
      lingerTimers.set(task.id, timer);
    } else if (lane) {
      refreshLogged();
    }
  } else {
    await setTaskStatus(task.id, "open");
    const pending = lingerTimers.get(task.id);
    if (pending !== undefined) {
      // un-checked within the linger window → cancel the removal, keep the row
      window.clearTimeout(pending);
      lingerTimers.delete(task.id);
      el?.classList.remove("done");
    } else if (lane) {
      // un-checked a logged item → drop it from the log, restore it to the active list
      el?.remove();
      insertActiveRow(task);
      refreshLogged();
    } else if (el) {
      el.classList.remove("done");
      collapseAndRemove(el);
    }
  }
  refreshCounts();
}

// Rebuild the burst/arc logged section in place (preserves its show/hide state).
function refreshLogged(): void {
  renderLogged(boardRefs, state.view, boardHandlers());
  applyTagFilter(boardRefs, activeTag);
}

// Insert a freshly-restored row into the active list at its sorted position
// (before the next active row, or before the logged section if it's last).
function insertActiveRow(task: Task): void {
  removeEmptyState();
  const active = tasksForView(state.view);
  const next = active[active.findIndex((t) => t.id === task.id) + 1];
  const before = next ? rowEl(next.id) : listEl.querySelector<HTMLElement>(".logged-section");
  listEl.insertBefore(createTaskEl(task, boardHandlers()), before ?? null);
}

// --- dom helpers -------------------------------------------------------------

function rowEl(id: number): HTMLElement | null {
  return listEl.querySelector<HTMLElement>(`.task[data-id="${id}"]`);
}

function removeEmptyState(): void {
  listEl.querySelector(".empty")?.remove();
}

function maybeEmpty(): void {
  // Future renders the dense calendar even with zero to-dos — never the hint.
  if (state.view.type === "future") return;
  if (!listEl.querySelector(".task") && !listEl.querySelector(".empty")) {
    listEl.appendChild(emptyState(state.view));
  }
}

function collapseAndRemove(el: HTMLElement): void {
  const h = el.offsetHeight;
  el.style.height = `${h}px`;
  void el.getBoundingClientRect();
  el.classList.add("leaving");
  requestAnimationFrame(() => {
    el.style.height = "0px";
  });
  const finish = () => {
    if (!el.isConnected) return;
    el.remove();
    pruneEmptyGroups(listEl); // drop a Today heading whose last to-do just left
    maybeEmpty();
  };
  el.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 360);
}
