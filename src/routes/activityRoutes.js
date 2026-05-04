import { Router } from 'express';

import activityController from '../controllers/activityController.js';

const router = Router();

router.get('/', activityController.getLogs);

export default router;
