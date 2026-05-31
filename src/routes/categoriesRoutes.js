import express from 'express';

import categoriesController from '../controllers/categories.js';
import authMiddleware, { requireOwner } from '../middleware/authMiddleware.js';

const router = express.Router();

// Reads and mutations are all owner-only. (Volunteers read categories via
// GET /api/inventory/categories, which is token-only.)
router.get('/', authMiddleware, requireOwner, categoriesController.getAllCategories);
router.get('/:id', authMiddleware, requireOwner, categoriesController.getCategoryById);
router.post('/', authMiddleware, requireOwner, categoriesController.createCategory);
router.put('/:id', authMiddleware, requireOwner, categoriesController.updateCategory);
router.delete('/:id', authMiddleware, requireOwner, categoriesController.deleteCategory);

export default router;
