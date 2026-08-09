import { Router, Request, Response, NextFunction } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { query } from '../database/connection';
import { successResponse } from '../utils/response';

const router = Router();

router.get('/summary', authenticateAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [overview] = await query(`
      SELECT
        (SELECT COUNT(*) FROM ikubs) as total_ikubs,
        (SELECT COUNT(*) FROM users WHERE role = 'member') as total_members,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='approved') as total_collected,
        (SELECT COUNT(*) FROM payments) as total_payments,
        (SELECT COUNT(*) FROM draws) as total_draws
    `);

    const monthly = await query(`
      SELECT DATE_FORMAT(submitted_at, '%Y-%m') as month,
        SUM(amount) as total, COUNT(*) as count
      FROM payments WHERE status = 'approved'
      GROUP BY DATE_FORMAT(submitted_at, '%Y-%m')
      ORDER BY month DESC LIMIT 12
    `);

    const topIkubs = await query(`
      SELECT i.name, i.contribution_amount,
        COUNT(DISTINCT m.user_id) as members,
        COALESCE(SUM(p.amount),0) as collected
      FROM ikubs i
      LEFT JOIN members m ON m.ikub_id = i.id AND m.is_active=TRUE
      LEFT JOIN payments p ON p.ikub_id = i.id AND p.status='approved'
      GROUP BY i.id ORDER BY collected DESC LIMIT 5
    `);

    successResponse(res, { overview, monthly, topIkubs });
  } catch (error) {
    next(error);
  }
});

router.get('/payments', authenticateAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, ikub_id } = req.query;
    const conditions: string[] = ["p.status = 'approved'"];
    const params: any[] = [];

    if (from) { conditions.push('p.submitted_at >= ?'); params.push(from); }
    if (to) { conditions.push('p.submitted_at <= ?'); params.push(to); }
    if (ikub_id) { conditions.push('p.ikub_id = ?'); params.push(ikub_id); }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const payments = await query(`
      SELECT p.*, u.name as member_name, i.name as ikub_name
      FROM payments p
      JOIN members m ON m.id = p.member_id
      JOIN users u ON u.id = m.user_id
      JOIN ikubs i ON i.id = p.ikub_id
      ${whereClause}
      ORDER BY p.submitted_at DESC
    `, params);

    successResponse(res, payments);
  } catch (error) {
    next(error);
  }
});

export default router;
