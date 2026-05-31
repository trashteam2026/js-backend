import { Router } from 'express';

import authMiddleware, { requireOwner } from '../middleware/authMiddleware.js';
import {
  endSession,
  finishVolunteering,
  generateSession,
  getActiveVolunteers,
  getMyProfile,
  getSession,
  getVolunteerStats,
  registerVolunteer,
  verifyCode,
} from '../controllers/volunteerController.js';

const router = Router();

// Owner session management
router.get('/session', authMiddleware, requireOwner, getSession);
router.post('/session', authMiddleware, requireOwner, generateSession);
router.delete('/session', authMiddleware, requireOwner, endSession);

// Public code verification (no auth required)
router.post('/verify', verifyCode);

// Volunteer self-registration + profile (any authenticated user, including anonymous)
router.post('/register', authMiddleware, registerVolunteer);
router.get('/me', authMiddleware, getMyProfile);
router.delete('/me', authMiddleware, finishVolunteering);

// Owner volunteer management
router.get('/volunteers', authMiddleware, requireOwner, getActiveVolunteers);
router.get('/stats', authMiddleware, requireOwner, getVolunteerStats);

export default router;
