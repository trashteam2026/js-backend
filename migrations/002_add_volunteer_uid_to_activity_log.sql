-- Adds volunteer_uid so activity entries can be authorized back to the
-- anonymous Firebase UID that created them, and batch_id so quantity
-- reversals on edit/delete are accurate.
--
-- Safe to run multiple times (IF NOT EXISTS guards).

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS volunteer_uid TEXT;

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES item_batches(id) ON DELETE SET NULL;
