# Future agenda + per-task due dates — design

**Date:** 2026-06-20
**Status:** approved (design), pending spec review

## Goal

Give to-dos an optional calendar date. A dated to-do appears in a new
scrollable **Future agenda** grouped by day, while *also* staying in its home
lane (Today / burst / arc / Whenever / Down-the-road). Dates are set from the
expanded card via a date popover where you can **type** the date (natural-ish
language), pick a quick option, or click a mini month grid.

## Decisions (settled in brainstorming)

- **Parser:** lightweight, built-in, **no new dependency**. Covers `today`,
  `tomorrow`, weekday names (`mon`, `next fri`), `in N days/weeks/months`,
  `8 jul` / `jul 8`, ISO `YYYY-MM-DD`, and a bare day number (`28`).
- **Dates are independent of lane** (orthogonal to `schedule`/`burst_id`/`arc_id`).
  Setting a date never moves a to-do between lanes; it just makes the to-do
  appear in the Future agenda *in addition* to its home lane. Clearing the date
  removes it from the agenda only.
- **Quick picks:** Today, Tomorrow, Clear date.
- **Popover:** type field + live preview + quick picks + clickable mini month grid.
- **Whole-day only.** No time-of-day, no reminders/notifications (out of scope —
  Pragmat has no such concept today).
- **calendarcn** (Next.js + React + shadcn) cannot be imported into this
  vanilla-TS Tauri app. We reimplement its Notion-Calendar mini-grid *look* in
  ~30 lines of vanilla TS. The repo stays as a visual reference only.

## Data model

### Migration
`src-tauri/migrations/004_due_date.sql`:

```sql
ALTER TABLE tasks ADD COLUMN due_date TEXT;   -- ISO 'YYYY-MM-DD', NULL = no date
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
```

Register as `Migration { version: 4, ... include_str!("../migrations/004_due_date.sql") }`
in `src-tauri/src/lib.rs`.

### State (`src/state.ts`)
- `Task` gains `due_date: string | null`. `TaskRow` inherits it via
  `Omit<Task, "tags">`; `parseTaskRow` already spreads `...r`, so no parse change.
- New mutation:
  ```ts
  export async function setTaskDueDate(id: number, due: string | null): Promise<void>
  ```
  `record()`-wrapped (undoable), `UPDATE tasks SET due_date = ?`, mirror into
  `state.tasks`.
- `duplicateTask` copies `due_date` (add to INSERT column list + the returned object).
- `addTask` leaves `due_date` null (column default).

## `src/date.ts` (new, pure — no DOM)

Pure date helpers, shared by the popover, the agenda, and the row badge. Ships a
`demo()` `assert`-based self-check (ponytail) covering the parser table.

```ts
parseDate(input: string, today?: Date): Date | null
toISODate(d: Date): string          // local YYYY-MM-DD (NOT UTC — avoids off-by-one)
fromISODate(s: string): Date        // local midnight
formatChip(d: Date): string         // "Wed, 8 Jul"   (card chip)
formatBadge(d: Date): string        // "8 Jul"        (collapsed-row badge)
formatDayHeader(d: Date): { num: string; weekday: string }  // "30" / "Tuesday"
```

### Parser rules (input lower-cased, trimmed; `today` defaults to `new Date()`)
| Input | Result |
|-------|--------|
| `""` / unrecognized | `null` |
| `today` | today |
| `tomorrow` / `tmr` / `tom` | today + 1 |
| `yesterday` | today − 1 |
| `mon`..`sun`, full names, optional `next ` prefix | next strictly-future occurrence of that weekday |
| `in N day(s)` | today + N |
| `in N week(s)` | today + 7N |
| `in N month(s)` | today + N months |
| `8 jul` / `jul 8` / `july 8` / `8 july` | that month+day; if already past this year → next year |
| `YYYY-MM-DD` | that exact date |
| bare `1`..`31` | that day this month; if already past → next month |

All results are normalized to local midnight.

## `src/ui/date-popover.ts` (new)

Mirrors `new-popover.ts` conventions: single active popover (`activeClose`),
closes on Esc / outside mousedown, opens with `DISCLOSURE_SPRING` via `spring()`.

`openDatePopover(anchor: HTMLElement, current: string | null, onPick: (iso: string | null) => void)`

Layout (top → bottom):
1. **Type field** (autofocus, placeholder `Type a date…`). On input, run
   `parseDate`; show a live **preview** line (`→ Wed 8 Jul`) or nothing if
   unparseable. `Enter` commits the parsed date (no-op if unparseable). `Esc` closes.
2. **Quick picks** row: `Today`, `Tomorrow`, `Clear date`. Clear calls
   `onPick(null)`.
3. **Mini month grid:** weekday header + day cells for `displayedMonth`, ‹ ›
   to change month. Today marked; `current` date highlighted if in view.
   Clicking a day calls `onPick(toISODate(day))` and closes.

`onPick` always closes the popover. The caller persists + updates the chip.

## Card integration (`src/ui/todo-card.ts`, `src/icons.ts`)

