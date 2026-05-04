-- Migration v3: Add activity_log table
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS activity_log (
  id          SERIAL PRIMARY KEY,
  item_id     INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name   TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('added', 'removed')),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);
