import { Router } from 'express';
import { applicationController } from '../controllers/applicationController';
import { authenticateUser, authenticateAdmin } from '../middleware/auth';

const router = Router();

// ── Public (no auth) — list all ─────────────────────────────────────────────
router.get('/', applicationController.getPublicIkubs.bind(applicationController));

// ── Member fixed paths — MUST come before /:ikubId ──────────────────────────
router.get('/my-applications', authenticateUser, applicationController.getMyApplications.bind(applicationController));
router.get('/my-trust-score',  authenticateUser, applicationController.getTrustScore.bind(applicationController));

// ── Admin fixed paths ────────────────────────────────────────────────────────
router.get('/applications',    authenticateAdmin, applicationController.getAllPending.bind(applicationController));
router.get('/trust-score/:userId', authenticateAdmin, applicationController.getTrustScore.bind(applicationController));
router.post('/applications/:id/approve', authenticateAdmin, applicationController.approve.bind(applicationController));
router.post('/applications/:id/reject',  authenticateAdmin, applicationController.reject.bind(applicationController));

// ── Dynamic routes — MUST come AFTER fixed paths ─────────────────────────────
// Single ikub public detail (no auth needed)
router.get('/:ikubId', applicationController.getPublicIkubDetail.bind(applicationController));

// Applications for a specific ikub
router.get('/:ikubId/applications', authenticateAdmin, applicationController.getIkubApplications.bind(applicationController));

// Apply to join
router.post('/:ikubId/apply', authenticateUser, applicationController.applyToJoin.bind(applicationController));

export default router;
