import { run, all } from "./db";
import { record } from "./history";
import { atMidnight, addDays, startOfMonth, endOfMonth, toISODate, fromISODate } from "./date";

export type ViewType = "raw" | "today" | "future" | "whenever" | "downtheroad" | "logs" | "bin" | "burst" | "arc";
export interface View {
  type: ViewType;
  id?: number;
}

export type TaskStatus = "open" | "done" | "trashed";
export type Schedule = "raw" | "today" | "future" | "whenever" | "downtheroad";

export interface Task {
  id: number;
  title: string;
  notes: string;
  status: TaskStatus;
  schedule: Schedule;
  burst_id: number | null;
  arc_id: number | null;
  sort_order: number;
  created_at: string;
  completed_at: string | null;
  due_date: string | null; // ISO 'YYYY-MM-DD' or null. Independent of schedule/lane.
  deadline: string | null; // ISO 'YYYY-MM-DD' or null. Hard "due by"; orthogonal to everything.
  tags: string[];
}

export interface Checkpoint {
  id: number;
  task_id: number;
  title: string;
  done: boolean;
  sort_order: number;
}

interface TaskRow extends Omit<Task, "tags"> {
  tags: string;
}

export interface Burst {
  id: number;
  name: string;
  notes: string;
  status: string;
  sort_order: number;
  created_at: string;
}

export interface Arc {
  id: number;
  name: string;
  notes: string;
  sort_order: number;
  created_at: string;
}

export const state = {
  view: { type: "today" } as View,
  tasks: [] as Task[],
  bursts: [] as Burst[],
  arcs: [] as Arc[],
  // task_id → number of non-empty checkpoints. Drives the collapsed-row glyph
  // without per-row queries; recomputed when a card closes (blank checkpoints
  // must not show the glyph). See setCheckpointCount.
  checkpointCounts: new Map<number, number>(),
};

export async function loadAll(): Promise<void> {
  state.bursts = await all<Burst>(
    "SELECT * FROM bursts WHERE status != ? ORDER BY sort_order, id",
    ["archived"],
  );
  state.arcs = await all<Arc>("SELECT * FROM arcs ORDER BY sort_order, id");
  const rows = await all<TaskRow>("SELECT * FROM tasks");
  state.tasks = rows.map(parseTaskRow);
  const cpCounts = await all<{ task_id: number; c: number }>(
    "SELECT task_id, COUNT(*) c FROM checkpoints WHERE trim(title) <> '' GROUP BY task_id",
  );
  state.checkpointCounts = new Map(cpCounts.map((r) => [r.task_id, r.c]));
}

export function hasCheckpoints(taskId: number): boolean {
  return (state.checkpointCounts.get(taskId) ?? 0) > 0;
}

function parseTaskRow(r: TaskRow): Task {
  let tags: string[] = [];
  try {
    tags = JSON.parse(r.tags || "[]");
  } catch {
    tags = [];
  }
  return { ...r, tags };
}

export function tasksForView(v: View): Task[] {
  let list: Task[];
  switch (v.type) {
    case "raw":
      // The inbox: unscheduled AND unfiled. A raw to-do filed in a burst/arc
      // lives there, not here; a dated one is "future" (schedule flips off raw).
      list = state.tasks.filter(
        (t) => t.status === "open" && t.schedule === "raw" && t.burst_id == null && t.arc_id == null,
      );
      break;
    case "today": {
      // Today = the today lane PLUS any open to-do whose deadline is overdue
      // (surfaced from wherever it lives, until completed). Overdue sorts first.
      const tISO = toISODate(atMidnight(new Date()));
      const od = (t: Task) => t.deadline != null && t.deadline < tISO;
      const overdue = state.tasks
        .filter((t) => t.status === "open" && od(t))
        .sort((a, b) => (a.deadline! < b.deadline! ? -1 : a.deadline! > b.deadline! ? 1 : a.sort_order - b.sort_order));
      const scheduled = state.tasks
        .filter((t) => t.status === "open" && t.schedule === "today" && !od(t))
        .sort((a, b) => a.sort_order - b.sort_order || b.id - a.id);
      return [...overdue, ...scheduled];
    }
    case "future":
      // Future ⟺ has a scheduled date OR a deadline. Rendered as an agenda via
      // futureAgenda(); this flat list just drives the sidebar count.
      list = state.tasks.filter((t) => t.status === "open" && (t.due_date != null || t.deadline != null));
      break;
    case "whenever":
      list = state.tasks.filter((t) => t.status === "open" && t.schedule === "whenever");
      break;
    case "downtheroad":
      list = state.tasks.filter((t) => t.status === "open" && t.schedule === "downtheroad");
      break;
    case "burst":
      list = state.tasks.filter((t) => t.status === "open" && t.burst_id === v.id);
      break;
    case "arc":
      list = state.tasks.filter((t) => t.status === "open" && t.arc_id === v.id);
      break;
    case "logs":
      list = state.tasks.filter((t) => t.status === "done");
      break;
    case "bin":
      list = state.tasks.filter((t) => t.status === "trashed");
      break;
    default:
      list = [];
  }
  if (v.type === "logs") {
    list.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  } else if (v.type === "bin") {
    list.sort((a, b) => b.id - a.id);
  } else {
    list.sort((a, b) => a.sort_order - b.sort_order || b.id - a.id);
  }
  return list;
}

