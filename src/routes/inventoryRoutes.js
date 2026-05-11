import express from 'express';

import inventoryController from '../controllers/inventoryController.js';

const router = express.Router();

router.get('/categories', inventoryController.listCategories);
router.post('/categories', inventoryController.createCategory);
router.get('/items/:itemId', inventoryController.getItemDetail);
router.post('/check-in', inventoryController.checkIn);

export default router;
