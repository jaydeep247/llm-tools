import { Router } from 'express';
import { SessionController } from './session.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const sessionController = new SessionController();

// All session routes require authentication
router.use(authMiddleware);

router.post('/projects/:projectId/sessions', sessionController.createSession);

// Get all sessions for a project
router.get('/projects/:projectId/sessions', sessionController.getProjectSessions);

// Get session by ID
router.get('/sessions/:id', sessionController.getSessionById);

// Get session runtime status
router.get('/sessions/:id/status', sessionController.getSessionRuntimeStatus);

// Update session status
router.put('/sessions/:id', sessionController.updateSessionStatus);

// Delete session
router.delete('/sessions/:id', sessionController.deleteSession);

export default router;
