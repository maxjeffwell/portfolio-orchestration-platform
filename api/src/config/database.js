import pg from 'pg';
import logger from '../utils/logger.js';

const { Pool } = pg;

const DATABASE_URL = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  logger.warn('No AUTH_DATABASE_URL set, authentication database will not be available');
}

const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
}) : null;

// Test connection
if (pool) {
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      logger.error('Database connection error:', err);
    } else {
      logger.info('Database connected successfully');
    }
  });
}

export default pool;
