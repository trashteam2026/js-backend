// === Supabase / PostgreSQL (default) ===
// Set DATABASE_URL in your .env file (found in Supabase project settings → Database → Connection string)
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

// Pool sizing for PgBouncer transaction-mode pooling on serverless: each
// Cloud Functions instance keeps at most a handful of connections, since the
// Supabase transaction pooler (port 6543) multiplexes many clients onto few
// server connections. A small max avoids exhausting the pooler under fan-out;
// the timeouts release idle connections quickly and fail fast instead of
// hanging when the pooler is saturated.
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

// Export both names so older repositories that still import `pool`
// keep working while the codebase converges on `pgPool`.
export { pgPool, pgPool as pool };

// === AWS RDS / MySQL (uncomment below and comment out the Postgres block above to switch) ===
// Also update src/repositories/userRepository.js to use mysqlProvider.
//
// import fs from 'fs';
// import ini from 'ini';
// import mysql2 from 'mysql2/promise';
//
// const CONFIG_FILE = 'rds-config.ini';
// const config_data = fs.readFileSync(CONFIG_FILE, 'utf-8');
// const config = ini.parse(config_data);
//
// const pool = mysql2.createPool({
//   host: config.rds.endpoint,
//   port: parseInt(config.rds.port_number),
//   user: config.rds.user_name,
//   password: config.rds.user_pwd,
//   database: config.rds.db_name,
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// });
//
// export { pool };
