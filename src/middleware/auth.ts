import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createError } from './errorHandler';
import { queryOne } from '../database/connection';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    telegramId?: number;
    role: string;
    name: string;
  };
  admin?: {
    id: string;
    username: string;
    role: string;
    name: string;
  };
}

export function authenticateUser(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw createError('No token provided', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(createError('Invalid token', 401));
    } else {
      next(error);
    }
  }
}

export function authenticateAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw createError('No token provided', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET!) as any;

    if (!decoded.isAdmin) {
      throw createError('Unauthorized', 403);
    }

    req.admin = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(createError('Invalid admin token', 401));
    } else {
      next(error);
    }
  }
}

/**
 * Accepts either a member token OR an admin token.
 * Used for routes accessible to both (e.g. viewing group members).
 */
export function authenticateAny(req: AuthRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next(createError('No token provided', 401));
    return;
  }
  const token = authHeader.split(' ')[1];

  // Try user token first
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = decoded;
    return next();
  } catch { /* try admin next */ }

  // Try admin token
  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET!) as any;
    req.admin = decoded;
    return next();
  } catch {
    next(createError('Invalid token', 401));
  }
}

export function requireSuperAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (req.admin?.role !== 'super_admin') {
    next(createError('Super admin access required', 403));
    return;
  }
  next();
}

export function authenticateDevice(req: Request, _res: Response, next: NextFunction): void {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    const deviceId = req.headers['x-device-id'] as string;

    if (!apiKey || !deviceId) {
      throw createError('Device authentication required', 401);
    }

    // Validate against stored device tokens
    // In production, compare hashed API key
    (req as any).deviceId = deviceId;
    next();
  } catch (error) {
    next(error);
  }
}
