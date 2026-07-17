CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE arbox_credentials (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE webhook_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  webhook_url TEXT
);

CREATE TABLE scheduled_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id INTEGER NOT NULL,
  class_date TEXT NOT NULL,
  class_time TEXT NOT NULL,
  class_name TEXT NOT NULL,
  enable_registration_time INTEGER NOT NULL,
  fire_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_scheduled_jobs_status_fire_at ON scheduled_jobs(status, fire_at);
CREATE INDEX idx_scheduled_jobs_user ON scheduled_jobs(user_id);
