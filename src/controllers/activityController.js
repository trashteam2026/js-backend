import { pgPool } from '../config/database.js';

const activityController = {
  async getLogs(req, res) {
    try {
      const { start, end } = req.query;

      const conditions = [];
      const values = [];

      if (start) {
        values.push(start);
        conditions.push(`created_at >= $${values.length}::date`);
      }
      if (end) {
        values.push(end);
        conditions.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
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
};

export default activityController;
