import { randomBytes } from 'node:crypto';

import { pgPool } from '../config/database.js';

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

// Returns true only if the volunteer is registered and their session is still
// live (not expired). Filtering on expires_at means correctness no longer
// depends on a cleanup pass.
export async function isVolunteerSessionActive(uid) {
  if (!uid) return false;
  const { rows } = await pgPool.query(
    `SELECT 1
       FROM active_volunteers av
       JOIN volunteer_sessions vs ON vs.code = av.code
      WHERE av.volunteer_uid = $1
        AND vs.expires_at > NOW()
      LIMIT 1;`,
    [uid]
  );
  return rows.length > 0;
}

// --- Owner session management ---

export async function getSession(req, res) {
  try {
    const { rows } = await pgPool.query(
      `SELECT code, created_at AS "createdAt", expires_at AS "expiresAt"
         FROM volunteer_sessions
        WHERE owner_uid = $1
          AND expires_at > NOW()
        LIMIT 1;`,
      [req.user.uid]
    );
    const session = rows[0];
    if (!session) {
      return res.json({ active: false, code: null });
    }
    return res.json({
      active: true,
      code: session.code,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error('Get volunteer session error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function generateSession(req, res) {
  // `code` is UNIQUE; retry on the (astronomically rare) collision with another
  // owner's live code rather than surfacing a 500.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      await pgPool.query(
        `INSERT INTO volunteer_sessions (owner_uid, code, created_at, expires_at)
         VALUES ($1, $2, NOW(), NOW() + ($3::int * INTERVAL '1 millisecond'))
         ON CONFLICT (owner_uid) DO UPDATE SET
           code = EXCLUDED.code,
           created_at = EXCLUDED.created_at,
           expires_at = EXCLUDED.expires_at;`,
        [req.user.uid, code, SESSION_DURATION_MS]
      );
      return res.json({ active: true, code });
    } catch (error) {
      if (error.code === '23505') {
        continue; // code collision — generate a new one and retry
      }
      console.error('Generate volunteer session error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
  return res
    .status(500)
    .json({ error: 'Could not generate a unique code, please try again' });
}

export async function endSession(req, res) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT code FROM volunteer_sessions WHERE owner_uid = $1;`,
      [req.user.uid]
    );
    if (rows[0]) {
      await client.query(`DELETE FROM active_volunteers WHERE code = $1;`, [
        rows[0].code,
      ]);
    }
    await client.query(`DELETE FROM volunteer_sessions WHERE owner_uid = $1;`, [
      req.user.uid,
    ]);
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('End volunteer session error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// --- Volunteer code verification ---

export async function verifyCode(req, res) {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ valid: false, error: 'Code is required' });
    }
    const normalized = code.trim().toUpperCase();
    const { rows } = await pgPool.query(
      `SELECT 1
         FROM volunteer_sessions
        WHERE code = $1
          AND expires_at > NOW()
        LIMIT 1;`,
      [normalized]
    );
    if (rows.length > 0) {
      return res.json({ valid: true });
    }
    return res.status(401).json({ valid: false, error: 'Invalid or expired code' });
  } catch (error) {
    console.error('Verify volunteer code error:', error);
    return res.status(500).json({ valid: false, error: 'Internal server error' });
  }
}

// --- Volunteer self-registration (called after anonymous sign-in) ---

export async function registerVolunteer(req, res) {
  try {
    const { name, code } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ error: 'code is required' });
    }

    const normalized = code.trim().toUpperCase();

    // Server-side validation: the code must map to a live session before we
    // register the volunteer. Previously any code (even empty/wrong) was stored
    // and the volunteer registered anyway.
    const { rows } = await pgPool.query(
      `SELECT 1
         FROM volunteer_sessions
        WHERE code = $1
          AND expires_at > NOW()
        LIMIT 1;`,
      [normalized]
    );
    if (rows.length === 0) {
      return res
        .status(401)
        .json({ error: 'Invalid or expired code', code: 'INVALID_CODE' });
    }

    const trimmedName = name.trim();
    // Upsert preserves joined_at and items_scanned on re-registration.
    await pgPool.query(
      `INSERT INTO active_volunteers (volunteer_uid, name, code)
       VALUES ($1, $2, $3)
       ON CONFLICT (volunteer_uid) DO UPDATE SET
         name = EXCLUDED.name,
         code = EXCLUDED.code;`,
      [req.user.uid, trimmedName, normalized]
    );

    return res.json({ success: true, name: trimmedName });
  } catch (error) {
    console.error('Register volunteer error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// --- Volunteer profile (for scan-in page header) ---

export async function getMyProfile(req, res) {
  try {
    const { rows } = await pgPool.query(
      `SELECT name, code,
              joined_at AS "joinedAt",
              items_scanned AS "itemsScanned"
         FROM active_volunteers
        WHERE volunteer_uid = $1
        LIMIT 1;`,
      [req.user.uid]
    );
    const vol = rows[0];
    if (!vol) {
      return res.status(404).json({ error: 'No active volunteer session' });
    }

    const { rows: sessionRows } = await pgPool.query(
      `SELECT 1
         FROM volunteer_sessions
        WHERE code = $1
          AND expires_at > NOW()
        LIMIT 1;`,
      [vol.code]
    );
    if (sessionRows.length === 0) {
      await pgPool.query(
        `DELETE FROM active_volunteers WHERE volunteer_uid = $1;`,
        [req.user.uid]
      );
      return res
        .status(403)
        .json({ error: 'Volunteer session has ended', code: 'SESSION_ENDED' });
    }

    return res.json({
      name: vol.name,
      code: vol.code,
      joinedAt: vol.joinedAt,
      itemsScanned: vol.itemsScanned,
    });
  } catch (error) {
    console.error('Get volunteer profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// --- Owner views ---

export async function getActiveVolunteers(req, res) {
  try {
    const { rows } = await pgPool.query(
      `SELECT av.volunteer_uid AS uid,
              av.name,
              av.code,
              av.joined_at AS "joinedAt",
              av.items_scanned AS "itemsScanned"
         FROM active_volunteers av
         JOIN volunteer_sessions vs ON vs.code = av.code
        WHERE vs.expires_at > NOW()
        ORDER BY av.joined_at ASC;`
    );
    return res.json(rows);
  } catch (error) {
    console.error('Get active volunteers error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getVolunteerStats(req, res) {
  try {
    const { rows } = await pgPool.query(`
      SELECT
        volunteer_name,
        COUNT(*)::int                          AS scan_count,
        COUNT(DISTINCT DATE(created_at))::int   AS active_days,
        SUM(quantity)::int                     AS total_items,
        MAX(created_at)                         AS last_active
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

// Called by inventoryController after a successful check-in. Increments by one
// per check-in event; no-ops for non-volunteers (no active_volunteers row).
export async function incrementItemsScanned(volunteerUid) {
  if (!volunteerUid) return;
  await pgPool.query(
    `UPDATE active_volunteers
        SET items_scanned = items_scanned + 1
      WHERE volunteer_uid = $1;`,
    [volunteerUid]
  );
}
