-- ============================================================================
-- CANONICAL SCHEMA — food-pantry js-backend (PostgreSQL / Supabase)
-- ============================================================================
-- This is the ONE file needed for a fresh deploy. Run it once against an empty
-- Postgres database (e.g. the Supabase SQL Editor) and it reproduces the exact
-- current live schema. It consolidates and supersedes:
--   sql/create_tables.sql, sql/migrate_v2.sql, sql/migrate_v3.sql,
--   sql/migrate_v4.sql, sql/migrate_v5_reset_inventory_categories.sql,
--   migrations/001..004
-- Every statement uses IF NOT EXISTS / idempotent guards, so re-running is safe.
-- The legacy files are kept for history but are no longer required.
-- ============================================================================

-- ─── users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  username     VARCHAR(50)  NOT NULL UNIQUE,
  email        VARCHAR(255) NOT NULL UNIQUE,
  firstname    VARCHAR(100) DEFAULT NULL,
  lastname     VARCHAR(100) DEFAULT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── barcode_mappings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS barcode_mappings (
  id          SERIAL PRIMARY KEY,
  barcode     VARCHAR(50) NOT NULL UNIQUE,
  custom_name VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── categories ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  parent_group  TEXT NOT NULL DEFAULT 'food' CHECK (parent_group IN ('food', 'non_food')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── items ──────────────────────────────────────────────────────────────────
-- category_id FK is ON DELETE CASCADE (live value; folded from migration 004).
-- low_stock_threshold DEFAULT 20.
CREATE TABLE IF NOT EXISTS items (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  category_id         INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  low_stock_threshold INTEGER NOT NULL DEFAULT 20,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy single-barcode column on items (superseded by item_barcodes, but the
-- column and its partial unique index remain in the live schema).
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_barcode
  ON items (barcode)
  WHERE barcode IS NOT NULL;

-- Normalized item identity: one item per (lower(trim(name)), category_id), with
-- NULL category collapsed into a single bucket via a sentinel that can never be
-- a real id. Lets check-in's match-or-create run as a conflict-safe upsert so
-- concurrent same-product check-ins resolve to one row instead of splitting into
-- duplicate catalog rows (folded from migrations/005).
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_identity
  ON items (LOWER(TRIM(name)), COALESCE(category_id, -1));

-- ─── item_batches ───────────────────────────────────────────────────────────
-- quantity DEFAULT 1 (live value).
CREATE TABLE IF NOT EXISTS item_batches (
  id              SERIAL PRIMARY KEY,
  item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  expiration_date DATE,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_batches_item_expiration
  ON item_batches (item_id, expiration_date);

-- ─── item_barcodes ──────────────────────────────────────────────────────────
-- Multiple barcodes per item.
CREATE TABLE IF NOT EXISTS item_barcodes (
  id         SERIAL PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  barcode    VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill any legacy single-barcode values into item_barcodes. No-op on a
-- fresh empty database; idempotent on re-run.
INSERT INTO item_barcodes (item_id, barcode)
SELECT id, barcode
FROM items
WHERE barcode IS NOT NULL
ON CONFLICT (barcode) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_item_barcodes_item_id
  ON item_barcodes (item_id);

-- ─── activity_log ───────────────────────────────────────────────────────────
-- Folds migrate_v3 + migrations 001 (volunteer_name) + 002 (volunteer_uid,
-- batch_id). item_id and batch_id are both ON DELETE SET NULL (live values).
CREATE TABLE IF NOT EXISTS activity_log (
  id             SERIAL PRIMARY KEY,
  item_id        INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name      TEXT NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('added', 'removed')),
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  volunteer_name TEXT,
  volunteer_uid  TEXT,
  batch_id       INTEGER REFERENCES item_batches(id) ON DELETE SET NULL
);

-- Guards in case activity_log pre-existed from migrate_v3 without these columns.
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS volunteer_name TEXT;
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS volunteer_uid TEXT;
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES item_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at
  ON activity_log (created_at DESC);

-- Indexes folded from migrations/007. item_id and batch_id back their
-- ON DELETE SET NULL FKs (avoids a full seq-scan on item/batch delete). The
-- partial index serves the volunteer-history query (action='added' +
-- created_at range, ordered by created_at DESC).
CREATE INDEX IF NOT EXISTS idx_activity_log_item_id
  ON activity_log (item_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_batch_id
  ON activity_log (batch_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_added_created_at
  ON activity_log (created_at DESC)
  WHERE action = 'added';

-- ─── volunteer_sessions ─────────────────────────────────────────────────────
-- One live session per owner (keyed by owner_uid). Folded from migration 003.
CREATE TABLE IF NOT EXISTS volunteer_sessions (
  owner_uid   TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_volunteer_sessions_expires_at
  ON volunteer_sessions (expires_at);

-- ─── active_volunteers ──────────────────────────────────────────────────────
-- One record per anonymous volunteer. `code` is intentionally NOT a foreign key
-- (see migration 003). Folded from migration 003.
CREATE TABLE IF NOT EXISTS active_volunteers (
  volunteer_uid TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  items_scanned INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_active_volunteers_code
  ON active_volunteers (code);

-- ─── categories name uniqueness ─────────────────────────────────────────────
-- Case-insensitive unique index on name (live value).
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name
  ON categories (LOWER(name));

-- ─── Seed: 15-category taxonomy ─────────────────────────────────────────────
-- Idempotent insert (matches create_tables.sql). No seed items.
INSERT INTO categories (name, parent_group, display_order)
SELECT seed.name, seed.parent_group, seed.display_order
FROM (
  VALUES
    ('Protein',                         'food',     1),
    ('Grains/Staples',                  'food',     2),
    ('Fruits and Vegetables',           'food',     3),
    ('Dairy',                           'food',     4),
    ('Frozen Foods',                    'food',     5),
    ('Meals/Prepared Foods',            'food',     6),
    ('Snacks',                          'food',     7),
    ('Breakfast Foods',                 'food',     8),
    ('Condiments & Cooking Essentials', 'food',     9),
    ('Specialty/Dietary Items',         'food',     10),
    ('Baby Items',                      'food',     11),
    ('Cleaning Supplies',               'non_food', 1),
    ('Personal Care',                   'non_food', 2),
    ('Paper Goods',                     'non_food', 3),
    ('Baby & Child',                    'non_food', 4)
) AS seed(name, parent_group, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM categories c
  WHERE LOWER(c.name) = LOWER(seed.name)
);
