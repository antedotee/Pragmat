-- Optional hard deadline (ISO 'YYYY-MM-DD'; NULL = none). Distinct from and
-- orthogonal to `due_date` (the scheduled "when") and the lane: a to-do keeps its
-- home and may carry both a scheduled date and a deadline. Overdue deadlines drive
-- the red flag/countdown cues and surface the to-do in Today.
ALTER TABLE tasks ADD COLUMN deadline TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
