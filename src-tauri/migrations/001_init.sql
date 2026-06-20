CREATE TABLE IF NOT EXISTS bursts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'active',
  sort_order REAL    NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS arcs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL DEFAULT '',
  sort_order REAL    NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL DEFAULT '',
  notes        TEXT    NOT NULL DEFAULT '',
  status       TEXT    NOT NULL DEFAULT 'open',     -- open | done | trashed
  schedule     TEXT    NOT NULL DEFAULT 'today',    -- today | future
  burst_id     INTEGER REFERENCES bursts(id) ON DELETE SET NULL,
  arc_id       INTEGER REFERENCES arcs(id) ON DELETE SET NULL,
  sort_order   REAL    NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_schedule ON tasks(schedule);
