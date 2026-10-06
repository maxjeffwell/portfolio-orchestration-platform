import { generateToken } from '../middleware/auth.js';
import { READ_ONLY } from '../middleware/readOnly.js';
import userService from '../services/userService.js';
import logger from '../utils/logger.js';
import { asyncHandler, sendSuccess, ApiError } from '../utils/asyncHandler.js';

class AuthController {
  login = asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Find user in database (validation handled by middleware)
    const user = await userService.findUserByUsername(username);

    if (!user) {
      logger.warn(`Failed login attempt for username: ${username}`);
      throw new ApiError('Invalid credentials', 401);
    }

    // Verify password
    const passwordMatch = await userService.verifyPassword(user.password_hash, password);

    if (!passwordMatch) {
      logger.warn(`Failed login attempt - invalid password for username: ${username}`);
      throw new ApiError('Invalid credentials', 401);
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    logger.info(`Successful login for user: ${username}`);

    sendSuccess(res, {
      token,
      user: {
        username: user.username,
        role: user.role,
      },
      readOnly: READ_ONLY,
    });
  });

  verify = asyncHandler(async (req, res) => {
    // If we reach here, the authMiddleware has already verified the token
    sendSuccess(res, { user: req.user, readOnly: READ_ONLY });
  });

  logout = asyncHandler(async (req, res) => {
    // With JWT, logout is handled client-side by removing the token
    // We just log the event
    logger.info(`User ${req.user.username} logged out`);
    sendSuccess(res, { message: 'Logged out successfully' });
  });
}

export default new AuthController();
