-- Optional per-task calendar date (ISO 'YYYY-MM-DD'; NULL = no date). Independent
-- of `schedule`/burst/arc — a dated to-do shows in the Future agenda *as well* as
-- its home lane.
ALTER TABLE tasks ADD COLUMN due_date TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
