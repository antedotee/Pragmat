import { springPath, springDurationMs, TAB_SPRING } from "../spring";

// Pointer-drag for the to-do list (and, in a simpler mode, the sidebar lanes).
// Two outcomes from one gesture, Finder-style:
//   • drop within the list  → reorder (the dragged row follows the cursor; the
//     others slide out of its way via FLIP).
//   • drop on a sidebar slot → MOVE the dragged to-do(s) there (carry the row to
//     the cursor in 2D, highlight the target, commit on release).
// All motion is spring-driven via WAAPI (see anim.ts) — it tracks the pointer and
// settles with physics that a CSS transition can't express.

export interface ReorderHandlers {
  canDrag: () => boolean; // false in views where order is meaningless (Logs/Bin)
  // Commit a reorder: `id` now sits between `prevId` and `nextId` (null = list edge).
  onDrop: (id: number, prevId: number | null, nextId: number | null) => void;
  rowSelector?: string; // draggable row class (default ".task")
  canStart?: (target: HTMLElement, row: HTMLElement) => boolean; // gate a press (default: skip checkbox / expanded card)
  clampToList?: boolean; // keep the dragged row inside the list's bounds (bursts/arcs stay in their section)
  // --- cross-container move (to-do list only; omit for plain reorder lists) ---
  selectedIds?: () => number[]; // current multi-selection (drag the whole set if the grabbed row is in it)
  dropTargetAt?: (x: number, y: number) => HTMLElement | null; // sidebar slot under the cursor, or null
  onMoveTo?: (ids: number[], target: HTMLElement) => void; // commit a move onto that slot
}

const THRESHOLD = 10; // px of movement before a press becomes a drag (taps/clicks survive)

const idOf = (el: Element | null): number | null =>
  el instanceof HTMLElement && el.dataset.id ? Number(el.dataset.id) : null;

// Current translate of a row, whether written as translate(x,y) or translateY(y).
const translateOf = (el: HTMLElement): { x: number; y: number } => {
  const t = el.style.transform;
  const xy = t.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  if (xy) return { x: parseFloat(xy[1]), y: parseFloat(xy[2]) };
  const y = t.match(/translateY\(([-\d.]+)px\)/);
  return { x: 0, y: y ? parseFloat(y[1]) : 0 };
};

