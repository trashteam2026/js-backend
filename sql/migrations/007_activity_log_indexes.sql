-- 007: activity_log indexes for scaling
-- ----------------------------------------------------------------------------
-- Adds three indexes to activity_log, all previously unindexed:
--   1. idx_activity_log_item_id  — activity_log.item_id is an FK to items with
--      ON DELETE SET NULL. Without an index, deleting an item forces a full
--      seq-scan of activity_log to null out referencing rows. This indexes it.
--   2. idx_activity_log_batch_id — same as above for batch_id (FK to
--      item_batches, ON DELETE SET NULL); speeds batch-delete cleanup.
--   3. idx_activity_log_added_created_at — PARTIAL index serving the
--      volunteer-history query (volunteerController.getVolunteerHistory):
--      WHERE action = 'added' ... ORDER BY al.created_at DESC over a created_at
--      range. The partial WHERE keeps it small and the DESC ordering matches
--      the query's sort. Intentionally NOT a volunteer_uid index — that query
--      filters volunteer_uid IS NOT NULL only, never by a specific uid value.
--
-- Uses plain CREATE INDEX (not CONCURRENTLY) because this runs as a normal
-- migration and activity_log is small today. For a very large live table,
-- CREATE INDEX CONCURRENTLY would avoid holding a write lock during the build.
-- All statements are idempotent (IF NOT EXISTS), safe to re-run.
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_activity_log_item_id
  ON activity_log (item_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_batch_id
  ON activity_log (batch_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_added_created_at
  ON activity_log (created_at DESC)
  WHERE action = 'added';
