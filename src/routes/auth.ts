import { Router } from 'express';
import { authController, telegramLoginValidation, adminLoginValidation } from '../controllers/authController';
import { authenticateUser, authenticateAdmin } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Telegram Mini App auth
router.post('/telegram', strictRateLimiter, telegramLoginValidation, authController.telegramLogin.bind(authController));

// Admin login
router.post('/admin/login', strictRateLimiter, adminLoginValidation, authController.adminLogin.bind(authController));

// Protected routes
router.get('/profile', authenticateUser, authController.getProfile.bind(authController));
router.put('/profile', authenticateUser, authController.updateProfile.bind(authController));

export default router;
