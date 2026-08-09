import { Router, Request, Response, NextFunction } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { triggerReminder } from '../services/reminderService';
import { successResponse, errorResponse } from '../utils/response';

const router = Router();

/**
 * POST /api/reminders/trigger
 * Body: { days_left: "3 days" | "1 day" | "today" }
 *
 * Admin-only endpoint to manually fire a reminder batch.
 * Useful for testing without waiting for the cron schedule.
 */
router.post('/trigger', authenticateAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { days_left } = req.body;
    const valid = ['3 days', '1 day', 'today'];

    if (!valid.includes(days_left)) {
      errorResponse(res, `Invalid days_left. Must be one of: ${valid.join(', ')}`, 400);
      return;
    }

    await triggerReminder(days_left as '3 days' | '1 day' | 'today');
    successResponse(res, null, `Reminder "${days_left}" triggered successfully`);
  } catch (error) {
    next(error);
  }
});

export default router;
