import { pgPool } from '../config/database.js';

export const getBarcodeMapping = async (barcode) => {
  const query = 'SELECT custom_name FROM barcode_mappings WHERE barcode = $1';
  const result = await pgPool.query(query, [barcode]);
  return result.rows[0] || null;
};

export const getItemByBarcode = async (barcode) => {
  const query = `
    SELECT id, name FROM items WHERE barcode = $1 LIMIT 1;
  `;
  const result = await pgPool.query(query, [barcode]);
  return result.rows[0] || null;
};

export const setBarcodeMapping = async (barcode, customName) => {
  const query = `
    INSERT INTO barcode_mappings (barcode, custom_name)
    VALUES ($1, $2)
    ON CONFLICT (barcode) DO UPDATE SET
      custom_name = EXCLUDED.custom_name,
      updated_at = NOW()
    RETURNING *;
  `;
  const result = await pgPool.query(query, [barcode, customName]);
  return result.rows[0];
};