export function countForView(v: View): number {
  return tasksForView(v).length;
}

// Completion fraction for a burst: done ÷ (open + done), trashed excluded.
// Completed to-dos keep their burst_id, so they still count toward the total.
// 0 when the burst has no to-dos yet.
export function burstProgress(id: number): number {
  let done = 0;
  let total = 0;
  for (const t of state.tasks) {
    if (t.burst_id !== id || t.status === "trashed") continue;
    total++;
    if (t.status === "done") done++;
  }
  return total ? done / total : 0;
}

// Completed to-dos belonging to a burst/arc — shown in that view's "logged"
// section (and still in the global Logs view). Empty for every other view.
export function loggedTasksForView(v: View): Task[] {
  if (v.type !== "burst" && v.type !== "arc") return [];
  const mine = (t: Task) => (v.type === "burst" ? t.burst_id === v.id : t.arc_id === v.id);
  return state.tasks
    .filter((t) => t.status === "done" && mine(t))
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
}

// --- Future agenda -----------------------------------------------------------

export interface AgendaDay {
  date: Date;
  tasks: Task[];
}
export interface AgendaMonth {
  month: Date;
  days: AgendaDay[];
}
// The Future view's model. `dense` = every day from today through end of THIS
// month (empty days included). `tail` = later months, each listing only the days
// that actually carry a dated to-do. (Future ⟺ a date, so there's no "no date"
// group — an undated to-do simply isn't in Future.)
export interface AgendaModel {
  dense: AgendaDay[];
  tail: AgendaMonth[];
}

