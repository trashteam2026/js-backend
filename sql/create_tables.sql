-- Supabase / PostgreSQL
-- Run this in the Supabase SQL Editor (supabase.com -> project -> SQL Editor)

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

CREATE TABLE IF NOT EXISTS barcode_mappings (
  id          SERIAL PRIMARY KEY,
  barcode     VARCHAR(50) NOT NULL UNIQUE,
  custom_name VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  parent_group  TEXT NOT NULL CHECK (parent_group IN ('food', 'non_food')),
  display_order INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS item_batches (
  id              SERIAL PRIMARY KEY,
  item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  expiration_date DATE,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE items
ADD COLUMN IF NOT EXISTS barcode VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_barcode
ON items (barcode)
WHERE barcode IS NOT NULL;

CREATE TABLE IF NOT EXISTS item_barcodes (
  id         SERIAL PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  barcode    VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO item_barcodes (item_id, barcode)
SELECT id, barcode
FROM items
WHERE barcode IS NOT NULL
ON CONFLICT (barcode) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_item_barcodes_item_id
ON item_barcodes (item_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_batches_item_expiration
ON item_batches (item_id, expiration_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name
ON categories (LOWER(name));
