import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { ModuleEController } from './moduleE.controller';

const router = Router();
const moduleEController = new ModuleEController();

router.use(authMiddleware);

router.get('/module-e/jobs/:jobId', moduleEController.getModuleEResult);
router.post('/module-e/jobs/:jobId/run', moduleEController.runModuleEAnalysis);
router.post('/module-e/jobs/:jobId/run-sentiment', authMiddleware, moduleEController.runSentimentAnalysis);
router.post('/module-e/jobs/:jobId/run-competitors', authMiddleware, moduleEController.runCompetitorAnalysis);
router.post('/module-e/jobs/:jobId/run-ai-sov', authMiddleware, moduleEController.runAiSovAnalysis);
router.post('/module-e/jobs/:jobId/run-brand', authMiddleware, moduleEController.runBrandAnalysis);
router.post('/module-e/jobs/:jobId/run-ranking', authMiddleware, moduleEController.runRankingAnalysis);
router.post('/module-e/jobs/:jobId/run-consistency', authMiddleware, moduleEController.runConsistencyAnalysis);

export default router;
