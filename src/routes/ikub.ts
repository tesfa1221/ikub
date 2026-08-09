import { Router } from 'express';
import { body } from 'express-validator';
import { ikubController } from '../controllers/ikubController';
import { authenticateUser, authenticateAdmin } from '../middleware/auth';

const router = Router();

// Public / member routes
router.get('/', ikubController.getAll.bind(ikubController));
router.get('/stats', authenticateAdmin, ikubController.getDashboardStats.bind(ikubController));
router.get('/me/all', authenticateUser, ikubController.getMyIkubs.bind(ikubController));
router.get('/:id', ikubController.getById.bind(ikubController));
router.get('/:id/members', authenticateAdmin, ikubController.getMembers.bind(ikubController));
// Feature 8: round payment status visible to any authenticated member
router.get('/:id/round-status', authenticateUser, ikubController.getRoundStatus.bind(ikubController));
router.post('/join', authenticateUser, ikubController.join.bind(ikubController));

// Admin routes
router.post('/',
  authenticateAdmin,
  [
    body('name').isString().notEmpty(),
    body('contribution_amount').isNumeric().isFloat({ min: 1 }),
    body('schedule').isIn(['weekly', 'biweekly', 'monthly']),
    body('max_members').isInt({ min: 2, max: 100 }),
    body('total_rounds').isInt({ min: 1 }),
  ],
  ikubController.create.bind(ikubController)
);

router.put('/:id', authenticateAdmin, ikubController.update.bind(ikubController));
router.post('/:id/invite-code', authenticateAdmin, ikubController.generateInviteCode.bind(ikubController));

export default router;
