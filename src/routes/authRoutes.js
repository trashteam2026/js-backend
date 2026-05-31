import express from 'express';

import authController from '../controllers/authController.js';
import authMiddleware, { requireOwner } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', authController.signup);
router.get('/profile', authController.getMe);
router.get('/users', authMiddleware, requireOwner, authController.getAllUsers);
router.post('/token', authController.handleToken);

export default router;
