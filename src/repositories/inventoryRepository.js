import { pgPool } from '../config/database.js';

const INVENTORY_SELECT = `
  SELECT
    i.id,
    i.barcode,
    i.name,
    i.low_stock_threshold,
    i.created_at,
    c.id AS category_id,
    c.name AS category_name,
    c.parent_group,
    c.display_order,
    COALESCE(SUM(b.quantity), 0) AS total_quantity
  FROM items i
  LEFT JOIN categories c ON c.id = i.category_id
  LEFT JOIN item_batches b ON b.item_id = i.id
`;

const normalizeOptionalBarcode = (barcode) => {
  if (typeof barcode !== 'string') {
    return null;
  }

  const trimmed = barcode.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildInventoryStatus = (totalQuantity, lowStockThreshold) => {
  if (totalQuantity <= 0) {
    return 'out_of_stock';
  }

  if (totalQuantity <= lowStockThreshold) {
    return 'low_stock';
  }

  return 'normal';
};

const mapItemSummary = (row) => {
  const totalQuantity = Number(row.total_quantity);
  const lowStockThreshold = Number(row.low_stock_threshold);

  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    total_quantity: totalQuantity,
    low_stock_threshold: lowStockThreshold,
    status: buildInventoryStatus(totalQuantity, lowStockThreshold),
  };
};

export const getCategoriesWithItems = async (parentGroup) => {
  const values = [];
  let whereClause = '';

  if (parentGroup) {
    values.push(parentGroup);
    whereClause = 'WHERE c.parent_group = $1';
  }

  const categoryQuery = `
    SELECT
      c.id,
      c.name,
      c.parent_group,
      c.display_order
    FROM categories c
    ${whereClause}
    ORDER BY c.parent_group ASC, c.display_order ASC, c.name ASC;
  `;

  const itemQuery = `
    ${INVENTORY_SELECT}
    ${whereClause}
    GROUP BY
      i.id,
      c.id,
      c.name,
      c.parent_group,
      c.display_order
    ORDER BY LOWER(i.name) ASC;
  `;

  const [categoriesResult, itemsResult] = await Promise.all([
    pgPool.query(categoryQuery, values),
    pgPool.query(itemQuery, values),
  ]);

  const itemsByCategoryId = new Map();
  for (const row of itemsResult.rows) {
    if (!row.category_id) {
      continue;
    }

    const existingItems = itemsByCategoryId.get(row.category_id) || [];
    existingItems.push(mapItemSummary(row));
    itemsByCategoryId.set(row.category_id, existingItems);
  }

  return categoriesResult.rows.map((category) => ({
    id: category.id,
    name: category.name,
    parent_group: category.parent_group,
    display_order: category.display_order,
    items: itemsByCategoryId.get(category.id) || [],
  }));
};

export const createCategory = async ({
  name,
  parentGroup,
  displayOrder,
}) => {
  const query = `
    INSERT INTO categories (name, parent_group, display_order)
    VALUES ($1, $2, $3)
    RETURNING id, name, parent_group, display_order;
  `;

  const { rows } = await pgPool.query(query, [name, parentGroup, displayOrder]);
  return rows[0];
};

export const getItemDetailById = async (itemId) => {
  const itemQuery = `
    ${INVENTORY_SELECT}
    WHERE i.id = $1
    GROUP BY
      i.id,
      c.id,
      c.name,
      c.parent_group,
      c.display_order;
  `;

  const batchesQuery = `
    SELECT id, expiration_date, quantity
    FROM item_batches
    WHERE item_id = $1
    ORDER BY expiration_date ASC NULLS LAST, id ASC;
  `;

  const [itemResult, batchesResult] = await Promise.all([
    pgPool.query(itemQuery, [itemId]),
    pgPool.query(batchesQuery, [itemId]),
  ]);

  const row = itemResult.rows[0];
  if (!row) {
    return null;
  }

  const totalQuantity = Number(row.total_quantity);
  const lowStockThreshold = Number(row.low_stock_threshold);

  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    category: row.category_id
      ? {
          id: row.category_id,
          name: row.category_name,
          parent_group: row.parent_group,
          display_order: row.display_order,
        }
      : null,
    total_quantity: totalQuantity,
    low_stock_threshold: lowStockThreshold,
    status: buildInventoryStatus(totalQuantity, lowStockThreshold),
    batches: batchesResult.rows.map((batch) => ({
      id: batch.id,
      expiration_date: batch.expiration_date,
      quantity: Number(batch.quantity),
    })),
  };
};

