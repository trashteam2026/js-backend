import express from 'express';

import inventoryController from '../controllers/inventoryController.js';
import authMiddleware, { requireOwner } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/categories', inventoryController.listCategories);
router.post('/categories', inventoryController.createCategory);
router.get('/items/:itemId', inventoryController.getItemDetail);
router.post('/check-in', inventoryController.checkIn);
router.post(
  '/check-out',
  authMiddleware,
  requireOwner,
  inventoryController.checkOut
);

export default router;
