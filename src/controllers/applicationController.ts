import { Request, Response, NextFunction } from 'express';
import { applicationService } from '../services/applicationService';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { auditLog } from '../utils/audit';

export class ApplicationController {

  // GET /api/marketplace — public, no auth required
  async getPublicIkubs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page   = parseInt(req.query.page as string) || 1;
      const limit  = parseInt(req.query.limit as string) || 20;
      const { schedule, search } = req.query;
      const minAmount = req.query.min_amount ? parseFloat(req.query.min_amount as string) : undefined;
      const maxAmount = req.query.max_amount ? parseFloat(req.query.max_amount as string) : undefined;

      const { ikubs, total } = await applicationService.getPublicIkubs(page, limit, {
        schedule: schedule as string,
        minAmount,
        maxAmount,
        search: search as string,
      });
      paginatedResponse(res, ikubs, total, page, limit);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/marketplace/:ikubId — public ikub detail
  async getPublicIkubDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { rawQuery } = await import('../database/connection');
      const rows = await rawQuery(
        `SELECT i.id, i.name, i.description, i.contribution_amount, i.schedule,
           i.max_members, i.total_rounds, i.current_round, i.status, i.start_date,
           (SELECT COUNT(*) FROM members m WHERE m.ikub_id = i.id AND m.is_active = TRUE) as member_count,
           (i.max_members - (SELECT COUNT(*) FROM members m2 WHERE m2.ikub_id = i.id AND m2.is_active = TRUE)) as spots_left
         FROM ikubs i WHERE i.id = ?`,
        [req.params.ikubId]
      );
      if (!rows[0]) { errorResponse(res, 'Ikub not found', 404); return; }
      successResponse(res, rows[0]);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/marketplace/:ikubId/apply — member applies
  async applyToJoin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await applicationService.applyToJoin(
        req.user!.id,
        req.params.ikubId,
        req.body.message
      );
      successResponse(res, application, 'Application submitted successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/marketplace/my-applications — member's own applications
  async getMyApplications(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applications = await applicationService.getUserApplications(req.user!.id);
      successResponse(res, applications);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/marketplace/trust-score/:userId — trust score (auth required)
  async getTrustScore(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.params.userId || req.user!.id;
      const score = await applicationService.calculateTrustScore(userId);
      successResponse(res, score);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/marketplace/applications — admin: all pending
  async getAllPending(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applications = await applicationService.getAllPendingApplications();
      successResponse(res, applications);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/marketplace/:ikubId/applications — admin: applications for an ikub
  async getIkubApplications(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as string;
      const applications = await applicationService.getApplicationsForIkub(req.params.ikubId, status);

      // Attach trust score to each applicant
      const withScores = await Promise.all(
        applications.map(async (app: any) => {
          const trust = await applicationService.calculateTrustScore(app.user_id);
          return { ...app, trust_score: trust };
        })
      );

      successResponse(res, withScores);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/marketplace/applications/:id/approve — admin approves
  async approve(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await applicationService.approveApplication(req.params.id, req.admin!.id);

      const io = (req as any).io;
      if (io && application.telegram_id) {
        io.to(`user:${application.telegram_id}`).emit('application:approved', {
          message: `✅ Your application to join "${application.ikub_name}" was approved!`,
          application,
        });
      }

      await auditLog(req.admin!.id, 'admin', 'APPROVE_APPLICATION', 'application', req.params.id, {}, req.ip);
      successResponse(res, application, 'Application approved — member added');
    } catch (error) {
      next(error);
    }
  }

  // POST /api/marketplace/applications/:id/reject — admin rejects
  async reject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = req.body;
      if (!reason) { errorResponse(res, 'Rejection reason required', 400); return; }

      const application = await applicationService.rejectApplication(req.params.id, req.admin!.id, reason);

      const io = (req as any).io;
      if (io && application.telegram_id) {
        io.to(`user:${application.telegram_id}`).emit('application:rejected', {
          message: `Your application to "${application.ikub_name}" was not approved: ${reason}`,
          application,
        });
      }

      await auditLog(req.admin!.id, 'admin', 'REJECT_APPLICATION', 'application', req.params.id, {}, req.ip);
      successResponse(res, application, 'Application rejected');
    } catch (error) {
      next(error);
    }
  }
}

export const applicationController = new ApplicationController();
