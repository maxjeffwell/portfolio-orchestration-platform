import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger.js';

class UserService {
  async initializeDatabase() {
    if (!pool) {
      logger.warn('Database pool not available, skipping initialization');
      return;
    }

    try {
      // Create users table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      logger.info('Users table initialized');

      // Create default admin user if no users exist
      const result = await pool.query('SELECT COUNT(*) FROM users');
      const userCount = parseInt(result.rows[0].count);

      if (userCount === 0) {
        const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
        const defaultPassword = process.env.ADMIN_PASSWORD || 'admin';
        const passwordHash = await bcrypt.hash(defaultPassword, 10);

        await pool.query(
          'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
          [defaultUsername, passwordHash, 'admin']
        );

        logger.info(`Default admin user created: ${defaultUsername}`);
        logger.warn(`IMPORTANT: Change the default password for user '${defaultUsername}'`);
      }
    } catch (error) {
      logger.error('Database initialization error:', error);
      throw error;
    }
  }

  async findUserByUsername(username) {
    if (!pool) return null;

    try {
      const result = await pool.query(
        'SELECT id, username, password_hash, role, created_at FROM users WHERE username = $1',
        [username]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user:', error);
      throw error;
    }
  }

  async createUser(username, password, role = 'user') {
    if (!pool) {
      throw new Error('Database not available');
    }

    try {
      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
        [username, passwordHash, role]
      );

      logger.info(`User created: ${username}`);
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Username already exists');
      }
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  async updatePassword(username, newPassword) {
    if (!pool) {
      throw new Error('Database not available');
    }

    try {
      const passwordHash = await bcrypt.hash(newPassword, 10);

      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2',
        [passwordHash, username]
      );

      logger.info(`Password updated for user: ${username}`);
      return true;
    } catch (error) {
      logger.error('Error updating password:', error);
      throw error;
    }
  }

  async verifyPassword(passwordHash, password) {
    return bcrypt.compare(password, passwordHash);
  }
}

export default new UserService();
