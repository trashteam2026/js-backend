import { pgPool } from '../config/database.js';

const parseItemId = (idParam) => {
  const id = Number.parseInt(idParam, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// Shared SELECT fragment: item with computed total_quantity and status
const ITEM_SELECT = `
  SELECT
    i.id,
    (
      SELECT ib.barcode
      FROM item_barcodes ib
      WHERE ib.item_id = i.id
      ORDER BY ib.created_at ASC, ib.id ASC
      LIMIT 1
    ) AS barcode,
    i.name,
    i.barcode,
    i.category_id,
    i.low_stock_threshold,
    i.created_at,
    c.name AS category_name,
    COALESCE(SUM(b.quantity), 0)::int AS total_quantity,
    MIN(b.expiration_date) FILTER (
      WHERE b.quantity > 0 AND b.expiration_date IS NOT NULL
    ) AS earliest_expiration,
    CASE
      WHEN COALESCE(SUM(b.quantity), 0) = 0                        THEN 'out_of_stock'
      WHEN COALESCE(SUM(b.quantity), 0) <= i.low_stock_threshold   THEN 'low_stock'
      ELSE 'normal'
    END AS status
  FROM items i
  LEFT JOIN categories c ON i.category_id = c.id
  LEFT JOIN item_batches b ON b.item_id = i.id
`;

const itemController = {
  async getAllItems(_req, res) {
    try {
      const { rows } = await pgPool.query(
        `${ITEM_SELECT}
         GROUP BY i.id, c.name
         ORDER BY i.name ASC`
      );
      res.status(200).json(rows);
    } catch (error) {
      console.error('Get items error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getItemById(req, res) {
    try {
      const itemId = parseItemId(req.params.id);
      if (!itemId) {
        return res.status(400).json({ error: 'Invalid item id' });
      }

      const { rows: itemRows } = await pgPool.query(
        `${ITEM_SELECT}
         WHERE i.id = $1
         GROUP BY i.id, c.name`,
        [itemId]
      );

      if (itemRows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      const { rows: batchRows } = await pgPool.query(
        `SELECT id, item_id, expiration_date, quantity, created_at
         FROM item_batches
         WHERE item_id = $1
         ORDER BY expiration_date ASC NULLS LAST, id ASC`,
        [itemId]
      );

      const { rows: barcodeRows } = await pgPool.query(
        `SELECT id, barcode, created_at
         FROM item_barcodes
         WHERE item_id = $1
         ORDER BY created_at ASC, id ASC`,
        [itemId]
      );

      res.status(200).json({
        ...itemRows[0],
        batches: batchRows,
        barcodes: barcodeRows,
      });
    } catch (error) {
      console.error('Get item by id error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async createItem(req, res) {
    try {
      const name = req.body.name?.trim();
      const { category_id, low_stock_threshold = 20 } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Item name is required' });
      }

      const { rows } = await pgPool.query(
        `INSERT INTO items (name, category_id, low_stock_threshold)
         VALUES ($1, $2, $3) RETURNING *`,
        [name, category_id || null, low_stock_threshold]
      );

      res.status(201).json({
        ...rows[0],
        category_name: null,
        total_quantity: 0,
        status: 'out_of_stock',
        batches: [],
      });
    } catch (error) {
      console.error('Create item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async updateItem(req, res) {
    try {
      const itemId = parseItemId(req.params.id);
      if (!itemId) {
        return res.status(400).json({ error: 'Invalid item id' });
      }

      const { name: rawName, category_id, low_stock_threshold } = req.body;
      const name = rawName?.trim();

      if (name !== undefined && !name) {
        return res.status(400).json({ error: 'Item name cannot be empty' });
      }

      const updates = [];
      const values = [];
      let idx = 1;

      if (name !== undefined) {
        updates.push(`name=$${idx++}`);
        values.push(name);
      }
      if (category_id !== undefined) {
        updates.push(`category_id=$${idx++}`);
        values.push(category_id || null);
      }
      if (low_stock_threshold !== undefined) {
        updates.push(`low_stock_threshold=$${idx++}`);
        values.push(low_stock_threshold);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(itemId);
      const { rowCount } = await pgPool.query(
        `UPDATE items SET ${updates.join(', ')} WHERE id=$${idx}`,
        values
      );

      if (rowCount === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      const { rows } = await pgPool.query(
        `${ITEM_SELECT}
         WHERE i.id = $1
         GROUP BY i.id, c.name`,
        [itemId]
      );

      res.status(200).json(rows[0]);
    } catch (error) {
      console.error('Update item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async deleteItem(req, res) {
    try {
      const itemId = parseItemId(req.params.id);
      if (!itemId) {
        return res.status(400).json({ error: 'Invalid item id' });
      }

      const { rows } = await pgPool.query(
        `DELETE FROM items WHERE id=$1 RETURNING id`,
        [itemId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      res.status(200).json({ message: 'Item deleted successfully' });
    } catch (error) {
      console.error('Delete item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

export default itemController;
