import { pgPool } from '../config/database.js';

const parseItemId = (idParam) => {
  const id = Number.parseInt(idParam, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const itemController = {
  async getAllItems(_req, res) {
    try {
      const { rows } = await pgPool.query(
        `SELECT i.*, c.name AS category_name
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id`
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

      const { rows } = await pgPool.query(
        `SELECT i.*, c.name AS category_name
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.id = $1`,
        [itemId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      res.status(200).json(rows[0]);
    } catch (error) {
      console.error('Get item by id error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async createItem(req, res) {
    try {
      const name = req.body.name?.trim();
      const { category_id, expiration_date, quantity } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Item name is required' });
      }
      if (!quantity || quantity < 0) {
        return res.status(400).json({ error: 'Valid quantity is required' });
      }

      const { rows } = await pgPool.query(
        `INSERT INTO items (name, category_id, expiration_date, quantity)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, category_id, expiration_date, quantity]
      );

      res.status(201).json(rows[0]);
    } catch (error) {
      console.error('Create item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async updateItem(req, res) {
    try {
      const itemId = parseItemId(req.params.id);
      const name = req.body.name?.trim();
      const { category_id, expiration_date, quantity } = req.body;

      if (!itemId) {
        return res.status(400).json({ error: 'Invalid item id' });
      }
      if (!name) {
        return res.status(400).json({ error: 'Item name is required' });
      }
      if (!quantity || quantity < 0) {
        return res.status(400).json({ error: 'Valid quantity is required' });
      }

      const { rows } = await pgPool.query(
        `UPDATE items
         SET name=$1, category_id=$2, expiration_date=$3, quantity=$4
         WHERE id=$5 RETURNING *`,
        [name, category_id, expiration_date, quantity, itemId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

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