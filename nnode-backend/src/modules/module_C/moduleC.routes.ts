import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { ModuleCController } from './moduleC.controller';

const router = Router();
const moduleCController = new ModuleCController();

router.use(authMiddleware);

// Get Module C result for a specific job
router.get('/module-c/jobs/:jobId', moduleCController.getModuleCResult);

// Get all Module C results for a job (multiple URLs)
router.get('/module-c/jobs/:jobId/all', moduleCController.getAllModuleCResults);

// Run Module C analysis for a job
router.post('/module-c/jobs/:jobId/run', moduleCController.runModuleCAnalysis);

// Get Module C results for a session
router.get('/module-c/sessions/:sessionId', moduleCController.getSessionModuleCResults);

export default router;
