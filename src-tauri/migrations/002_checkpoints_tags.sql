ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS checkpoints (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL DEFAULT '',
  done       INTEGER NOT NULL DEFAULT 0,
  sort_order REAL    NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON checkpoints(task_id);
