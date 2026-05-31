import { pgPool } from '../config/database.js';
import { isVolunteerSessionActive } from './volunteerController.js';

const ACTIVITY_TIME_ZONE = 'America/Chicago';

const ensureActiveVolunteerSession = async (req, res) => {
  if (req.user?.firebase?.sign_in_provider !== 'anonymous') {
    return true;
  }

  if (await isVolunteerSessionActive(req.user.uid)) {
    return true;
  }

  res.status(403).json({
    error: 'Volunteer session has ended',
    code: 'SESSION_ENDED',
  });
  return false;
};

const activityController = {
  async getLogs(req, res) {
    try {
      const { start, end } = req.query;

      const conditions = [];
      const values = [];

      if (start) {
        values.push(start);
        conditions.push(
          `created_at >= ($${values.length}::date::timestamp AT TIME ZONE '${ACTIVITY_TIME_ZONE}')`
        );
      }
      if (end) {
        values.push(end);
        conditions.push(
          `created_at < (($${values.length}::date + INTERVAL '1 day') AT TIME ZONE '${ACTIVITY_TIME_ZONE}')`
        );
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const { rows } = await pgPool.query(
        `SELECT id, item_id, item_name, action, quantity, created_at
         FROM activity_log
         ${where}
         ORDER BY created_at DESC`,
        values
      );

      res.status(200).json(rows);
    } catch (error) {
      console.error('Get activity logs error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async updateLog(req, res) {
    const logId = parseInt(req.params.id, 10);
    const newQty = parseInt(req.body.quantity, 10);

    if (!Number.isInteger(logId) || logId <= 0) {
      return res.status(400).json({ error: 'Invalid log id' });
    }
    if (!Number.isInteger(newQty) || newQty <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    if (!(await ensureActiveVolunteerSession(req, res))) {
      return undefined;
    }

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT id, quantity, batch_id, volunteer_uid
         FROM activity_log
         WHERE id = $1 AND action = 'added'
         FOR UPDATE`,
        [logId]
      );

      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Log entry not found' });
      }

      const log = rows[0];

      if (log.volunteer_uid !== req.user.uid) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (!log.batch_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Cannot edit — no batch reference available' });
      }

      const delta = newQty - Number(log.quantity);

      if (delta !== 0) {
        const batchRows = await client.query(
          `SELECT quantity FROM item_batches WHERE id = $1 FOR UPDATE`,
          [log.batch_id]
        );

        if (!batchRows.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Cannot edit — the batch no longer exists' });
        }

        const newBatchQty = Number(batchRows.rows[0].quantity) + delta;

        if (newBatchQty < 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'Cannot reduce quantity — items may have already been checked out',
            code: 'INSUFFICIENT_STOCK',
          });
        }

        if (newBatchQty === 0) {
          await client.query(`DELETE FROM item_batches WHERE id = $1`, [log.batch_id]);
        } else {
          await client.query(`UPDATE item_batches SET quantity = $1 WHERE id = $2`, [newBatchQty, log.batch_id]);
        }
      }

      await client.query(`UPDATE activity_log SET quantity = $1 WHERE id = $2`, [newQty, logId]);
      await client.query('COMMIT');

      return res.json({ success: true, quantity: newQty });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update activity log error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  },

  async deleteLog(req, res) {
    const logId = parseInt(req.params.id, 10);

    if (!Number.isInteger(logId) || logId <= 0) {
      return res.status(400).json({ error: 'Invalid log id' });
    }

    if (!(await ensureActiveVolunteerSession(req, res))) {
      return undefined;
    }

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT id, quantity, batch_id, volunteer_uid
         FROM activity_log
         WHERE id = $1 AND action = 'added'
         FOR UPDATE`,
        [logId]
      );

      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Log entry not found' });
      }

      const log = rows[0];

      if (log.volunteer_uid !== req.user.uid) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (!log.batch_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Cannot delete — no batch reference available' });
      }

      const batchRows = await client.query(
        `SELECT quantity FROM item_batches WHERE id = $1 FOR UPDATE`,
        [log.batch_id]
      );

      if (batchRows.rows[0]) {
        const newBatchQty = Number(batchRows.rows[0].quantity) - Number(log.quantity);

        if (newBatchQty < 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'Cannot delete — items may have already been checked out',
            code: 'INSUFFICIENT_STOCK',
          });
        }

        if (newBatchQty === 0) {
          await client.query(`DELETE FROM item_batches WHERE id = $1`, [log.batch_id]);
        } else {
          await client.query(`UPDATE item_batches SET quantity = $1 WHERE id = $2`, [newBatchQty, log.batch_id]);
        }
      }

      await client.query(`DELETE FROM activity_log WHERE id = $1`, [logId]);
      await client.query('COMMIT');

      return res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Delete activity log error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  },
};

export default activityController;
