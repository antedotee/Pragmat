# Checkpoint polish — design

**Date:** 2026-06-20
**Status:** approved, ready for plan

## Context

Checkpoints (a per-todo checklist) already exist in the codebase:

- Data model + CRUD in [`src/state.ts`](../../../src/state.ts) (`Checkpoint`, `getCheckpoints`,
  `addCheckpoint`, `toggleCheckpoint`, `setCheckpointTitle`, `deleteCheckpoint`,
  `checkpointProgress`). Stored in a `checkpoints` table keyed by `task_id`, ordered
  by `sort_order`, loaded on demand (not held in global state).
- UI in [`src/ui/todo-card.ts`](../../../src/ui/todo-card.ts): the `cpList` block renders a
  `.cp` row per checkpoint with a round `.cp-toggle`, a `.cp-title` input, and a `.cp-del`
  button. Enter in the input creates the next checkpoint; a "checklist" meta-icon adds one.
- Styling in [`src/styles/app.css`](../../../src/styles/app.css): `.cp-toggle` is already a
  round copy of `.checkbox` (same scale+blur reveal on the check icon).

Because checkpoints live under `task_id` and never become tasks, they are already
absent from Logs/Bin and have no effect on todo completion.

### Already satisfied by existing code (no work — verify only)

- **#1** add-checkpoint icon present (card meta row).
- **#4** ticking all checkpoints does not complete the todo (independent).
- **#5 / #7** toggle is round and animates exactly like the checkbox. Kept as a CSS
  transition per the CLAUDE.md rule (simple state change → CSS, not `spring()`).
- **#8** checkpoints persist, tied to the todo, excluded from Logs/Bin.

## Goals (the actual gaps)

1. **Row glyph (#2):** when a todo has ≥1 checkpoint, show a faint checklist glyph at the
   right end of the *collapsed* row. Presence only — no count.
2. **Reorder (#3):** drag checkpoints up/down within the open card to reorder them.
3. **Smooth add (#6):** a newly added checkpoint (Enter or the meta icon) springs in
   rather than appearing instantly.

## Design

### 1. Collapsed-row glyph

The row renderer must answer "has ≥1 checkpoint?" synchronously, but checkpoints are not
in global state. Add a lightweight presence map instead of per-row async queries.

- `src/state.ts`
  - Add `checkpointCounts: Map<number, number>` to `state`.
  - In `loadAll`: `SELECT task_id, COUNT(*) c FROM checkpoints GROUP BY task_id`, populate
    the map.
  - `addCheckpoint` increments the entry; `deleteCheckpoint` decrements (and deletes the
    key at 0). Export `hasCheckpoints(id: number): boolean` (`(count ?? 0) > 0`).
- `src/ui/task-item.ts`
  - After building the row, if `hasCheckpoints(task.id)`, append a
    `<span class="task-cp-flag">` containing `icon("checklist", 13)`.
- `src/styles/app.css`
  - `.task-cp-flag { margin-left: auto; color: var(--text-faint); display: grid;
    place-items: center; }` — faint, pushed to the right edge, vertically centered.

The glyph refreshes naturally: the board re-renders the row when the card closes
(`onClose`), by which point the count map reflects adds/deletes made while open.

Counts include untitled/blank checkpoints (an `addCheckpoint` row with an empty title still
counts). Acceptable — matches Things; pruning blanks is out of scope.

### 2. Drag-to-reorder

Reuse [`enableDragReorder`](../../../src/ui/drag-reorder.ts) (FLIP + spring settle already
built) rather than writing a second drag engine.

- `src/state.ts`: add `setCheckpointOrder(id: number, sortOrder: number)` →
  `UPDATE checkpoints SET sort_order = ? WHERE id = ?`.
- `src/ui/todo-card.ts`:
  - Set `row.dataset.id = String(cp.id)` on each `.cp` row.
  - After building `cpList`, call `enableDragReorder(cpList, …)` with:
    - `rowSelector: ".cp"`, `clampToList: true`, `canDrag: () => true`.
    - `canStart: (t, _r) => !t.closest(".cp-title") && !t.closest(".cp-del")` — typing and
      delete-clicks are preserved; the drag grabs the toggle/row body. (The toggle's own
      click survives the 10px drag threshold, same as the task checkbox.)
    - `onDrop(id, prevId, nextId)`: compute a `sort_order` and persist via
      `setCheckpointOrder`. Both neighbours present → midpoint `(prevSort + nextSort) / 2`
      (fractional, the same approach `duplicateTask` uses for `tasks.sort_order`). Top edge
      (no `prevId`) → `nextSort - 1`. Bottom edge (no `nextId`) → `prevSort + 1`. SQLite
      stores the fractional value as REAL regardless of column affinity, so ordering stays
      stable.
  - Look up neighbour `sort_order` from the in-memory checkpoint list the card already holds
    (the `cps` loaded in `getCheckpoints(...).then`), keyed by `data-id`.

Done items keep their position — ordering is fully manual, never auto-sorted.

### 3. Smooth reveal on add

- `src/ui/anim.ts`: add `revealRow(el: HTMLElement)` — measure target height, spring
  `height` 0→target with an opacity/blur fade-in (`spring()` + the existing reveal feel),
  then clear the inline `height`/`overflow` so the row reflows naturally. Returns the
  `Animation`.
- `src/ui/todo-card.ts`: in `newCheckpoint`, append the row, call `revealRow(row)`, then
  focus `.cp-title`. Used for both Enter and the meta-icon add.
- Delete symmetry: `.cp-del` springs the row's height to 0 with a fade, then removes it —
  so removal isn't a hard cut next to the smooth add.

## Out of scope / skipped

- Live `done/total` count on the row glyph (user chose presence-only).
- Pruning blank/untitled checkpoints on card close.
- Any change to the toggle animation, Logs/Bin behavior, or completion semantics
  (already correct).

## Testing

One runnable assert-based check on the only non-trivial logic: the reorder midpoint
computation (`prev`/`next`/edge → new `sort_order` lands strictly between neighbours and
preserves order). Everything else is visual and verified by running the app.
