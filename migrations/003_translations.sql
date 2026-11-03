CREATE TABLE provider_sources (
  clip_id TEXT PRIMARY KEY REFERENCES clips(id),
  state TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE translation_jobs (
  id TEXT PRIMARY KEY,
  clip_id TEXT NOT NULL REFERENCES clips(id),
  target TEXT NOT NULL,
  state TEXT NOT NULL,
  next_check INTEGER NOT NULL,
  data TEXT NOT NULL,
  UNIQUE(clip_id, target)
);
CREATE INDEX translation_due ON translation_jobs(state, next_check);
PRAGMA user_version = 3;
