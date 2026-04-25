-- Migration v2: Restructure items into items + item_batches
-- Run this in the Supabase SQL Editor (supabase.com → project → SQL Editor)

-- 1. Add parent_group and display_order to categories
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_group TEXT NOT NULL DEFAULT 'food'
    CHECK (parent_group IN ('food', 'non_food')),
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- 2. Drop old items table (had expiration_date + quantity directly on item)
DROP TABLE IF EXISTS item_batches;
DROP TABLE IF EXISTS items;

-- 3. New items table: master record with low_stock_threshold
CREATE TABLE items (
  id                  SERIAL PRIMARY KEY,
  name                TEXT    NOT NULL,
  category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  low_stock_threshold INTEGER NOT NULL DEFAULT 20,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 4. item_batches: tracks individual batches with expiration dates
CREATE TABLE item_batches (
  id              SERIAL  PRIMARY KEY,
  item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  expiration_date DATE,
  quantity        INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Seed categories ──────────────────────────────────────────────────────────
INSERT INTO categories (id, name, parent_group, display_order) VALUES
  (1,  'Dairy',                          'food',     1),
  (2,  'Canned Fruits and Vegetables',   'food',     2),
  (3,  'Canned Meat',                    'food',     3),
  (4,  'Pasta',                          'food',     4),
  (5,  'Soup',                           'food',     5),
  (6,  'Cooking Oil',                    'food',     6),
  (7,  'Tree Nuts',                      'food',     7),
  (8,  'Shellfish',                      'food',     8),
  (9,  'Cleaning Supplies',              'non_food', 1),
  (10, 'Household Goods',               'non_food', 2)
ON CONFLICT (name) DO UPDATE SET
  parent_group  = EXCLUDED.parent_group,
  display_order = EXCLUDED.display_order;

SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));

-- ─── Seed items ───────────────────────────────────────────────────────────────
INSERT INTO items (id, name, category_id, low_stock_threshold) VALUES
  (1,  'Cottage Cheese',        1,  20),
  (2,  'Eggs',                  1,  20),
  (3,  'Milk',                  1,  50),
  (4,  'Canned Corn',           2,  30),
  (5,  'Black Beans',           2,  30),
  (6,  'Canned Broccoli',       2,  20),
  (7,  'Canned Beef',           3,  20),
  (8,  'Angel Hair Pasta',      4,  30),
  (9,  'Penne Pasta',           4,  30),
  (10, 'Chicken Noodle Soup',   5,  50),
  (11, 'Tomato Soup',           5,  50),
  (12, 'Alfredo Sauce',         4,  20),
  (13, 'Kleenex Tissue Boxes',  9,  10),
  (14, 'Beef Jerky',            3,  15),
  (15, 'Bananas',               2,  30),
  (16, 'Bacon',                 1,  20);

SELECT setval('items_id_seq', (SELECT MAX(id) FROM items));

-- ─── Seed item_batches ────────────────────────────────────────────────────────
INSERT INTO item_batches (item_id, expiration_date, quantity) VALUES
  -- Cottage Cheese (id=1): expired stock, qty 0
  (1,  '2026-03-01', 0),
  -- Eggs (id=2): spread across 2026
  (2,  '2026-01-01', 22),
  (2,  '2026-02-01', 22),
  (2,  '2026-03-01', 22),
  (2,  '2026-04-01', 0),
  (2,  '2026-05-01', 0),
  (2,  '2026-06-01', 22),
  (2,  '2026-07-01', 22),
  (2,  '2026-08-01', 22),
  (2,  '2026-09-01', 22),
  (2,  '2026-10-01', 22),
  (2,  '2026-11-01', 22),
  (2,  '2026-12-01', 0),
  -- Milk (id=3)
  (3,  '2026-06-01', 15),
  -- Canned Corn (id=4)
  (4,  '2027-01-01', 100),
  -- Black Beans (id=5)
  (5,  '2027-08-01', 45),
  -- Angel Hair Pasta (id=8)
  (8,  '2027-04-01', 67),
  -- Penne Pasta (id=9)
  (9,  '2027-03-01', 23),
  -- Chicken Noodle Soup (id=10)
  (10, '2027-05-01', 234),
  (10, '2027-12-01', 389),
  -- Tomato Soup (id=11)
  (11, '2026-03-01', 43),
  (11, '2027-06-01', 120),
  -- Alfredo Sauce (id=12)
  (12, '2027-05-01', 42),
  -- Kleenex (id=13): no expiration
  (13, NULL, 35);
