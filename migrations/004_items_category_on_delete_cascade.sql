-- Change the items.category_id foreign key from ON DELETE SET NULL to
-- ON DELETE CASCADE.
--
-- Deleting a category through the app UI already deletes its items, but the DB
-- constraint was ON DELETE SET NULL. So deleting a category row directly (e.g.
-- in the Supabase SQL editor) left its items behind with category_id = NULL.
-- Those orphans vanished from the category-grouped inventory UI yet stayed in
-- the DB and remained scan-out-able by barcode. CASCADE makes a direct
-- category-row delete remove its items too, matching the app's behavior.
--
-- Run this in the Supabase SQL Editor. Safe to run multiple times.

-- 1. Drop the existing foreign key on items.category_id, whatever its name.
--    The inline constraint in create_tables.sql is auto-named
--    `items_category_id_fkey` by Postgres, but we look the name up from the
--    catalog so this works even if it was created/renamed differently.
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT con.conname
  INTO fk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum = ANY (con.conkey)
  WHERE con.contype = 'f'
    AND rel.relname = 'items'
    AND att.attname = 'category_id';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE items DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

-- 2. Re-add it with ON DELETE CASCADE.
ALTER TABLE items
  ADD CONSTRAINT items_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
