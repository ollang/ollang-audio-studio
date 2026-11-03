-- Only new, explicitly opted-in recordings start provider work automatically.
-- Existing recordings retain their original manual-submission behavior.
ALTER TABLE clips ADD COLUMN automatic_translation INTEGER NOT NULL DEFAULT 0
  CHECK(automatic_translation IN (0, 1));
PRAGMA user_version = 4;
