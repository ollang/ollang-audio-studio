CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  duration REAL NOT NULL,
  source_language TEXT NOT NULL DEFAULT '',
  detected_language TEXT NOT NULL DEFAULT '',
  confidence REAL,
  confirmation_required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK(status IN ('analyzing', 'ready', 'needs_language')),
  notice TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
PRAGMA user_version = 1;
