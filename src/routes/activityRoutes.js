import { Router } from 'express';

import activityController from '../controllers/activityController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', activityController.getLogs);
router.patch('/:id', authMiddleware, activityController.updateLog);
router.delete('/:id', authMiddleware, activityController.deleteLog);

export default router;
