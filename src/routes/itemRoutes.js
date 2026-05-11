import { Router } from 'express';

import batchController from '../controllers/batchController.js';
import itemController from '../controllers/itemController.js';

const router = Router();

// Item CRUD
router.get('/', itemController.getAllItems);
router.get('/:id', itemController.getItemById);
router.post('/', itemController.createItem);
router.put('/:id', itemController.updateItem);
router.delete('/:id', itemController.deleteItem);

// Batch CRUD (nested under item)
router.post('/:itemId/batches', batchController.createBatch);
router.put('/:itemId/batches/:batchId', batchController.updateBatch);
router.delete('/:itemId/batches/:batchId', batchController.deleteBatch);

export default router;
