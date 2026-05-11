import express from 'express';

import {
  lookupBarcode,
  setCustomName,
} from '../controllers/barcodeController.js';

const router = express.Router();

router.post('/lookup', lookupBarcode);
router.post('/set-custom', setCustomName);

export default router;
