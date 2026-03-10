import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { ModuleAController } from './moduleA.controller';

const router = Router();
const moduleAController = new ModuleAController();

router.use(authMiddleware);

// Get SERP Analyzer result for a specific job
router.get('/module-a/jobs/:jobId', moduleAController.getSerpResult);

// Run SERP Analyzer for a job (accepts keyword list in body)
router.post('/module-a/jobs/:jobId/run', moduleAController.runSerpAnalyzer);

// Get keyword rank history (across multiple runs) for a session
router.get('/module-a/jobs/:jobId/keyword-history', moduleAController.getKeywordHistory);

// Get all SERP Analyzer results for a session
router.get('/module-a/sessions/:sessionId', moduleAController.getSessionSerpResults);

export default router;
