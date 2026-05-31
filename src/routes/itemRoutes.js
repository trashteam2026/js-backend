import { Router } from 'express';

import batchController from '../controllers/batchController.js';
import itemController from '../controllers/itemController.js';
import authMiddleware, { requireOwner } from '../middleware/authMiddleware.js';

const router = Router();

// Item CRUD — reads are owner-only, mutations are owner-only.
router.get('/', authMiddleware, requireOwner, itemController.getAllItems);
router.get('/:id', authMiddleware, requireOwner, itemController.getItemById);
router.post('/', authMiddleware, requireOwner, itemController.createItem);
router.put('/:id', authMiddleware, requireOwner, itemController.updateItem);
router.delete('/:id', authMiddleware, requireOwner, itemController.deleteItem);

// Batch CRUD (nested under item) — owner-only.
router.post(
  '/:itemId/batches',
  authMiddleware,
  requireOwner,
  batchController.createBatch
);
router.put(
  '/:itemId/batches/:batchId',
  authMiddleware,
  requireOwner,
  batchController.updateBatch
);
router.delete(
  '/:itemId/batches/:batchId',
  authMiddleware,
  requireOwner,
  batchController.deleteBatch
);

export default router;
