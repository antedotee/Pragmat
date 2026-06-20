import { run, all } from "./db";
import { record } from "./history";

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
      list = state.tasks.filter((t) => t.status === "open" && t.schedule === "raw");
      break;
    case "today":
      list = state.tasks.filter((t) => t.status === "open" && t.schedule === "today");
      break;
    case "future":
      list = state.tasks.filter((t) => t.status === "open" && t.schedule === "future");
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

export interface NewTaskCtx {
  schedule: Schedule;
  burst_id: number | null;
  arc_id: number | null;
}

export function contextForView(v: View): NewTaskCtx {
  if (v.type === "raw") return { schedule: "raw", burst_id: null, arc_id: null };
  if (v.type === "future") return { schedule: "future", burst_id: null, arc_id: null };
  if (v.type === "whenever") return { schedule: "whenever", burst_id: null, arc_id: null };
  if (v.type === "downtheroad") return { schedule: "downtheroad", burst_id: null, arc_id: null };
  if (v.type === "burst") return { schedule: "future", burst_id: v.id ?? null, arc_id: null };
  if (v.type === "arc") return { schedule: "future", burst_id: null, arc_id: v.id ?? null };
  return { schedule: "today", burst_id: null, arc_id: null };
}

// --- mutations ---------------------------------------------------------------

export async function addTask(ctx: NewTaskCtx): Promise<Task> {
  record();
  const sort = -Date.now(); // newest first when ordering ascending
  const res = await run(
    "INSERT INTO tasks (title, schedule, burst_id, arc_id, sort_order) VALUES (?, ?, ?, ?, ?)",
    ["", ctx.schedule, ctx.burst_id, ctx.arc_id, sort],
  );
  const task: Task = {
    id: Number(res.lastInsertId),
    title: "",
    notes: "",
    status: "open",
    schedule: ctx.schedule,
    burst_id: ctx.burst_id,
    arc_id: ctx.arc_id,
    sort_order: sort,
    created_at: "",
    completed_at: null,
    tags: [],
  };
  state.tasks.unshift(task);
  return task;
}

export async function setTaskSchedule(id: number, schedule: Schedule): Promise<void> {
  record();
  await run("UPDATE tasks SET schedule = ? WHERE id = ?", [schedule, id]);
  const t = state.tasks.find((x) => x.id === id);
  if (t) t.schedule = schedule;
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
    let { schedule, burst_id, arc_id, status } = t;
    let completed_at = t.completed_at;
    switch (dest.type) {
      case "raw":
        schedule = "raw"; burst_id = null; arc_id = null; break;
      case "today": case "future": case "whenever": case "downtheroad":
        schedule = dest.type; break; // keep burst/arc membership
      case "burst":
        burst_id = dest.id ?? null; arc_id = null;
        if (schedule === "raw") schedule = "future"; break;
      case "arc":
        arc_id = dest.id ?? null; burst_id = null;
        if (schedule === "raw") schedule = "future"; break;
      case "bin":
        status = "trashed"; completed_at = null; break;
      default:
        continue; // logs etc. aren't move targets
    }
    await run(
      "UPDATE tasks SET schedule = ?, burst_id = ?, arc_id = ?, status = ?, completed_at = ? WHERE id = ?",
      [schedule, burst_id, arc_id, status, completed_at, id],
    );
    Object.assign(t, { schedule, burst_id, arc_id, status, completed_at });
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
    "INSERT INTO tasks (title, notes, schedule, burst_id, arc_id, sort_order, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [src.title, src.notes, src.schedule, src.burst_id, src.arc_id, sort, JSON.stringify(src.tags)],
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
