import { Router, Request, Response, NextFunction } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { rawQuery, query } from '../database/connection';
import { successResponse, paginatedResponse } from '../utils/response';
import { applicationService } from '../services/applicationService';

const router = Router();

/**
 * GET /api/users
 * Admin: all registered users with full properties, ikub memberships, trust score
 */
router.get('/', authenticateAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page   = parseInt(req.query.page as string) || 1;
    const limit  = parseInt(req.query.limit as string) || 30;
    const search = req.query.search as string;
    const offset = (page - 1) * limit;

    const searchCondition = search
      ? `AND (u.name LIKE '%${search.replace(/'/g, "''")}%' OR u.phone LIKE '%${search.replace(/'/g, "''")}%')`
      : '';

    const users = await rawQuery(
      `SELECT
         u.id, u.telegram_id, u.name, u.phone, u.role, u.is_active, u.created_at,
         (SELECT COUNT(*) FROM members m WHERE m.user_id = u.id AND m.is_active = TRUE) as active_groups,
         (SELECT COUNT(*) FROM payments p JOIN members m ON m.id = p.member_id WHERE m.user_id = u.id AND p.status = 'approved') as approved_payments,
         (SELECT COUNT(*) FROM payments p JOIN members m ON m.id = p.member_id WHERE m.user_id = u.id AND p.status = 'rejected') as rejected_payments,
         (SELECT COUNT(*) FROM members mem JOIN ikubs ik ON ik.id = mem.ikub_id WHERE mem.user_id = u.id AND ik.status = 'completed') as completed_ikubs
       FROM users u
       WHERE u.role = 'member' ${searchCondition}
       ORDER BY u.created_at DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    );

    const countRows = await rawQuery(
      `SELECT COUNT(*) as total FROM users u WHERE u.role = 'member' ${searchCondition}`
    );

    // Attach trust score and current ikubs to each user
    const enriched = await Promise.all(users.map(async (u: any) => {
      const trust = await applicationService.calculateTrustScore(u.id);

      // Current ikub memberships
      const ikubs = await query(
        `SELECT i.id, i.name, i.contribution_amount, i.schedule, i.status,
           m.order_number, m.has_received, m.join_date
         FROM ikubs i JOIN members m ON m.ikub_id = i.id
         WHERE m.user_id = ? AND m.is_active = TRUE
         ORDER BY m.join_date DESC`,
        [u.id]
      );

      return { ...u, trust_score: trust, ikub_memberships: ikubs };
    }));

    paginatedResponse(res, enriched, countRows[0]?.total || 0, page, limit);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id
 * Admin: single user full profile
 */
router.get('/:id', authenticateAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [user] = await query(
      `SELECT u.id, u.telegram_id, u.name, u.phone, u.role, u.is_active, u.created_at
       FROM users u WHERE u.id = ?`,
      [req.params.id]
    );
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }

    const trust = await applicationService.calculateTrustScore(user.id);
    const ikubs = await query(
      `SELECT i.id, i.name, i.contribution_amount, i.schedule, i.status, i.current_round,
         i.total_rounds, m.order_number, m.has_received, m.join_date,
         (SELECT COUNT(*) FROM payments p WHERE p.member_id = m.id AND p.status = 'approved') as paid_rounds
       FROM ikubs i JOIN members m ON m.ikub_id = i.id
       WHERE m.user_id = ? AND m.is_active = TRUE`,
      [user.id]
    );
    const payments = await rawQuery(
      `SELECT p.id, p.amount, p.payment_method, p.status, p.submitted_at, p.round_number,
         i.name as ikub_name
       FROM payments p
       JOIN members m ON m.id = p.member_id
       JOIN ikubs i ON i.id = p.ikub_id
       WHERE m.user_id = ?
       ORDER BY p.submitted_at DESC
       LIMIT 20`,
      [user.id]
    );

    successResponse(res, { ...user, trust_score: trust, ikub_memberships: ikubs, recent_payments: payments });
  } catch (error) {
    next(error);
  }
});

export default router;
