import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { ModuleFController } from './moduleF.controller';

const router = Router();
const moduleFController = new ModuleFController();

router.use(authMiddleware);

router.get('/module-f/jobs/:jobId', moduleFController.getModuleFResult);
router.get('/module-f/jobs/:jobId/trends', moduleFController.getModuleFTrends);
router.post('/module-f/jobs/:jobId/run', moduleFController.runCompetitorAiIntelligence);
router.post('/module-f/jobs/:jobId/ask-ai', moduleFController.askModuleFAI);

export default router;

