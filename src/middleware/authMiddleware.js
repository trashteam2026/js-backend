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

// Volunteers sign in anonymously; any other Firebase sign-in provider counts
// as an owner under the existing role model. Use after authMiddleware.
export const requireOwner = (req, res, next) => {
  if (req.user?.firebase?.sign_in_provider === 'anonymous') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
};

export default authMiddleware;