export function enableDragReorder(list: HTMLElement, h: ReorderHandlers): void {
  let el: HTMLElement | null = null; // candidate, then dragged, row
  let pid = -1;
  let startX = 0;
  let startY = 0;
  let grabOffset = 0; // pointer Y minus the row's top, captured at grab
  let naturalTop = 0; // the dragged row's untransformed viewport top
  let dragging = false;
  let droppedAt = 0; // timestamp of the last drop, to swallow the trailing click
  let target: HTMLElement | null = null; // highlighted sidebar drop slot (carry mode)
  let dragIds: number[] = []; // the to-do(s) this gesture moves
  let dragEls: HTMLElement[] = []; // their row elements (all lift + move together)
  let badge: HTMLElement | null = null; // "N" count chip on the carried row
  const anims = new WeakMap<HTMLElement, Animation>();
  const follow2d = !!h.dropTargetAt; // to-do list: row follows the cursor in 2D; lanes: Y only
  const SETTLE = springPath(0, 1, TAB_SPRING); // normalized spring used to settle a row back to its slot
  const SETTLE_MS = springDurationMs(SETTLE);
  const preventSelect = (e: Event) => e.preventDefault(); // no text selection mid-press
  const ROW = h.rowSelector ?? ".task";
  const canStart =
    h.canStart ??
    ((t: HTMLElement, r: HTMLElement) =>
      !t.closest(".checkbox") && !r.classList.contains("expanded") && !r.closest(".logged-section"));

  const siblings = (): HTMLElement[] =>
    [...list.querySelectorAll<HTMLElement>(ROW)].filter(
      (r) => r !== el && !r.classList.contains("leaving") && !r.closest(".logged-section"),
    );

  // Nearest draggable row in a direction, skipping non-ROW nodes (e.g. Today's
  // burst/arc group headings) so a drop next to a heading anchors to the real to-do.
  const adjacentRow = (from: Element, dir: "previousElementSibling" | "nextElementSibling"): HTMLElement | null => {
    let s = from[dir];
    while (s && !(s as HTMLElement).matches(ROW)) s = s[dir];
    return (s as HTMLElement) ?? null;
  };

  // Spring a row from translate(fromX, fromY) back to its natural spot (0, 0).
  function springTo0(row: HTMLElement, fromX: number, fromY: number): void {
    anims.get(row)?.cancel();
    const a = row.animate(
      SETTLE.map((s) => ({ transform: `translate(${(fromX * (1 - s)).toFixed(2)}px, ${(fromY * (1 - s)).toFixed(2)}px)` })),
      { duration: SETTLE_MS, easing: "linear" },
    );
    anims.set(row, a);
  }

  function setNaturalTop(): void {
    if (!el) return;
    const t = el.style.transform;
    el.style.transform = "";
    naturalTop = el.getBoundingClientRect().top;
    el.style.transform = t;
  }

  function setTarget(next: HTMLElement | null): void {
    if (next === target) return;
    target?.classList.remove("drop-target");
    next?.classList.add("drop-target");
    target = next;
  }

  function onMove(clientX: number, clientY: number): void {
    if (!el) return;
    const slot = h.dropTargetAt?.(clientX, clientY) ?? null;
    setTarget(slot);

    // Multi-selection: the whole group slides with the cursor (keeping its
    // formation), so every selected row is visibly moving. No in-list reorder.
    if (dragEls.length > 1) {
      const dx = clientX - startX;
      const dy = clientY - startY;
      for (const r of dragEls) r.style.transform = `translate(${dx}px, ${dy}px)`;
      return;
    }

    // The row follows the cursor: X tracks it directly (the column's left is
    // fixed, so this survives DOM reorders), Y keeps the grab point under the
    // cursor relative to the row's current slot.
    const tx = follow2d ? clientX - startX : 0;
    let top = clientY - grabOffset;
    if (h.clampToList) {
      const lr = list.getBoundingClientRect();
      top = Math.max(lr.top, Math.min(lr.bottom - el.offsetHeight, top));
    }
    el.style.transform = `translate(${tx}px, ${top - naturalTop}px)`;
    if (slot) return; // carrying to a sidebar slot — don't reorder

    const dragMid = top + el.offsetHeight / 2;
    const sibs = siblings();
    let before: HTMLElement | null = null;
    for (const r of sibs) {
      const rect = r.getBoundingClientRect();
      if (dragMid < rect.top + rect.height / 2) {
        before = r;
        break;
      }
    }
    if (before === el.nextElementSibling) return; // already in place

    const first = new Map(sibs.map((r) => [r, r.getBoundingClientRect().top]));
    if (before) list.insertBefore(el, before);
    else list.appendChild(el);
    setNaturalTop();
    el.style.transform = `translate(${tx}px, ${top - naturalTop}px)`;
    for (const r of sibs) {
      const delta = first.get(r)! - r.getBoundingClientRect().top;
      if (delta) springTo0(r, 0, delta);
    }
  }

  function end(): void {
    document.removeEventListener("selectstart", preventSelect);
    badge?.remove();
    badge = null;
    if (el && dragging && target && h.onMoveTo) {
      for (const r of dragEls) {
        r.style.transform = ""; // snap home; moveDraggedTo will slide them out / refresh them
        r.classList.remove("dragging");
      }
      h.onMoveTo(dragIds, target);
    } else if (el && dragging && dragEls.length > 1) {
      for (const r of dragEls) {
        const c = translateOf(r);
        r.style.transform = "";
        springTo0(r, c.x, c.y); // group settles back; no reorder for multi-drag
        r.classList.remove("dragging");
      }
    } else if (el && dragging) {
      const row = el;
      const cur = translateOf(row);
      row.style.transform = "";
      springTo0(row, cur.x, cur.y); // fly back into the slot (both axes)
      row.classList.remove("dragging");
      droppedAt = performance.now();
      h.onDrop(
        Number(row.dataset.id),
        idOf(adjacentRow(row, "previousElementSibling")),
        idOf(adjacentRow(row, "nextElementSibling")),
      );
    }
    setTarget(null);
    if (pid !== -1 && list.hasPointerCapture?.(pid)) list.releasePointerCapture(pid);
    el = null;
    dragging = false;
    dragEls = [];
    pid = -1;
  }

  list.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !h.canDrag()) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>(ROW);
    if (!row || !canStart(e.target as HTMLElement, row)) return;
    el = row;
    pid = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    document.addEventListener("selectstart", preventSelect);
  });

  list.addEventListener("pointermove", (e) => {
    if (!el || e.pointerId !== pid) return;
    if (!dragging) {
      if (Math.abs(e.clientX - startX) < THRESHOLD && Math.abs(e.clientY - startY) < THRESHOLD) return;
      dragging = true;
      window.getSelection()?.removeAllRanges(); // drop any selection started pre-threshold
      // drag the whole multi-selection if the grabbed row is part of it, else just it
      const sel = el.classList.contains("selected") && h.selectedIds ? h.selectedIds() : [];
      dragIds = sel.length ? sel : [Number(el.dataset.id)];
      // the row elements to lift + move together (grabbed row always included)
      dragEls = dragIds
        .map((id) => list.querySelector<HTMLElement>(`${ROW}[data-id="${id}"]`))
        .filter((r): r is HTMLElement => r !== null);
      if (!dragEls.includes(el)) dragEls.push(el);
      grabOffset = startY - el.getBoundingClientRect().top;
      for (const r of dragEls) r.classList.add("dragging");
      if (dragIds.length > 1) {
        badge = document.createElement("span");
        badge.className = "drag-badge";
        badge.textContent = String(dragIds.length);
        el.appendChild(badge);
      }
      setNaturalTop();
      list.setPointerCapture?.(pid);
    }
    onMove(e.clientX, e.clientY);
  });

  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);

  // A click sometimes follows a drag; swallow it so the drop doesn't also select.
  list.addEventListener(
    "click",
    (e) => {
      if (performance.now() - droppedAt < 250) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
}
