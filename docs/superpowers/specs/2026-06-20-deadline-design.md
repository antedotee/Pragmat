# Per-task deadlines — design

**Date:** 2026-06-20
**Status:** approved (design)

## Goal

A **deadline** is a hard "due by" date, distinct from the scheduled date
(`due_date`, the calendar "when"). It shows a flag + countdown, surfaces overdue
items, and — like the scheduled date — places the to-do in the Future agenda.

## Decisions (settled in brainstorming)

- **Separate, orthogonal field.** `deadline` never changes the lane or the
  scheduled date. A to-do keeps its home (Today / burst / arc / Whenever /
  scheduled-in-Future) and may independently carry a `due_date` and a `deadline`.
- **Future agenda placement** = the *entry day*: `due_date` if scheduled, else
  `deadline`. So scheduled+deadline shows **once on the scheduled day** with the
  deadline flag beside it (no duplicate); deadline-only shows on the deadline day.
- **Overdue (`deadline < today`, still open) surfaces in the Today view** at the
  top, even if the to-do lives in a burst/arc, until completed.
- **Overdue cue** = red flag + countdown on the row, **plus a red dot on the
  Today sidebar item** while any deadline is overdue. Color persists until done.
- Whole-day only (no time). Reuses the existing date popover for picking.

## Data model

### Migration `005_deadline.sql`
```sql
ALTER TABLE tasks ADD COLUMN deadline TEXT;   -- ISO 'YYYY-MM-DD', NULL = none
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
```
Register as `version: 5` in `src-tauri/src/lib.rs`.

### `state.ts`
- `Task.deadline: string | null` (flows through `parseTaskRow`'s `...r`).
- `setTaskDeadline(id, iso | null)` — `record()`-wrapped; sets `deadline` only,
  **never touches `schedule`/`due_date`** (orthogonal).
- `duplicateTask` copies `deadline`; `addTask` leaves it null.
- `tasksForView`:
  - `future`: `open && (due_date != null || deadline != null)`.
  - `today`: `open && schedule === "today"` **plus** open to-dos with an overdue
    deadline (`deadline != null && deadline < todayISO`), deduped by id. Overdue
    ones sort to the top.
- `futureAgenda`: bucket each future to-do by **entry day = `due_date ?? deadline`**.
  Overdue entries (entry `< today`) still fold into today's dense bucket.
- `anyOverdueDeadline(): boolean` — any open to-do with `deadline < todayISO`
  (drives the sidebar dot).

### `date.ts`
- `deadlineLabel(deadline: Date, today: Date): { text: string; overdue: boolean }`
  - `text`: `today` (0), `1 day left` / `N days left` (>0), `1 day ago` /
    `N days ago` (<0). `overdue`: `deadline < today` (strictly before).

## UI

### Card (`todo-card.ts`, `icons.ts`)
- Add a **`flag` icon** to `icons.ts` and a **flag meta-icon** (rightmost in the
  action row, after calendar). Click → `openDatePopover(btn, task.deadline, onDeadline)`.
- `renderDeadline()` (sibling of `renderDue`): a `.chip-deadline` pill in the tag
  row — flag + `Deadline: Sun, 21 Jun` + `· 1 day left`, **red when overdue**, ×
  clears. Clicking the chip re-opens the picker. `onDeadline` springs the chip in
  (same `spring()` + `DISCLOSURE_SPRING` as the date chip, for consistency).

### Collapsed rows (`task-item.ts`)
- When `task.deadline` is set, append a right-aligned `.task-deadline` (flag +
  `deadlineLabel().text`), red when overdue. Shown in Today / burst / arc / the
  Future agenda. Independent of the leading `due_date` badge.

### Future agenda (`board.ts`)
- Already date-driven; with `tasksForView`/`futureAgenda` updated, deadline-only
  to-dos land on their deadline day and scheduled+deadline on the scheduled day,
  each row carrying the deadline indicator via `createTaskEl`.

### Today view (`board.ts`)
- `tasksForView("today")` now includes surfaced overdue to-dos. Rendering reuses
  the existing grouped-by-lane list; overdue items (not natively today) appear
  first with the red flag. No new section header needed.

### Sidebar (`sidebar.ts`)
- The `Today` nav item gets a red dot when `anyOverdueDeadline()` is true.
  `refreshSidebarCounts` toggles it after mutations (complete / set / clear).

### Styles (`app.css`)
- `.chip-deadline` (flag accent; `.is-overdue` → red), `.task-deadline` (row
  flag + countdown; `.is-overdue` → red), `.nav-item[data-view="today"] .nav-overdue`
  (red dot). Colors via existing vars; overdue uses a sharp red.

## Out of scope (YAGNI)

- Time-of-day, reminders/notifications, recurring deadlines.
- Auto-rescheduling on overdue. A separate "Overdue" view.

## Test / verification

- `date.ts` `deadlineLabel` self-check (assert table: today / ±1 / ±N).
- `futureAgenda` smoke test: deadline-only → deadline day; scheduled+deadline →
  scheduled day only; overdue deadline-only → folds into today bucket.
- Manual: set a deadline; confirm chip + countdown + red-when-overdue; row flag in
  Today/burst/Future; overdue surfaces in Today; Today sidebar dot; clearing
  removes all cues; completing removes it from surfacing + clears the dot.

## Files touched

**New:** `src-tauri/migrations/005_deadline.sql`.
**Edited:** `src-tauri/src/lib.rs`, `src/state.ts`, `src/date.ts`, `src/icons.ts`,
`src/ui/todo-card.ts`, `src/ui/task-item.ts`, `src/ui/board.ts`, `src/ui/sidebar.ts`,
`src/styles/app.css`.
