import { Router } from 'express';
import { body } from 'express-validator';
import { paymentController } from '../controllers/paymentController';
import { authenticateUser, authenticateAdmin } from '../middleware/auth';

const router = Router();

// Member routes
router.post('/',
  authenticateUser,
  [
    body('ikub_id').isUUID(),
    body('transaction_id').isString().notEmpty().isLength({ min: 5, max: 100 }),
    body('amount').isNumeric().isFloat({ min: 1 }),
    body('payment_method').isIn(['telebirr', 'cbe_birr', 'other']),
    body('round_number').isInt({ min: 1 }),
  ],
  paymentController.submit.bind(paymentController)
);

router.get('/me', authenticateUser, paymentController.getMyPayments.bind(paymentController));

// Admin routes
router.get('/', authenticateAdmin, paymentController.getAll.bind(paymentController));
router.get('/:id', authenticateAdmin, paymentController.getById.bind(paymentController));
router.post('/:id/approve', authenticateAdmin, paymentController.approve.bind(paymentController));
router.post('/:id/reject', authenticateAdmin, paymentController.reject.bind(paymentController));

export default router;
