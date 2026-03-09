import { pgPool } from '../config/database.js';

const parseCategoryId = (idParam) => {
  const id = Number.parseInt(idParam, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const categoriesController = {
  async getAllCategories(_req, res) {
    try {
      const { rows } = await pgPool.query(
        `SELECT id, name, created_at AS "createdAt"
         FROM categories
         ORDER BY name ASC`
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

      if (!name) {
        return res.status(400).json({ error: 'Category name is required' });
      }

      const { rows } = await pgPool.query(
        `INSERT INTO categories (name)
         VALUES ($1)
         RETURNING id, name, created_at AS "createdAt"`,
        [name]
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
    try {
      const categoryId = parseCategoryId(req.params.id);

      if (!categoryId) {
        return res.status(400).json({ error: 'Invalid category id' });
      }

      const { rows } = await pgPool.query(
        `DELETE FROM categories
         WHERE id = $1
         RETURNING id`,
        [categoryId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.status(200).json({ message: 'Category deleted successfully' });
    } catch (error) {
      console.error('Delete category error:', error);
      if (error.code === '23503') {
        return res.status(409).json({
          error: 'Cannot delete category with related items',
        });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

export default categoriesController;