export const checkInInventoryItem = async ({
  barcode,
  name,
  expirationDate,
  quantity,
  categoryId = null,
  lowStockThreshold = 10,
}) => {
  const client = await pgPool.connect();
  const normalizedBarcode = normalizeOptionalBarcode(barcode);

  try {
    await client.query('BEGIN');

    let item;

    if (normalizedBarcode) {
      const existingItemResult = await client.query(
        `
          SELECT id, barcode, name, category_id, low_stock_threshold
          FROM items
          WHERE barcode = $1
          LIMIT 1;
        `,
        [normalizedBarcode]
      );

      if (existingItemResult.rows[0]) {
        const itemResult = await client.query(
          `
          UPDATE items
          SET
            name = $2,
            category_id = COALESCE($3, category_id),
            low_stock_threshold = $4
          WHERE barcode = $1
          RETURNING id, barcode, name, category_id, low_stock_threshold;
        `,
          [normalizedBarcode, name, categoryId, lowStockThreshold]
        );
        item = itemResult.rows[0];
      } else {
        const itemResult = await client.query(
          `
            INSERT INTO items (barcode, name, category_id, low_stock_threshold)
            VALUES ($1, $2, $3, $4)
            RETURNING id, barcode, name, category_id, low_stock_threshold;
          `,
          [normalizedBarcode, name, categoryId, lowStockThreshold]
        );
        item = itemResult.rows[0];
      }
    } else {
      // When there is no barcode, we still avoid duplicate catalog rows by
      // reusing an item with the same name/category combination if one exists.
      const existingItemResult = await client.query(
        `
          SELECT id, barcode, name, category_id, low_stock_threshold
          FROM items
          WHERE LOWER(name) = LOWER($1)
            AND category_id IS NOT DISTINCT FROM $2
          LIMIT 1;
        `,
        [name, categoryId]
      );

      if (existingItemResult.rows[0]) {
        item = existingItemResult.rows[0];
      } else {
        const newItemResult = await client.query(
          `
            INSERT INTO items (barcode, name, category_id, low_stock_threshold)
            VALUES (NULL, $1, $2, $3)
            RETURNING id, barcode, name, category_id, low_stock_threshold;
          `,
          [name, categoryId, lowStockThreshold]
        );
        item = newItemResult.rows[0];
      }
    }

    const batchResult = await client.query(
      `
        INSERT INTO item_batches (item_id, expiration_date, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (item_id, expiration_date) DO UPDATE SET
          quantity = item_batches.quantity + EXCLUDED.quantity
        RETURNING id, item_id, expiration_date, quantity;
      `,
      [item.id, expirationDate, quantity]
    );

    await client.query('COMMIT');

    return {
      item,
      batch: {
        id: batchResult.rows[0].id,
        item_id: batchResult.rows[0].item_id,
        expiration_date: batchResult.rows[0].expiration_date,
        quantity: Number(batchResult.rows[0].quantity),
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const checkOutInventoryItem = async ({ barcode, itemId, quantity }) => {
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');

    let itemRow;
    if (itemId) {
      const result = await client.query(
        `SELECT id, name FROM items WHERE id = $1 LIMIT 1;`,
        [itemId]
      );
      itemRow = result.rows[0];
      if (!itemRow) {
        const err = new Error('Item not found');
        err.code = 'ITEM_NOT_FOUND';
        throw err;
      }
    } else {
      const result = await client.query(
        `SELECT id, name FROM items WHERE barcode = $1 LIMIT 1;`,
        [barcode]
      );
      itemRow = result.rows[0];
      if (!itemRow) {
        const err = new Error('No item registered for this barcode');
        err.code = 'BARCODE_NOT_FOUND';
        err.barcode = barcode;
        throw err;
      }
    }

    // FOR UPDATE locks the matched batch rows for the duration of this
    // transaction so a concurrent checkout cannot read the same stock and
    // double-decrement it.
    const batchesResult = await client.query(
      `SELECT id, expiration_date, quantity
         FROM item_batches
        WHERE item_id = $1
        ORDER BY expiration_date ASC NULLS LAST, id ASC
        FOR UPDATE;`,
      [itemRow.id]
    );

    const available = batchesResult.rows.reduce(
      (sum, row) => sum + Number(row.quantity),
      0
    );

    if (available < quantity) {
      const err = new Error('Insufficient stock');
      err.code = 'INSUFFICIENT_STOCK';
      err.requested = quantity;
      err.available = available;
      throw err;
    }

    let remaining = quantity;
    const batchesAffected = [];

    for (const batch of batchesResult.rows) {
      if (remaining === 0) break;

      const batchQty = Number(batch.quantity);
      if (batchQty === 0) continue;

      const take = Math.min(batchQty, remaining);
      const newQty = batchQty - take;
      remaining -= take;

      if (newQty === 0) {
        await client.query(`DELETE FROM item_batches WHERE id = $1;`, [
          batch.id,
        ]);
      } else {
        await client.query(
          `UPDATE item_batches SET quantity = $1 WHERE id = $2;`,
          [newQty, batch.id]
        );
      }

      batchesAffected.push({
        id: batch.id,
        expiration_date: batch.expiration_date,
        quantity_removed: take,
        remaining: newQty,
      });
    }

    await client.query(
      `INSERT INTO activity_log (item_id, item_name, action, quantity)
       VALUES ($1, $2, 'removed', $3);`,
      [itemRow.id, itemRow.name, quantity]
    );

    await client.query('COMMIT');

    return {
      item: itemRow,
      removed: quantity,
      batchesAffected,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
