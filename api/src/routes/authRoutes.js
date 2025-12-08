import express from 'express';
import authController from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';
import validate from '../middleware/validation/validationMiddleware.js';
import { authLogin } from '../middleware/validation/rules.js';

const router = express.Router();

// Public routes
router.post('/login', validate(authLogin), authController.login.bind(authController));

// Protected routes
router.get('/verify', authMiddleware, authController.verify.bind(authController));
router.post('/logout', authMiddleware, authController.logout.bind(authController));

export default router;
