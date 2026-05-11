import { pgPool } from '../config/database.js';

const parseId = (idParam) => {
  const id = Number.parseInt(idParam, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

async function logActivity(itemId, itemName, action, quantity) {
  if (quantity <= 0) return;
  await pgPool.query(
    `INSERT INTO activity_log (item_id, item_name, action, quantity) VALUES ($1, $2, $3, $4)`,
    [itemId, itemName, action, quantity]
  );
}

const batchController = {
  async createBatch(req, res) {
    try {
      const itemId = parseId(req.params.itemId);
      if (!itemId) {
        return res.status(400).json({ error: 'Invalid item id' });
      }

      const { expiration_date, quantity = 0 } = req.body;

      if (typeof quantity !== 'number' || quantity < 0) {
        return res.status(400).json({ error: 'Quantity must be a non-negative number' });
      }

      const { rows: itemRows } = await pgPool.query(
        `SELECT id, name FROM items WHERE id = $1`,
        [itemId]
      );
      if (itemRows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      const { rows } = await pgPool.query(
        `INSERT INTO item_batches (item_id, expiration_date, quantity)
         VALUES ($1, $2, $3) RETURNING *`,
        [itemId, expiration_date || null, quantity]
      );

      await logActivity(itemId, itemRows[0].name, 'added', quantity);

      res.status(201).json(rows[0]);
    } catch (error) {
      console.error('Create batch error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async updateBatch(req, res) {
    try {
      const itemId = parseId(req.params.itemId);
      const batchId = parseId(req.params.batchId);

      if (!itemId || !batchId) {
        return res.status(400).json({ error: 'Invalid id' });
      }

      const { expiration_date, quantity } = req.body;

      if (quantity !== undefined && (typeof quantity !== 'number' || quantity < 0)) {
        return res.status(400).json({ error: 'Quantity must be a non-negative number' });
      }

      // Fetch current batch + item name before updating
      const { rows: currentRows } = await pgPool.query(
        `SELECT b.quantity, i.name AS item_name
         FROM item_batches b
         JOIN items i ON i.id = b.item_id
         WHERE b.id = $1 AND b.item_id = $2`,
        [batchId, itemId]
      );
      if (currentRows.length === 0) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      const updates = [];
      const values = [];
      let idx = 1;

      if (expiration_date !== undefined) {
        updates.push(`expiration_date=$${idx++}`);
        values.push(expiration_date || null);
      }
      if (quantity !== undefined) {
        updates.push(`quantity=$${idx++}`);
        values.push(quantity);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(batchId, itemId);
      const { rows } = await pgPool.query(
        `UPDATE item_batches
         SET ${updates.join(', ')}
         WHERE id=$${idx} AND item_id=$${idx + 1}
         RETURNING *`,
        values
      );

      if (quantity !== undefined) {
        const delta = quantity - currentRows[0].quantity;
        if (delta > 0) {
          await logActivity(itemId, currentRows[0].item_name, 'added', delta);
        } else if (delta < 0) {
          await logActivity(itemId, currentRows[0].item_name, 'removed', -delta);
        }
      }

      res.status(200).json(rows[0]);
    } catch (error) {
      console.error('Update batch error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async deleteBatch(req, res) {
    try {
      const itemId = parseId(req.params.itemId);
      const batchId = parseId(req.params.batchId);

      if (!itemId || !batchId) {
        return res.status(400).json({ error: 'Invalid id' });
      }

      // Fetch batch quantity + item name before deleting
      const { rows: currentRows } = await pgPool.query(
        `SELECT b.quantity, i.name AS item_name
         FROM item_batches b
         JOIN items i ON i.id = b.item_id
         WHERE b.id = $1 AND b.item_id = $2`,
        [batchId, itemId]
      );
      if (currentRows.length === 0) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      await pgPool.query(
        `DELETE FROM item_batches WHERE id=$1 AND item_id=$2`,
        [batchId, itemId]
      );

      await logActivity(itemId, currentRows[0].item_name, 'removed', currentRows[0].quantity);

      res.status(200).json({ message: 'Batch deleted successfully' });
    } catch (error) {
      console.error('Delete batch error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

export default batchController;
