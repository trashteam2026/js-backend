import { pgPool } from '../config/database.js';

const parseCategoryId = (idParam) => {
  const id = Number.parseInt(idParam, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const categoriesController = {
  async getAllCategories(_req, res) {
    try {
      const { rows } = await pgPool.query(
        `SELECT id, name, parent_group, display_order, created_at AS "createdAt"
         FROM categories
         ORDER BY display_order ASC, name ASC`
      );

      res.status(200).json(rows);
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getCategoryById(req, res) {
    try {
      const categoryId = parseCategoryId(req.params.id);

      if (!categoryId) {
        return res.status(400).json({ error: 'Invalid category id' });
      }

      const { rows } = await pgPool.query(
        `SELECT id, name, created_at AS "createdAt"
         FROM categories
         WHERE id = $1`,
        [categoryId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.status(200).json(rows[0]);
    } catch (error) {
      console.error('Get category by id error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async createCategory(req, res) {
    try {
      const name = req.body.name?.trim();
      const { parent_group = 'food' } = req.body;
      let { display_order } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Category name is required' });
      }
      if (!['food', 'non_food'].includes(parent_group)) {
        return res.status(400).json({ error: 'parent_group must be food or non_food' });
      }

      // When the caller doesn't specify an order, place the new category at the
      // bottom of its parent group instead of defaulting to 0 (which would sort
      // it above the seeded categories).
      if (display_order === undefined || display_order === null) {
        const { rows: orderRows } = await pgPool.query(
          `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
           FROM categories
           WHERE parent_group = $1`,
          [parent_group]
        );
        display_order = orderRows[0].next_order;
      }

      const { rows } = await pgPool.query(
        `INSERT INTO categories (name, parent_group, display_order)
         VALUES ($1, $2, $3)
         RETURNING id, name, parent_group, display_order, created_at AS "createdAt"`,
        [name, parent_group, display_order]
      );

      res.status(201).json(rows[0]);
    } catch (error) {
      console.error('Create category error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async updateCategory(req, res) {
    try {
      const categoryId = parseCategoryId(req.params.id);
      const name = req.body.name?.trim();

      if (!categoryId) {
        return res.status(400).json({ error: 'Invalid category id' });
      }
      if (!name) {
        return res.status(400).json({ error: 'Category name is required' });
      }

      const { rows } = await pgPool.query(
        `UPDATE categories
         SET name = $1
         WHERE id = $2
         RETURNING id, name, created_at AS "createdAt"`,
        [name, categoryId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.status(200).json(rows[0]);
    } catch (error) {
      console.error('Update category error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async deleteCategory(req, res) {
    const client = await pgPool.connect();

    try {
      const categoryId = parseCategoryId(req.params.id);

      if (!categoryId) {
        return res.status(400).json({ error: 'Invalid category id' });
      }

      await client.query('BEGIN');

      const { rows: categoryRows } = await client.query(
        `SELECT id
         FROM categories
         WHERE id = $1`,
        [categoryId]
      );

      if (categoryRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Category not found' });
      }

      const { rows: itemRows } = await client.query(
        `SELECT
           i.id,
           i.name,
           COALESCE(SUM(b.quantity), 0)::int AS total_quantity
         FROM items i
         LEFT JOIN item_batches b ON b.item_id = i.id
         WHERE i.category_id = $1
         GROUP BY i.id`,
        [categoryId]
      );

      for (const item of itemRows) {
        if (item.total_quantity > 0) {
          await client.query(
            `INSERT INTO activity_log (item_id, item_name, action, quantity)
             VALUES ($1, $2, 'removed', $3)`,
            [item.id, item.name, item.total_quantity]
          );
        }
      }

      await client.query(
        `DELETE FROM items
         WHERE category_id = $1`,
        [categoryId]
      );

      await client.query(
        `DELETE FROM categories
         WHERE id = $1
         RETURNING id`,
        [categoryId]
      );

      await client.query('COMMIT');

      res.status(200).json({
        message: 'Category deleted successfully',
        deletedItemCount: itemRows.length,
        loggedItemCount: itemRows.filter((item) => item.total_quantity > 0)
          .length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Delete category error:', error);
      if (error.code === '23503') {
        return res.status(409).json({
          error: 'Cannot delete category with related items',
        });
      }
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  },
};

export default categoriesController;
