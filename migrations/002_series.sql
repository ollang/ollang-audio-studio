ALTER TABLE clips ADD COLUMN series_id TEXT NOT NULL DEFAULT '';
ALTER TABLE clips ADD COLUMN position INTEGER NOT NULL DEFAULT 1;
UPDATE clips SET series_id=id;
CREATE UNIQUE INDEX clips_series_position ON clips(series_id, position);
PRAGMA user_version = 2;