- Add Geist `calendar` icon to `icons.ts` (`IconName` union + `PATHS`).
- Add a **calendar meta-icon** to the card action row (`actions`, beside
  tag/checklist/trash). Click → `openDatePopover(btn, task.due_date, onPick)`.
- `renderDue()` (sibling of `renderWhen()`): when `task.due_date` is set, render
  a `.chip.chip-due` in the tags row — red calendar icon + `formatChip(date)` +
  `×`. Clicking the chip body re-opens the popover; `×` clears.
- `onPick(iso)`:
  ```ts
  await setTaskDueDate(task.id, iso);
  task.due_date = iso;
  renderDue();   // chip springs in / updates / removes
  ```
  Chip enter animation: `spring()` scale+opacity reveal (emil-kow easing,
  <300ms), consistent with the tag/when chips.

## Future agenda (`src/state.ts`, `src/ui/board.ts`, `src/ui/task-item.ts`)

### Grouping (`src/state.ts`)
```ts
const AGENDA_MONTHS = 12;   // ponytail: fixed horizon; make it a setting if users ask

interface AgendaModel {
  noDate: Task[];                              // schedule==="future" && due_date==null
  dense:  { date: Date; tasks: Task[] }[];     // today → end of current month, EVERY day
  tail:   { month: Date; days: { date: Date; tasks: Task[] }[] }[]; // next month → +12mo
}
export function futureAgenda(today?: Date): AgendaModel
```
- Dated set = **all open tasks with `due_date != null`** (any schedule/lane),
  bucketed by ISO date.
- `dense`: for each day `d` from today through end of current month,
  `tasks = byDate[iso(d)] ?? []`. **Overdue** (any open task with
  `due_date < today`) folds into today's bucket.
- `tail`: for each month from next month through +`AGENDA_MONTHS`, include only
  days that have tasks; skip months with none.
- `noDate`: open `schedule==="future"` tasks with `due_date == null`.
- Within a day, sort by `sort_order, id` (existing convention).

`tasksForView("future")` changes from `schedule==="future"` to the flat union
**open tasks where `due_date != null` OR `schedule==="future"`** (sorted by
`due_date` then `sort_order`) — so the sidebar count matches what the agenda
shows. The Future view *renders* via `futureAgenda()` (below), not the flat list.

### Rendering (`src/ui/board.ts`)
`renderList` short-circuits for Future **before** the generic empty-state check
(`if (view.type === "future") { renderAgenda(...); return; }`) — the dense
calendar always renders, even with zero tasks, so "show all the dates of the
current month even if empty" holds. `renderAgenda`:
- **No date** header + rows (if `noDate` non-empty).
- **Dense:** per day, an `.agenda-day` header (`formatDayHeader` → big number +
  weekday) then rows. Empty days render the header faint, no rows.
- **Tail:** per month, an `.agenda-month` header (`August`) then its days' rows.
- Rows reuse `createTaskEl`; entrance uses the existing stagger/`spring` reveal.

### Row badge (`src/ui/task-item.ts`)
`createTaskEl(task, h, opts?: { hideDate?: boolean })`:
- When `task.due_date` is set and not `hideDate`, prepend a `.task-date-badge`
  (`formatBadge` → `8 Jul`) before the title. Matches screenshots 4 & 5.
- Dense agenda days pass `hideDate: true` (the day header already shows it). No
  date suppression elsewhere (Today / burst / arc / tail rows all show the badge).

### Styling (`src/styles/app.css`)
New classes: `.chip-due` (red calendar accent), `.agenda-day` (big number +
weekday, per screenshot 5), `.agenda-month` (month section header),
`.agenda-empty` (faint empty-day spacing), `.task-date-badge` (gray pill),
`.date-popover` + grid cells. Colors via existing CSS variables.

## Complete / log behavior (falls out for free)

- Agenda includes only `status === "open"`, so ticking a row removes it on the
  next render (existing optimistic toggle path in `app.ts`).
- Completed tasks land in **Logs**, already sorted `completed_at` desc
  (`tasksForView` `logs` branch).
- **No logged section in Future** — `renderLogged` only renders for burst/arc,
  so nothing changes there.

## Out of scope (YAGNI)

- Time-of-day, reminders, notifications, recurrence.
- Auto-rolling overdue dates or auto-moving dated tasks between lanes when their
  day arrives (no scheduler).
- Importing/compiling calendarcn. Drag-to-reschedule in the agenda.

## Files touched

**New:** `src/date.ts`, `src/ui/date-popover.ts`,
`src-tauri/migrations/004_due_date.sql`.
**Edited:** `src-tauri/src/lib.rs`, `src/state.ts`, `src/ui/todo-card.ts`,
`src/ui/board.ts`, `src/ui/task-item.ts`, `src/icons.ts`, `src/styles/app.css`.

## Test / verification

- `date.ts` `demo()` self-check asserts the full parser table + `toISODate`
  locality (no UTC drift) + month/day rollover.
- Manual: set a date via type / quick-pick / grid; confirm chip + agenda
  placement; tick in agenda → gone, appears in Logs top; clear date → leaves
  agenda, stays in home lane.
