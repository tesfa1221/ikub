import { Router } from 'express';
import { applicationController } from '../controllers/applicationController';
import { authenticateUser, authenticateAdmin } from '../middleware/auth';

const router = Router();

// ── Public (no auth) ──────────────────────────────────────────────────────────
// Browse all open ikubs
router.get('/', applicationController.getPublicIkubs.bind(applicationController));

// ── Member (user auth) ────────────────────────────────────────────────────────
// My applications
router.get('/my-applications', authenticateUser, applicationController.getMyApplications.bind(applicationController));

// My trust score
router.get('/my-trust-score', authenticateUser, applicationController.getTrustScore.bind(applicationController));

// Apply to join a specific ikub
router.post('/:ikubId/apply', authenticateUser, applicationController.applyToJoin.bind(applicationController));

// ── Admin ─────────────────────────────────────────────────────────────────────
// All pending applications across all ikubs
router.get('/applications', authenticateAdmin, applicationController.getAllPending.bind(applicationController));

// Applications for a specific ikub (with trust scores)
router.get('/:ikubId/applications', authenticateAdmin, applicationController.getIkubApplications.bind(applicationController));

// Trust score for any user (admin view)
router.get('/trust-score/:userId', authenticateAdmin, applicationController.getTrustScore.bind(applicationController));

// Approve / reject
router.post('/applications/:id/approve', authenticateAdmin, applicationController.approve.bind(applicationController));
router.post('/applications/:id/reject', authenticateAdmin, applicationController.reject.bind(applicationController));

export default router;
