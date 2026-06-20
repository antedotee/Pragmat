import { type Task, type View, hasCheckpoints } from "../state";
import { icon } from "../icons";

export interface RowHandlers {
  view: View;
  onToggle: (t: Task) => void;
  onOpen: (t: Task, li: HTMLLIElement, caret?: number) => void;
}

// Char index into a single-text-node element at viewport point (x,y) — null if the
// point isn't over its text. Lets a double-click drop the caret where you pointed.
// ponytail: WebKit-only (Tauri/WKWebView). Add caretPositionFromPoint if ever shipped off WebKit.
function caretOffsetAt(el: HTMLElement, x: number, y: number): number | null {
  const r = document.caretRangeFromPoint?.(x, y);
  return r && el.contains(r.startContainer) ? r.startOffset : null;
}

// Multi-select, macOS-style. The selection lives in the DOM (`.selected` class);
// `anchorId` is the pivot for Shift-range and persists across re-renders by id.
let anchorId: number | null = null;

const selectableRows = (list: HTMLElement): HTMLElement[] =>
  [...list.querySelectorAll<HTMLElement>(".task")].filter(
    (r) => !r.classList.contains("leaving") && !r.closest(".logged-section"),
  );

// Plain click: select exactly this row (clear the others), pivot here.
function selectRow(li: HTMLElement): void {
  li.parentElement?.querySelectorAll(".task.selected").forEach((x) => x.classList.remove("selected"));
  li.classList.add("selected");
}

// Shift-click: select the contiguous range from the anchor to this row.
function selectRange(li: HTMLElement, anchor: number): void {
  const list = li.parentElement;
  if (!list) return;
  const rows = selectableRows(list);
  const a = rows.findIndex((r) => Number(r.dataset.id) === anchor);
  const b = rows.indexOf(li);
  if (a === -1 || b === -1) return selectRow(li);
  const [lo, hi] = a < b ? [a, b] : [b, a];
  rows.forEach((r, i) => r.classList.toggle("selected", i >= lo && i <= hi));
}

export function createTaskEl(task: Task, h: RowHandlers): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "task" + (task.status === "done" ? " done" : "");
  li.dataset.id = String(task.id);

  const check = document.createElement("button");
  check.type = "button";
  check.className = "checkbox";
  check.setAttribute("aria-label", task.status === "done" ? "Mark as not done" : "Mark as done");
  check.innerHTML = icon("check", 12);
  check.addEventListener("click", (e) => {
    e.stopPropagation();
    h.onToggle(task);
  });

  const main = document.createElement("div");
  main.className = "task-main";

  const title = document.createElement("div");
  title.className = "task-title";
  if (task.title) {
    title.textContent = task.title;
  } else {
    title.classList.add("placeholder");
    title.textContent = "New to-do";
  }
  main.append(title);

  // meta chips: Today (in burst/arc/future views) + tags
  const showToday = task.schedule === "today" && h.view.type !== "today";
  if (showToday || task.tags.length) {
    const meta = document.createElement("div");
    meta.className = "task-meta";
    if (showToday) {
      const chip = document.createElement("span");
      chip.className = "chip chip-today small";
      chip.innerHTML = `${icon("today", 11)}Today`; // accent-colored sun cue
      meta.append(chip);
    }
    for (const tag of task.tags) {
      const chip = document.createElement("span");
      chip.className = "chip chip-tag small";
      chip.textContent = tag;
      meta.append(chip);
    }
    main.append(meta);
  }

  // A plain click on the title text opens the card with the caret where you
  // pointed (parity with checkpoint inputs — click and type). ⌘ toggles / Shift
  // ranges still multi-select; a plain click OFF the title selects the row.
  // (Delete the selected row(s) with the keyboard — see keyboard.ts.)
  const ignore = (e: Event) => {
    const t = e.target as HTMLElement;
    return t.closest(".checkbox") !== null || li.classList.contains("expanded");
  };
  li.addEventListener("click", (e) => {
    if (ignore(e)) return;
    if (e.shiftKey && anchorId !== null) {
      selectRange(li, anchorId); // extend from the pivot; pivot stays put
    } else if (e.metaKey || e.ctrlKey) {
      li.classList.toggle("selected");
      anchorId = task.id;
    } else if ((e.target as HTMLElement).closest(".task-title")) {
      const caret = task.title ? caretOffsetAt(title, e.clientX, e.clientY) : null;
      h.onOpen(task, li, caret ?? undefined); // click-to-edit at the caret
    } else {
      selectRow(li);
      anchorId = task.id;
    }
  });
  li.addEventListener("dblclick", (e) => {
    if (ignore(e)) return;
    // drop the caret where you double-clicked (only for a real title — an empty
    // row shows placeholder text we don't want to map an offset into)
    const caret = task.title ? caretOffsetAt(title, e.clientX, e.clientY) : null;
    h.onOpen(task, li, caret ?? undefined);
  });

  li.append(check, main);

  // Faint glyph at the right edge signalling this to-do carries checkpoints.
  if (hasCheckpoints(task.id)) {
    const flag = document.createElement("span");
    flag.className = "task-cp-flag";
    flag.innerHTML = icon("checklist", 13);
    li.append(flag);
  }
  return li;
}
