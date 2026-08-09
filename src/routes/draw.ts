import { Router } from 'express';
import { body } from 'express-validator';
import { drawController } from '../controllers/drawController';
import { authenticateAdmin, authenticateUser } from '../middleware/auth';

const router = Router();

router.get('/', authenticateAdmin, drawController.getAll.bind(drawController));
router.get('/ikub/:ikubId', authenticateUser, drawController.getByIkub.bind(drawController));
router.get('/ikub/:ikubId/upcoming', authenticateUser, drawController.getUpcoming.bind(drawController));
router.get('/:id', drawController.getById.bind(drawController));

router.post('/',
  authenticateAdmin,
  [body('ikub_id').isUUID().withMessage('Valid Ikub ID required')],
  drawController.conductDraw.bind(drawController)
);

export default router;