export function futureAgenda(now: Date = new Date()): AgendaModel {
  const today = atMidnight(now);
  const todayISO = toISODate(today);
  const monthEndISO = toISODate(endOfMonth(today));
  const byDay = new Map<string, Task[]>(); // ISO day → open dated to-dos
  const overdue: Task[] = [];
  const sortTasks = (a: Task, b: Task): number => a.sort_order - b.sort_order || b.id - a.id;

  for (const t of state.tasks) {
    if (t.status !== "open") continue;
    // Entry day: the scheduled date if it has one, else the deadline day. So a
    // scheduled+deadline to-do shows once (on its scheduled day, deadline flag
    // beside); a deadline-only to-do shows on its deadline day.
    const entry = t.due_date ?? t.deadline;
    if (entry == null) continue;
    if (entry < todayISO) overdue.push(t);
    else (byDay.get(entry) ?? byDay.set(entry, []).get(entry)!).push(t);
  }
  overdue.sort(sortTasks);

  // Dense: today → end of current month, every day. Overdue folds into today.
  const dense: AgendaDay[] = [];
  for (let d = today; toISODate(d) <= monthEndISO; d = addDays(d, 1)) {
    const iso = toISODate(d);
    const here = (byDay.get(iso) ?? []).slice().sort(sortTasks);
    dense.push({ date: new Date(d), tasks: iso === todayISO ? [...overdue, ...here] : here });
  }

  // Tail: every later month that has dated to-dos (no fixed horizon — months
  // with nothing scheduled are skipped, so this naturally spans only as far as
  // the user has planned). ponytail: O(days·months) group; trivial for one user.
  const monthKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}`;
  const tailMap = new Map<string, AgendaDay[]>();
  for (const [iso, list] of byDay) {
    if (iso <= monthEndISO) continue;
    const date = fromISODate(iso);
    const key = monthKey(date);
    (tailMap.get(key) ?? tailMap.set(key, []).get(key)!).push({ date, tasks: list.slice().sort(sortTasks) });
  }
  const tail: AgendaMonth[] = [...tailMap.values()]
    .map((days) => {
      days.sort((a, b) => a.date.getTime() - b.date.getTime());
      return { month: startOfMonth(days[0].date), days };
    })
    .sort((a, b) => a.month.getTime() - b.month.getTime());

  return { dense, tail };
}

export interface NewTaskCtx {
  schedule: Schedule;
  burst_id: number | null;
  arc_id: number | null;
}

export function contextForView(v: View): NewTaskCtx {
  // A new to-do defaults to "nowhere" (raw) — including inside a burst/arc, where
  // it's just filed there until the user dates it (→ future) or hits ⌘T (→ today).
  // Future has no dateless creation (Future ⟺ a date), so it starts raw too.
  if (v.type === "whenever") return { schedule: "whenever", burst_id: null, arc_id: null };
  if (v.type === "downtheroad") return { schedule: "downtheroad", burst_id: null, arc_id: null };
  if (v.type === "burst") return { schedule: "raw", burst_id: v.id ?? null, arc_id: null };
  if (v.type === "arc") return { schedule: "raw", burst_id: null, arc_id: v.id ?? null };
  if (v.type === "today") return { schedule: "today", burst_id: null, arc_id: null };
  return { schedule: "raw", burst_id: null, arc_id: null }; // raw + future views
}

// --- search ------------------------------------------------------------------

export interface SearchResults {
  bursts: Burst[];
  arcs: Arc[];
  todos: Task[];
}

// Case-insensitive substring search over bursts, arcs, and OPEN to-dos.
// (Checkpoints, done/trashed to-dos, and built-in views are out of scope.)
export function searchAll(query: string): SearchResults {
  const q = query.trim().toLowerCase();
  if (!q) return { bursts: [], arcs: [], todos: [] };
  const has = (s: string): boolean => s.toLowerCase().includes(q);
  return {
    bursts: state.bursts.filter((b) => has(b.name || "New Burst")),
    arcs: state.arcs.filter((a) => has(a.name || "New Arc")),
    todos: state.tasks.filter((t) => t.status === "open" && has(t.title)),
  };
}

const SCHEDULE_LABEL: Record<Schedule, string> = {
  raw: "Anytime",
  today: "Today",
  future: "Future",
  whenever: "Whenever",
  downtheroad: "Down the road",
};

// The view a to-do "lives" in: its burst/arc if filed, else its schedule lane.
export function todoHomeView(task: Task): View {
  if (task.burst_id != null) return { type: "burst", id: task.burst_id };
  if (task.arc_id != null) return { type: "arc", id: task.arc_id };
  return { type: task.schedule };
}

// Subtitle for a to-do search result: its burst/arc name, else its schedule.
export function todoLocationLabel(task: Task): string {
  if (task.burst_id != null) return state.bursts.find((b) => b.id === task.burst_id)?.name || "New Burst";
  if (task.arc_id != null) return state.arcs.find((a) => a.id === task.arc_id)?.name || "New Arc";
  return SCHEDULE_LABEL[task.schedule];
}

// --- mutations ---------------------------------------------------------------

// `dueDate` (optional) starts the to-do in Future on that day — used when adding
// directly in the Future view. A date implies the future lane (keeps the
// schedule⟺date invariant), overriding ctx.schedule.
export async function addTask(ctx: NewTaskCtx, dueDate: string | null = null): Promise<Task> {
  record();
  const sort = -Date.now(); // newest first when ordering ascending
  const schedule: Schedule = dueDate != null ? "future" : ctx.schedule;
  const res = await run(
    "INSERT INTO tasks (title, schedule, burst_id, arc_id, sort_order, due_date) VALUES (?, ?, ?, ?, ?, ?)",
    ["", schedule, ctx.burst_id, ctx.arc_id, sort, dueDate],
  );
  const task: Task = {
    id: Number(res.lastInsertId),
    title: "",
    notes: "",
    status: "open",
    schedule,
    burst_id: ctx.burst_id,
    arc_id: ctx.arc_id,
    sort_order: sort,
    created_at: "",
    completed_at: null,
    due_date: dueDate,
    deadline: null,
    tags: [],
  };
  state.tasks.unshift(task);
  return task;
}

// Set/clear a to-do's date. A date IS the Future lane, so schedule tracks it:
// setting a date moves the to-do to 'future' (out of today/whenever/…); clearing
// it drops back to the unscheduled inbox (raw). Burst/arc filing is untouched.
export async function setTaskDueDate(id: number, due: string | null): Promise<void> {
  record();
  const schedule: Schedule = due != null ? "future" : "raw";
  await run("UPDATE tasks SET due_date = ?, schedule = ? WHERE id = ?", [due, schedule, id]);
  const t = state.tasks.find((x) => x.id === id);
  if (t) {
    t.due_date = due;
    t.schedule = schedule;
  }
}

// Set/clear a hard deadline. Orthogonal — does NOT touch schedule/due_date/lane.
export async function setTaskDeadline(id: number, deadline: string | null): Promise<void> {
  record();
  await run("UPDATE tasks SET deadline = ? WHERE id = ?", [deadline, id]);
  const t = state.tasks.find((x) => x.id === id);
  if (t) t.deadline = deadline;
}

// Any open to-do whose deadline has passed — drives the red Today sidebar dot.
export function anyOverdueDeadline(now: Date = new Date()): boolean {
  const tISO = toISODate(atMidnight(now));
  return state.tasks.some((t) => t.status === "open" && t.deadline != null && t.deadline < tISO);
}

// Set a to-do's lane. Lanes are mutually exclusive, so moving to any non-future
// lane (today/whenever/downtheroad/raw) drops the date — that's what made it
// "future". (Dating, which sets schedule='future', goes through setTaskDueDate.)
export async function setTaskSchedule(id: number, schedule: Schedule): Promise<void> {
  record();
  if (schedule === "future") {
    await run("UPDATE tasks SET schedule = ? WHERE id = ?", [schedule, id]);
    const t = state.tasks.find((x) => x.id === id);
    if (t) t.schedule = schedule;
  } else {
    await run("UPDATE tasks SET schedule = ?, due_date = NULL WHERE id = ?", [schedule, id]);
    const t = state.tasks.find((x) => x.id === id);
    if (t) {
      t.schedule = schedule;
      t.due_date = null;
    }
  }
}

// Drag-and-drop move: re-file one or more tasks onto a sidebar destination.
// One undo step for the whole batch. Schedule lanes set `schedule` and keep
// burst/arc membership; Raws unfiles (clears burst+arc); a burst/arc sets that
// membership (and lifts a raw task to "future" so it leaves the inbox); Bin
// trashes. Returns the ids that actually changed view-relevant fields.
export async function moveTasks(ids: number[], dest: View): Promise<void> {
  if (!ids.length) return;
  record();
  for (const id of ids) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) continue;
    let { schedule, burst_id, arc_id, status, due_date } = t;
    let completed_at = t.completed_at;
    switch (dest.type) {
      case "raw":
        schedule = "raw"; burst_id = null; arc_id = null; due_date = null; break;
      case "today": case "whenever": case "downtheroad":
        // a dateless lane → drop the date (lanes are mutually exclusive)
        schedule = dest.type; due_date = null; break; // keep burst/arc membership
      case "burst":
        burst_id = dest.id ?? null; arc_id = null; break; // schedule/date untouched
      case "arc":
        arc_id = dest.id ?? null; burst_id = null; break; // schedule/date untouched
      case "bin":
        status = "trashed"; completed_at = null; break;
      default:
        continue; // logs / future (date-driven) etc. aren't move targets
    }
    await run(
      "UPDATE tasks SET schedule = ?, burst_id = ?, arc_id = ?, status = ?, completed_at = ?, due_date = ? WHERE id = ?",
      [schedule, burst_id, arc_id, status, completed_at, due_date, id],
    );
    Object.assign(t, { schedule, burst_id, arc_id, status, completed_at, due_date });
  }
}

export async function setTaskNotes(id: number, notes: string): Promise<void> {
  record(`notes:${id}`);
  await run("UPDATE tasks SET notes = ? WHERE id = ?", [notes, id]);
  const t = state.tasks.find((x) => x.id === id);
  if (t) t.notes = notes;
}

export async function setTaskTags(id: number, tags: string[]): Promise<void> {
  record(`tags:${id}`);
  const clean = Array.from(new Set(tags.map((s) => s.trim()).filter(Boolean)));
  await run("UPDATE tasks SET tags = ? WHERE id = ?", [JSON.stringify(clean), id]);
  const t = state.tasks.find((x) => x.id === id);
  if (t) t.tags = clean;
}

export function distinctTagsForView(v: View): string[] {
  const set = new Set<string>();
  for (const t of tasksForView(v)) for (const tag of t.tags) set.add(tag);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// --- checkpoints (loaded on demand, not held in global state) ----------------

export async function getCheckpoints(taskId: number): Promise<Checkpoint[]> {
  const rows = await all<{ id: number; task_id: number; title: string; done: number; sort_order: number }>(
    "SELECT * FROM checkpoints WHERE task_id = ? ORDER BY sort_order, id",
    [taskId],
  );
  return rows.map((r) => ({ ...r, done: !!r.done }));
}

export async function addCheckpoint(taskId: number): Promise<Checkpoint> {
  const sort = Date.now();
  const res = await run("INSERT INTO checkpoints (task_id, sort_order) VALUES (?, ?)", [taskId, sort]);
  // No count bump: a fresh checkpoint is blank, so it doesn't show the glyph yet.
  return { id: Number(res.lastInsertId), task_id: taskId, title: "", done: false, sort_order: sort };
}

export async function toggleCheckpoint(id: number, done: boolean): Promise<void> {
  await run("UPDATE checkpoints SET done = ? WHERE id = ?", [done ? 1 : 0, id]);
}

export async function setCheckpointTitle(id: number, title: string): Promise<void> {
  await run("UPDATE checkpoints SET title = ? WHERE id = ?", [title, id]);
}

export async function setCheckpointOrder(id: number, sortOrder: number): Promise<void> {
  await run("UPDATE checkpoints SET sort_order = ? WHERE id = ?", [sortOrder, id]);
}

export async function deleteCheckpoint(id: number): Promise<void> {
  await run("DELETE FROM checkpoints WHERE id = ?", [id]);
}

// Set the count of non-empty checkpoints for a task (drives the row glyph).
// The card recomputes this on close, so blank checkpoints never show the glyph.
export function setCheckpointCount(taskId: number, count: number): void {
  if (count > 0) state.checkpointCounts.set(taskId, count);
  else state.checkpointCounts.delete(taskId);
}

// New sort_order for a checkpoint dropped between two neighbours (by their
// sort_order). null = list edge. Both null (a list of one) → unchanged.
export function checkpointSortBetween(prevSort: number | null, nextSort: number | null): number {
  if (prevSort != null && nextSort != null) return (prevSort + nextSort) / 2;
  if (nextSort != null) return nextSort - 1; // dropped at the top
  if (prevSort != null) return prevSort + 1; // dropped at the bottom
  return 0;
}

export async function checkpointProgress(taskId: number): Promise<{ done: number; total: number }> {
  const rows = await all<{ done: number; total: number }>(
    "SELECT COALESCE(SUM(done),0) as done, COUNT(*) as total FROM checkpoints WHERE task_id = ?",
    [taskId],
  );
  return rows[0] ?? { done: 0, total: 0 };
}

export async function setTaskTitle(id: number, title: string): Promise<void> {
  record(`title:${id}`);
  await run("UPDATE tasks SET title = ? WHERE id = ?", [title, id]);
  const t = state.tasks.find((x) => x.id === id);
  if (t) t.title = title;
}

export async function setTaskOrder(id: number, sortOrder: number): Promise<void> {
  record();
  await run("UPDATE tasks SET sort_order = ? WHERE id = ?", [sortOrder, id]);
  const t = state.tasks.find((x) => x.id === id);
  if (t) t.sort_order = sortOrder;
}

export async function setTaskStatus(id: number, status: TaskStatus): Promise<void> {
  record();
  const completed = status === "done" ? new Date().toISOString() : null;
  await run("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?", [status, completed, id]);
  const t = state.tasks.find((x) => x.id === id);
  if (t) {
    t.status = status;
    t.completed_at = completed;
  }
}

export async function deleteTask(id: number): Promise<void> {
  record();
  await run("DELETE FROM tasks WHERE id = ?", [id]);
  state.tasks = state.tasks.filter((x) => x.id !== id);
}

// Copy a to-do (title/notes/tags/schedule/burst/arc) as a fresh open task, slotted
// just after the original. Returns it so the caller can insert its row.
export async function duplicateTask(id: number): Promise<Task | null> {
  const src = state.tasks.find((x) => x.id === id);
  if (!src) return null;
  record();
  const sort = src.sort_order + 0.5; // sits immediately after the original
  const res = await run(
    "INSERT INTO tasks (title, notes, schedule, burst_id, arc_id, sort_order, due_date, deadline, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [src.title, src.notes, src.schedule, src.burst_id, src.arc_id, sort, src.due_date, src.deadline, JSON.stringify(src.tags)],
  );
  const copy: Task = {
    ...src,
    id: Number(res.lastInsertId),
    status: "open",
    completed_at: null,
    sort_order: sort,
    created_at: "",
    tags: [...src.tags],
  };
  state.tasks.push(copy);
  return copy;
}

// Delete a burst/arc; its to-dos survive — they're just unfiled (burst_id/arc_id
// cleared), so they fall back to their schedule view. Undoable like everything else.
export async function deleteBurst(id: number): Promise<void> {
  record();
  await run("UPDATE tasks SET burst_id = NULL WHERE burst_id = ?", [id]);
  await run("DELETE FROM bursts WHERE id = ?", [id]);
  for (const t of state.tasks) if (t.burst_id === id) t.burst_id = null;
  state.bursts = state.bursts.filter((b) => b.id !== id);
}

export async function deleteArc(id: number): Promise<void> {
  record();
  await run("UPDATE tasks SET arc_id = NULL WHERE arc_id = ?", [id]);
  await run("DELETE FROM arcs WHERE id = ?", [id]);
  for (const t of state.tasks) if (t.arc_id === id) t.arc_id = null;
  state.arcs = state.arcs.filter((a) => a.id !== id);
}

export async function addBurst(): Promise<Burst> {
  record();
  const sort = Date.now();
  // empty name → shows the "New Burst" placeholder/fallback; cursor starts clean on rename
  const res = await run("INSERT INTO bursts (name, sort_order) VALUES (?, ?)", ["", sort]);
  const burst: Burst = {
    id: Number(res.lastInsertId),
    name: "",
    notes: "",
    status: "active",
    sort_order: sort,
    created_at: "",
  };
  state.bursts.push(burst);
  return burst;
}

export async function addArc(): Promise<Arc> {
  record();
  const sort = Date.now();
  const res = await run("INSERT INTO arcs (name, sort_order) VALUES (?, ?)", ["", sort]);
  const arc: Arc = {
    id: Number(res.lastInsertId),
    name: "",
    notes: "",
    sort_order: sort,
    created_at: "",
  };
  state.arcs.push(arc);
  return arc;
}

export async function renameBurst(id: number, name: string): Promise<void> {
  record(`burst:${id}`);
  await run("UPDATE bursts SET name = ? WHERE id = ?", [name, id]);
  const b = state.bursts.find((x) => x.id === id);
  if (b) b.name = name;
}

export async function renameArc(id: number, name: string): Promise<void> {
  record(`arc:${id}`);
  await run("UPDATE arcs SET name = ? WHERE id = ?", [name, id]);
  const a = state.arcs.find((x) => x.id === id);
  if (a) a.name = name;
}

export async function setBurstOrder(id: number, sortOrder: number): Promise<void> {
  record();
  await run("UPDATE bursts SET sort_order = ? WHERE id = ?", [sortOrder, id]);
  const b = state.bursts.find((x) => x.id === id);
  if (b) b.sort_order = sortOrder;
  state.bursts.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

export async function setArcOrder(id: number, sortOrder: number): Promise<void> {
  record();
  await run("UPDATE arcs SET sort_order = ? WHERE id = ?", [sortOrder, id]);
  const a = state.arcs.find((x) => x.id === id);
  if (a) a.sort_order = sortOrder;
  state.arcs.sort((x, y) => x.sort_order - y.sort_order || x.id - y.id);
}

export async function setBurstNotes(id: number, notes: string): Promise<void> {
  record(`bnotes:${id}`);
  await run("UPDATE bursts SET notes = ? WHERE id = ?", [notes, id]);
  const b = state.bursts.find((x) => x.id === id);
  if (b) b.notes = notes;
}

export async function setArcNotes(id: number, notes: string): Promise<void> {
  record(`anotes:${id}`);
  await run("UPDATE arcs SET notes = ? WHERE id = ?", [notes, id]);
  const a = state.arcs.find((x) => x.id === id);
  if (a) a.notes = notes;
}
