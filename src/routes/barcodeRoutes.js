import express from 'express';

import {
  generateBarcode,
  lookupBarcode,
  setCustomName,
} from '../controllers/barcodeController.js';
import authMiddleware, { requireOwner } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/lookup', lookupBarcode);
router.post('/generate', authMiddleware, requireOwner, generateBarcode);
router.post('/set-custom', setCustomName);

export default router;
