import { pgPool } from '../config/database.js';

export default {
  async createUser({ uid, username, email, firstname, lastname }) {
    const sql = `INSERT INTO users (firebase_uid, username, email, firstname, lastname) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
    const { rows } = await pgPool.query(sql, [uid, username, email, firstname, lastname]);
    return { id: rows[0].id, uid, username, email };
  },

  async upsertUser({ uid, username, email, firstname, lastname }) {
    const sql = `
      INSERT INTO users (firebase_uid, username, email, firstname, lastname)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET
        firebase_uid = EXCLUDED.firebase_uid,
        firstname = EXCLUDED.firstname,
        lastname = EXCLUDED.lastname
      RETURNING id, firebase_uid AS "firebaseUid", username, email, firstname, lastname;
    `;
    try {
      const { rows } = await pgPool.query(sql, [uid, username, email, firstname, lastname]);
      return rows[0] || this.findByUid(uid);
    } catch (error) {
      if (
        error.code === '23505' &&
        `${error.constraint || ''}`.toLowerCase().includes('firebase_uid')
      ) {
        return this.findByUid(uid);
      }
      throw error;
    }
  },

  async findByUid(uid) {
    const sql = `SELECT id, firebase_uid AS "firebaseUid", username, email, firstname, lastname FROM users WHERE firebase_uid = $1`;
    const { rows } = await pgPool.query(sql, [uid]);
    return rows[0] || null;
  },

  async getAll() {
    const { rows } = await pgPool.query(`SELECT username, email, firstname, lastname FROM users ORDER BY username ASC`);
    return rows;
  },

  async isOwnerEmail(email) {
    if (!email) return false;
    const sql = `SELECT 1 FROM owners WHERE email = LOWER(TRIM($1)) LIMIT 1`;
    const { rows } = await pgPool.query(sql, [email]);
    return rows.length > 0;
  }
};
