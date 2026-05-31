-- Persist volunteer session state in Postgres (was in-memory Maps in
-- volunteerController.js). Moving this to the database means sessions survive a
-- server restart/redeploy and work across multiple backend instances.
--
-- Run this in the Supabase SQL Editor.
-- Safe to run multiple times (IF NOT EXISTS guards).

-- One live session per owner. The Map was keyed by ownerUid, so owner_uid is
-- the primary key and the upsert target for code regeneration: regenerate
-- UPDATEs this row in place (new code) rather than deleting it, which strands
-- volunteers still holding the old code (intended behavior) instead of evicting
-- them.
CREATE TABLE IF NOT EXISTS volunteer_sessions (
  owner_uid   TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_volunteer_sessions_expires_at
  ON volunteer_sessions (expires_at);

-- One record per anonymous volunteer (keyed by Firebase anonymous uid).
-- `code` links to a session's code but is intentionally NOT a foreign key:
-- a real FK would break code regeneration (the parent code value changes under
-- upsert) and would turn end-session/expiry into cascade deletes whose timing
-- differs from the original in-memory behavior. Eviction is done with explicit
-- DELETEs instead.
CREATE TABLE IF NOT EXISTS active_volunteers (
  volunteer_uid TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  items_scanned INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_active_volunteers_code
  ON active_volunteers (code);
