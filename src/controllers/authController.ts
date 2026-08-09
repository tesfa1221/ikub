import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '../services/authService';
import { successResponse, errorResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { auditLog } from '../utils/audit';

export const telegramLoginValidation = [
  body('telegram_user').isObject().withMessage('Telegram user data required'),
  body('telegram_user.id').isNumeric().withMessage('Valid Telegram ID required'),
  body('telegram_user.first_name').isString().notEmpty().withMessage('Name required'),
];

export const adminLoginValidation = [
  body('username').isString().notEmpty().withMessage('Username required'),
  body('password').isString().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

export class AuthController {
  async telegramLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        errorResponse(res, 'Validation failed', 422, errors.array());
        return;
      }

      const { telegram_user } = req.body;
      const result = await authService.telegramLogin(telegram_user);

      await auditLog(result.user.id, 'user', 'LOGIN', 'user', result.user.id, {}, req.ip);

      successResponse(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  async adminLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        errorResponse(res, 'Validation failed', 422, errors.array());
        return;
      }

      const { username, password } = req.body;
      const result = await authService.adminLogin(username, password);

      await auditLog(result.admin.id, 'admin', 'ADMIN_LOGIN', 'admin', result.admin.id, {}, req.ip);

      successResponse(res, result, 'Admin login successful');
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      successResponse(res, req.user, 'Profile retrieved');
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.updateProfile(req.user!.id, req.body);
      successResponse(res, result, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
