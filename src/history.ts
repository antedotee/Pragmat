// Undo/redo for any task/burst/arc change.
//
// Approach: snapshot the whole in-memory state (tasks, bursts, arcs) BEFORE each
// mutation. Undo = restore the previous snapshot; redo = the one we left. This is
// generic — every mutation is covered without writing a per-action inverse.
//
// Restoring the DB is a per-id diff (not a table wipe): `state.bursts` omits
// archived bursts, so wiping + re-inserting would lose them. Existing rows are
// UPDATEd (never REPLACEd) so a task's checkpoints aren't cascade-deleted.
//
// ponytail: checkpoints aren't in global state, so checkpoint edits aren't
// captured here. Add a checkpoints array to the snapshot if that's ever wanted.
import { state, type Task, type Burst, type Arc } from "./state";
import { run } from "./db";

interface Snapshot {
  tasks: Task[];
  bursts: Burst[];
  arcs: Arc[];
}

const MAX = 100;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];
// Coalesce consecutive edits sharing a key (e.g. typing a title) into one step.
let lastKey: string | undefined;

function snap(): Snapshot {
  return structuredClone({ tasks: state.tasks, bursts: state.bursts, arcs: state.arcs });
}

/**
 * Capture the pre-mutation state. Call at the TOP of a mutation, before it
 * changes anything. Pass a stable `key` for rapid same-field edits (title,
 * notes, rename) so they collapse into a single undo step; omit it for discrete
 * actions (create, delete, toggle, reorder) so each gets its own step.
 */
export function record(key?: string): void {
  if (key !== undefined && key === lastKey) return; // same field, still typing
  undoStack.push(snap());
  if (undoStack.length > MAX) undoStack.shift();
  redoStack.length = 0;
  lastKey = key;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}
export function canRedo(): boolean {
  return redoStack.length > 0;
}

export async function undo(): Promise<boolean> {
  const target = undoStack.pop();
  if (!target) return false;
  redoStack.push(snap());
  await apply(target);
  return true;
}

export async function redo(): Promise<boolean> {
  const target = redoStack.pop();
  if (!target) return false;
  undoStack.push(snap());
  await apply(target);
  return true;
}

async function apply(target: Snapshot): Promise<void> {
  // bursts/arcs first so tasks' FK references exist when we set them.
  await syncTable("bursts", ["name", "notes", "status", "sort_order"], state.bursts, target.bursts);
  await syncTable("arcs", ["name", "notes", "sort_order"], state.arcs, target.arcs);
  await syncTable(
    "tasks",
    ["title", "notes", "status", "schedule", "burst_id", "arc_id", "sort_order", "completed_at", "tags"],
    state.tasks,
    target.tasks,
  );
  state.tasks = structuredClone(target.tasks);
  state.bursts = structuredClone(target.bursts);
  state.arcs = structuredClone(target.arcs);
  lastKey = undefined; // next edit starts a fresh undo step
}

// Reconcile `table` from `current` rows to `target` rows by id: DELETE removed,
// INSERT added, UPDATE the rest. tags is the only column needing serialization.
async function syncTable<T extends { id: number }>(
  table: string,
  cols: (keyof T & string)[],
  current: T[],
  target: T[],
): Promise<void> {
  const targetIds = new Set(target.map((r) => r.id));
  const currentIds = new Set(current.map((r) => r.id));
  const val = (r: T, c: string): unknown => (c === "tags" ? JSON.stringify((r as { tags?: unknown }).tags ?? []) : (r as Record<string, unknown>)[c]);

  for (const r of current) if (!targetIds.has(r.id)) await run(`DELETE FROM ${table} WHERE id = ?`, [r.id]);

  for (const r of target) {
    const vals = cols.map((c) => val(r, c));
    if (currentIds.has(r.id)) {
      await run(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...vals, r.id]);
    } else {
      const ph = cols.map(() => "?").join(", ");
      await run(`INSERT INTO ${table} (id, ${cols.join(", ")}) VALUES (?, ${ph})`, [r.id, ...vals]);
    }
  }
}
