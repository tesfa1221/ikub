import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { paymentService } from '../services/paymentService';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { auditLog } from '../utils/audit';

export class PaymentController {
  async submit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        errorResponse(res, 'Validation failed', 422, errors.array());
        return;
      }

      const { ikub_id, transaction_id, amount, payment_method, round_number } = req.body;

      const payment = await paymentService.submitPayment({
        userId: req.user!.id,
        ikubId: ikub_id,
        transactionId: transaction_id,
        amount,
        paymentMethod: payment_method,
        roundNumber: round_number,
      });

      // Emit real-time update
      const io = (req as any).io;
      if (io) {
        io.to(`ikub:${ikub_id}`).emit('payment:submitted', payment);
        io.to('admin').emit('payment:new', payment);
      }

      await auditLog(req.user!.id, 'user', 'SUBMIT_PAYMENT', 'payment', payment.id, {}, req.ip);
      successResponse(res, payment, 'Payment submitted for verification', 201);
    } catch (error) {
      next(error);
    }
  }

  async approve(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await paymentService.approvePayment(req.params.id, req.admin!.id);

      // Emit real-time notification to member
      const io = (req as any).io;
      if (io) {
        io.to(`user:${payment.telegram_id}`).emit('payment:approved', {
          message: 'Your payment has been approved ✅',
          payment,
        });
        io.to('admin').emit('payment:updated', payment);
        io.to(`ikub:${payment.ikub_id}`).emit('payment:updated', payment);
      }

      await auditLog(req.admin!.id, 'admin', 'APPROVE_PAYMENT', 'payment', req.params.id, {}, req.ip);
      successResponse(res, payment, 'Payment approved successfully');
    } catch (error) {
      next(error);
    }
  }

  async reject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = req.body;
      if (!reason) {
        errorResponse(res, 'Rejection reason required', 400);
        return;
      }

      const payment = await paymentService.rejectPayment(req.params.id, req.admin!.id, reason);

      const io = (req as any).io;
      if (io) {
        io.to(`user:${payment.telegram_id}`).emit('payment:rejected', {
          message: `Your payment was rejected: ${reason}`,
          payment,
        });
        io.to('admin').emit('payment:updated', payment);
      }

      await auditLog(req.admin!.id, 'admin', 'REJECT_PAYMENT', 'payment', req.params.id, {}, req.ip);
      successResponse(res, payment, 'Payment rejected');
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const { status, ikub_id, search } = req.query;

      const { payments, total } = await paymentService.getAllPayments(page, limit, {
        status: status as string,
        ikubId: ikub_id as string,
        search: search as string,
      });

      paginatedResponse(res, payments, total, page, limit);
    } catch (error) {
      next(error);
    }
  }

  async getMyPayments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const payments = await paymentService.getMemberPayments(
        req.user!.id,
        req.query.ikub_id as string
      );
      successResponse(res, payments);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await paymentService.getPaymentById(req.params.id);
      if (!payment) {
        errorResponse(res, 'Payment not found', 404);
        return;
      }
      successResponse(res, payment);
    } catch (error) {
      next(error);
    }
  }

  // Called by Android app
  async recordTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transaction = await paymentService.recordTransaction({
        ...req.body,
        deviceId: (req as any).deviceId,
      });

      const io = (req as any).io;
      if (io) {
        io.to('admin').emit('transaction:received', transaction);
      }

      successResponse(res, transaction, 'Transaction recorded', 201);
    } catch (error) {
      next(error);
    }
  }
}

export const paymentController = new PaymentController();
