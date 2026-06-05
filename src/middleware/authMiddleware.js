import admin from '../config/firebase.js';
import { pgPool } from '../config/database.js';
import userRepository from '../repositories/userRepository.js';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : null;

    if (!token) {
      return res.status(401).json({ error: 'No Firebase ID token provided' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Firebase Auth middleware error:', error);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Firebase ID token expired' });
    }
    if (error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'Invalid Firebase ID token' });
    }
    res
      .status(500)
      .json({ error: 'Internal server error during authentication' });
  }
};

// Reports whether the given email is an owner by looking it up in the owners
// table (see migration 006). Normalization (lower+trim) happens in the
// repository/provider SQL so it stays symmetric with how rows were seeded.
export async function isOwnerEmail(email) {
  if (!email) return false;
  return await userRepository.isOwnerEmail(email);
}

// Decides whether a verified token belongs to an owner.
// - No user / anonymous volunteer -> never an owner.
// - Otherwise                      -> owner only if the email is in the owners table.
export async function isOwner(user) {
  if (!user) return false;
  if (user.firebase?.sign_in_provider === 'anonymous') return false;
  return await isOwnerEmail(user.email);
}

// Logs a loud warning when the owners table is empty so a misconfigured deploy
// (no owners seeded) doesn't silently lock everyone out of owner-only routes.
// Call once at server startup. Never throws.
export async function warnIfOwnerAllowlistEmpty() {
  try {
    const { rows } = await pgPool.query(
      'SELECT COUNT(*)::int AS count FROM owners'
    );
    if (!rows[0] || rows[0].count === 0) {
      console.warn(
        '⚠️  owners table is empty — no one will pass requireOwner. ' +
          'Seed the owners table before production.'
      );
    }
  } catch (error) {
    console.error('Failed to check owners table on startup:', error);
  }
}

// Requires the request to come from an owner (see isOwner). Use after
// authMiddleware. Rejects anonymous volunteers and non-owner users with 403.
export async function requireOwner(req, res, next) {
  if (!(await isOwner(req.user))) {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

// Authenticates if token present; continues without setting req.user if not.
export const optionalAuth = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;
  if (!token) return next();
  try {
    req.user = await admin.auth().verifyIdToken(token);
  } catch {
    // non-fatal — proceed unauthenticated
  }
  next();
};

export default authMiddleware;
