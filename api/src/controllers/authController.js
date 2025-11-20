import { generateToken } from '../middleware/auth.js';
import userService from '../services/userService.js';
import logger from '../utils/logger.js';

class AuthController {
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required',
        });
      }

      // Find user in database
      const user = await userService.findUserByUsername(username);

      if (!user) {
        logger.warn(`Failed login attempt for username: ${username}`);
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
      }

      // Verify password
      const passwordMatch = await userService.verifyPassword(user.password_hash, password);

      if (!passwordMatch) {
        logger.warn(`Failed login attempt - invalid password for username: ${username}`);
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
      }

      // Generate JWT token
      const token = generateToken({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      logger.info(`Successful login for user: ${username}`);

      res.json({
        success: true,
        data: {
          token,
          user: {
            username: user.username,
            role: user.role,
          },
        },
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed',
      });
    }
  }

  async verify(req, res) {
    try {
      // If we reach here, the authMiddleware has already verified the token
      res.json({
        success: true,
        data: {
          user: req.user,
        },
      });
    } catch (error) {
      logger.error('Verify error:', error);
      res.status(500).json({
        success: false,
        error: 'Verification failed',
      });
    }
  }

  async logout(req, res) {
    try {
      // With JWT, logout is handled client-side by removing the token
      // We just log the event
      logger.info(`User ${req.user.username} logged out`);

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed',
      });
    }
  }
}

export default new AuthController();
