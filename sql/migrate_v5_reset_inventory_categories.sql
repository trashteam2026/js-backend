-- Migration v5: Reset inventory items and replace category taxonomy
-- Run this in the Supabase SQL Editor after migrate_v4.sql

DELETE FROM item_batches;
DELETE FROM item_barcodes;
DELETE FROM items;
DELETE FROM categories;

ALTER SEQUENCE item_batches_id_seq RESTART WITH 1;
ALTER SEQUENCE item_barcodes_id_seq RESTART WITH 1;
ALTER SEQUENCE items_id_seq RESTART WITH 1;
ALTER SEQUENCE categories_id_seq RESTART WITH 1;

INSERT INTO categories (id, name, parent_group, display_order) VALUES
  (1,  'Protein',                         'food',     1),
  (2,  'Grains/Staples',                  'food',     2),
  (3,  'Fruits and Vegetables',           'food',     3),
  (4,  'Dairy',                           'food',     4),
  (5,  'Frozen Foods',                    'food',     5),
  (6,  'Meals/Prepared Foods',            'food',     6),
  (7,  'Snacks',                          'food',     7),
  (8,  'Breakfast Foods',                 'food',     8),
  (9,  'Condiments & Cooking Essentials', 'food',     9),
  (10, 'Specialty/Dietary Items',         'food',     10),
  (11, 'Baby Items',                      'food',     11),
  (12, 'Cleaning Supplies',               'non_food', 1),
  (13, 'Personal Care',                   'non_food', 2),
  (14, 'Paper Goods',                     'non_food', 3),
  (15, 'Baby & Child',                    'non_food', 4);

SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));
