-- Migration v4: Allow multiple barcodes per item
-- Run this in the Supabase SQL Editor

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
