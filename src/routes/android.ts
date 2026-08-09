import { Router } from 'express';
import { body } from 'express-validator';
import { paymentController } from '../controllers/paymentController';
import { authenticateDevice } from '../middleware/auth';

const router = Router();

// Android notification listener endpoint
router.post('/transaction',
  authenticateDevice,
  [
    body('transactionReference').isString().notEmpty(),
    body('amount').isNumeric().isFloat({ min: 1 }),
    body('source').isIn(['telebirr', 'cbe_birr', 'other']),
  ],
  paymentController.recordTransaction.bind(paymentController)
);

router.get('/status', authenticateDevice, (_req, res) => {
  res.json({ status: 'connected', timestamp: new Date().toISOString() });
});

export default router;
