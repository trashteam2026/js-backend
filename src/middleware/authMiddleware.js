import admin from '../config/firebase.js';

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

// Reads the OWNER_EMAILS allowlist from the environment at call time (no cached
// array) and reports whether the given email is on it. Comma-separated,
// case-insensitive, whitespace-trimmed.
export const isOwnerEmail = (email) => {
  if (!email) return false;
  const allowlist = (process.env.OWNER_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
};

// Decides whether a verified token belongs to an owner.
// - No user / anonymous volunteer  -> never an owner.
// - OWNER_EMAILS empty/unset        -> OPEN MODE: any non-anonymous signed-in
//   user is treated as an owner (development default; see startup warning).
// - OWNER_EMAILS populated          -> owner only if the email is on the list.
export const isOwner = (user) => {
  if (!user) return false;
  if (user.firebase?.sign_in_provider === 'anonymous') return false;
  const allowlistEmpty = !(process.env.OWNER_EMAILS || '').trim();
  if (allowlistEmpty) return true;
  return isOwnerEmail(user.email);
};

// Logs a loud warning when the owner allowlist is empty so the open-mode default
// can't silently ship to production. Call once at server startup.
export const warnIfOwnerAllowlistEmpty = () => {
  if (!(process.env.OWNER_EMAILS || '').trim()) {
    console.warn(
      '⚠️  OWNER_EMAILS is empty — owner-only routes are OPEN to any signed-in user. ' +
        'Set OWNER_EMAILS before production.'
    );
  }
};

// Requires the request to come from an owner (see isOwner). Use after
// authMiddleware. Rejects anonymous volunteers and non-allowlisted users with 403.
export const requireOwner = (req, res, next) => {
  if (!isOwner(req.user)) {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
};

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