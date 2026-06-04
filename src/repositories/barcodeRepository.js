import { pgPool } from '../config/database.js';

export const getBarcodeMapping = async (barcode) => {
  const query = 'SELECT custom_name FROM barcode_mappings WHERE barcode = $1';
  const result = await pgPool.query(query, [barcode]);
  return result.rows[0] || null;
};

export const getItemByBarcode = async (barcode) => {
  const query = `
    SELECT
      i.id,
      i.name,
      c.id AS category_id,
      c.name AS category_name
    FROM items i
    INNER JOIN item_barcodes ib ON ib.item_id = i.id
    LEFT JOIN categories c ON c.id = i.category_id
    WHERE ib.barcode = $1
    LIMIT 1;
  `;
  const result = await pgPool.query(query, [barcode]);
  return result.rows[0] || null;
};

export const createItemWithGeneratedBarcode = async ({
  barcode,
  name,
  categoryId,
}) => {
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');

    const categoryResult = await client.query(
      `
        SELECT id, name, parent_group, display_order
        FROM categories
        WHERE id = $1
        LIMIT 1;
      `,
      [categoryId]
    );

    const category = categoryResult.rows[0];
    if (!category) {
      const error = new Error('Category not found');
      error.code = 'CATEGORY_NOT_FOUND';
      throw error;
    }

    const existingItemResult = await client.query(
      `
        SELECT id, name, category_id, low_stock_threshold
        FROM items
        WHERE LOWER(name) = LOWER($1)
          AND category_id = $2
        LIMIT 1;
      `,
      [name, categoryId]
    );

    let item = existingItemResult.rows[0];
    if (!item) {
      const itemResult = await client.query(
        `
          INSERT INTO items (name, category_id, low_stock_threshold)
          VALUES ($1, $2, 20)
          RETURNING id, name, category_id, low_stock_threshold, created_at;
        `,
        [name, categoryId]
      );
      item = itemResult.rows[0];
    }

    await client.query(
      `
        INSERT INTO item_barcodes (item_id, barcode)
        VALUES ($1, $2);
      `,
      [item.id, barcode]
    );

    await client.query(
      `
        INSERT INTO barcode_mappings (barcode, custom_name)
        VALUES ($1, $2)
        ON CONFLICT (barcode) DO UPDATE SET
          custom_name = EXCLUDED.custom_name,
          updated_at = NOW();
      `,
      [barcode, name]
    );

    await client.query('COMMIT');

    return {
      id: item.id,
      barcode,
      name: item.name,
      category_id: category.id,
      category_name: category.name,
      parent_group: category.parent_group,
      total_quantity: 0,
      low_stock_threshold: Number(item.low_stock_threshold),
      status: 'out_of_stock',
      barcodes: [{ barcode }],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
