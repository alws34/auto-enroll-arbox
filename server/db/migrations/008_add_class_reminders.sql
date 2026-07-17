CREATE TABLE class_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id INTEGER NOT NULL,
  class_date TEXT NOT NULL,
  class_time TEXT NOT NULL,
  class_name TEXT NOT NULL,
  minutes_before INTEGER NOT NULL,
  remind_at TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, schedule_id, minutes_before)
);

CREATE INDEX idx_class_reminders_due ON class_reminders(sent_at, remind_at);
