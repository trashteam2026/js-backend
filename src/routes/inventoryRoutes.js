import express from 'express';

import inventoryController from '../controllers/inventoryController.js';
import authMiddleware, { optionalAuth, requireOwner } from '../middleware/authMiddleware.js';

const router = express.Router();

// Volunteer scan-in read — token required (anonymous volunteers OK), not owner-only.
router.get('/categories', authMiddleware, inventoryController.listCategories);
router.post('/check-in', optionalAuth, inventoryController.checkIn);
router.post(
  '/check-out',
  authMiddleware,
  requireOwner,
  inventoryController.checkOut
);

export default router;
