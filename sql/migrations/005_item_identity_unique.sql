-- 005: normalized item identity unique index
-- Enforces one item per (lower(trim(name)), category_id), with NULL category
-- collapsed into a single bucket via a sentinel that can never be a real id.
-- Verified 2026-06-04: zero pre-existing normalized duplicates, safe to build.

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_identity
  ON items (LOWER(TRIM(name)), COALESCE(category_id, -1));
