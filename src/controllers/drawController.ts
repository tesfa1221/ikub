import { Request, Response, NextFunction } from 'express';
import { drawService } from '../services/drawService';
import { successResponse, paginatedResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { auditLog } from '../utils/audit';

export class DrawController {
  async conductDraw(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ikub_id, notes } = req.body;
      const draw = await drawService.conductDraw(ikub_id, req.admin!.id, notes);

      // Real-time announcement
      const io = (req as any).io;
      if (io) {
        io.to(`ikub:${ikub_id}`).emit('draw:result', {
          message: `🎉 Draw complete! Winner: ${draw.winner_name}`,
          draw,
        });
        io.to('admin').emit('draw:completed', draw);
        // Notify winner specifically
        io.to(`user:${draw.winner_telegram_id}`).emit('draw:winner', {
          message: `🎉 Congratulations! You won the draw for round ${draw.round_number}!`,
          amount: draw.amount,
          draw,
        });
      }

      await auditLog(req.admin!.id, 'admin', 'CONDUCT_DRAW', 'draw', draw.id, {}, req.ip);
      successResponse(res, draw, 'Draw conducted successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getByIkub(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const draws = await drawService.getDrawsByIkub(req.params.ikubId);
      successResponse(res, draws);
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { draws, total } = await drawService.getAllDraws(page, limit);
      paginatedResponse(res, draws, total, page, limit);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const draw = await drawService.getDrawById(req.params.id);
      successResponse(res, draw);
    } catch (error) {
      next(error);
    }
  }

  async getUpcoming(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const info = await drawService.getUpcomingDraw(req.params.ikubId);
      successResponse(res, info);
    } catch (error) {
      next(error);
    }
  }
}

export const drawController = new DrawController();
