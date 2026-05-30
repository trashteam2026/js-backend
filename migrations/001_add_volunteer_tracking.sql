-- Run this migration once to enable volunteer activity tracking.
-- Adds volunteer_name to activity_log so check-ins are linked to the volunteer
-- who performed them.
--
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards).

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS volunteer_name TEXT;
