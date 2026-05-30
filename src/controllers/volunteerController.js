import { randomBytes } from 'node:crypto';

import { pgPool } from '../config/database.js';

// ownerUid → { code: string, createdAt: string }
const activeSessions = new Map();

// volunteerUid → { name: string, code: string, joinedAt: string, itemsScanned: number }
const activeVolunteers = new Map();

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

function generateCode() {
  const buf = randomBytes(8);
  let code = '';
  for (const b of buf) {
    code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return code;
}

function isSessionExpired(session) {
  return Date.now() - new Date(session.createdAt).getTime() > SESSION_DURATION_MS;
}

function cleanupExpiredSessions() {
  for (const [ownerUid, session] of activeSessions) {
    if (isSessionExpired(session)) {
      for (const [volUid, vol] of activeVolunteers) {
        if (vol.code === session.code) activeVolunteers.delete(volUid);
      }
      activeSessions.delete(ownerUid);
    }
  }
}

// Returns true only if the volunteer is registered and their session is still active.
export function isVolunteerSessionActive(uid) {
  cleanupExpiredSessions();
  const vol = activeVolunteers.get(uid);
  if (!vol) return false;
  for (const session of activeSessions.values()) {
    if (session.code === vol.code) return true;
  }
  return false;
}

// --- Owner session management ---

export function getSession(req, res) {
  cleanupExpiredSessions();
  const session = activeSessions.get(req.user.uid);
  if (!session) {
    return res.json({ active: false, code: null });
  }
  const expiresAt = new Date(
    new Date(session.createdAt).getTime() + SESSION_DURATION_MS
  ).toISOString();
  return res.json({ active: true, code: session.code, createdAt: session.createdAt, expiresAt });
}

export function generateSession(req, res) {
  const code = generateCode();
  activeSessions.set(req.user.uid, { code, createdAt: new Date().toISOString() });
  return res.json({ active: true, code });
}

export function endSession(req, res) {
  const session = activeSessions.get(req.user.uid);
  if (session) {
    for (const [uid, vol] of activeVolunteers) {
      if (vol.code === session.code) {
        activeVolunteers.delete(uid);
      }
    }
  }
  activeSessions.delete(req.user.uid);
  return res.json({ success: true });
}

// --- Volunteer code verification ---

export function verifyCode(req, res) {
  cleanupExpiredSessions();
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ valid: false, error: 'Code is required' });
  }
  const normalized = code.trim().toUpperCase();
  for (const session of activeSessions.values()) {
    if (session.code === normalized && !isSessionExpired(session)) {
      return res.json({ valid: true });
    }
  }
  return res.status(401).json({ valid: false, error: 'Invalid or expired code' });
}

// --- Volunteer self-registration (called after anonymous sign-in) ---

export function registerVolunteer(req, res) {
  const { name, code } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const normalized = (code || '').trim().toUpperCase();
  let matchedCode = '';
  for (const session of activeSessions.values()) {
    if (session.code === normalized) {
      matchedCode = normalized;
      break;
    }
  }

  const uid = req.user.uid;
  const existing = activeVolunteers.get(uid);
  activeVolunteers.set(uid, {
    name: name.trim(),
    code: matchedCode || existing?.code || '',
    joinedAt: existing?.joinedAt || new Date().toISOString(),
    itemsScanned: existing?.itemsScanned || 0,
  });

  return res.json({ success: true, name: name.trim() });
}

// --- Volunteer profile (for scan-in page header) ---

export function getMyProfile(req, res) {
  cleanupExpiredSessions();
  const vol = activeVolunteers.get(req.user.uid);
  if (!vol) {
    return res.status(404).json({ error: 'No active volunteer session' });
  }
  let sessionActive = false;
  for (const session of activeSessions.values()) {
    if (session.code === vol.code) { sessionActive = true; break; }
  }
  if (!sessionActive) {
    activeVolunteers.delete(req.user.uid);
    return res.status(403).json({ error: 'Volunteer session has ended', code: 'SESSION_ENDED' });
  }
  return res.json(vol);
}

// --- Owner views ---

export function getActiveVolunteers(req, res) {
  const list = [];
  for (const [uid, vol] of activeVolunteers) {
    list.push({ uid, ...vol });
  }
  return res.json(list);
}

export async function getVolunteerStats(req, res) {
  try {
    const { rows } = await pgPool.query(`
      SELECT
        volunteer_name,
        COUNT(*)::int          AS sessions,
        SUM(quantity)::int     AS total_items,
        MAX(created_at)        AS last_active
      FROM activity_log
      WHERE action = 'added'
        AND volunteer_name IS NOT NULL
      GROUP BY volunteer_name
      ORDER BY last_active DESC
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Get volunteer stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Called by inventoryController after a successful check-in.
export function incrementItemsScanned(volunteerUid) {
  const vol = activeVolunteers.get(volunteerUid);
  if (vol) {
    vol.itemsScanned += 1;
  }
}
