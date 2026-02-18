import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { ModuleEController } from './moduleE.controller';

const router = Router();
const moduleEController = new ModuleEController();

router.use(authMiddleware);

router.get('/module-e/jobs/:jobId', moduleEController.getModuleEResult);
router.post('/module-e/jobs/:jobId/run', moduleEController.runModuleEAnalysis);
router.post('/module-e/jobs/:jobId/run-sentiment', moduleEController.runSentimentAnalysis);

export default router;
