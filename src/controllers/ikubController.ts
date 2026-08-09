import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ikubService } from '../services/ikubService';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { auditLog } from '../utils/audit';

export class IkubController {
  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        errorResponse(res, 'Validation failed', 422, errors.array());
        return;
      }

      const ikub = await ikubService.createIkub({
        ...req.body,
        createdBy: req.admin!.id,
      });

      await auditLog(req.admin!.id, 'admin', 'CREATE_IKUB', 'ikub', ikub.id, {}, req.ip);
      successResponse(res, ikub, 'Ikub created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;

      const { ikubs, total } = await ikubService.getAllIkubs(page, limit, status);
      paginatedResponse(res, ikubs, total, page, limit);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ikub = await ikubService.getIkubById(req.params.id);
      successResponse(res, ikub);
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ikub = await ikubService.updateIkub(req.params.id, req.body);
      await auditLog(req.admin!.id, 'admin', 'UPDATE_IKUB', 'ikub', req.params.id, {}, req.ip);
      successResponse(res, ikub, 'Ikub updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async join(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { invitation_code } = req.body;
      if (!invitation_code) {
        errorResponse(res, 'Invitation code required', 400);
        return;
      }

      const result = await ikubService.joinIkub(req.user!.id, invitation_code);
      successResponse(res, result, 'Successfully joined Ikub');
    } catch (error) {
      next(error);
    }
  }

  async getMyIkubs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ikubs = await ikubService.getMemberIkubs(req.user!.id);
      successResponse(res, ikubs);
    } catch (error) {
      next(error);
    }
  }

  async getMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const members = await ikubService.getIkubMembers(req.params.id);
      successResponse(res, members);
    } catch (error) {
      next(error);
    }
  }

  async generateInviteCode(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = await ikubService.generateNewInvitationCode(req.params.id);
      successResponse(res, { invitation_code: code }, 'New invitation code generated');
    } catch (error) {
      next(error);
    }
  }

  async getDashboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await ikubService.getDashboardStats();
      const monthly = await ikubService.getMonthlyContributions();
      successResponse(res, { stats, monthly_contributions: monthly });
    } catch (error) {
      next(error);
    }
  }

  // Feature 8: member-to-member round payment transparency
  async getRoundStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roundNumber = req.query.round ? parseInt(req.query.round as string) : undefined;
      const status = await ikubService.getRoundPaymentStatus(req.params.id, roundNumber);
      successResponse(res, status);
    } catch (error) {
      next(error);
    }
  }
}

export const ikubController = new IkubController();
