import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { ModuleBController } from './moduleB.controller';

const router = Router();
const moduleBController = new ModuleBController();

router.use(authMiddleware);

router.post('/module-b/jobs/:jobId/ask-ai', moduleBController.askModuleBAI);
router.get(
  '/module-b/jobs/:jobId/ask-ai/suggested-questions',
  moduleBController.getModuleBSuggestedQuestions,
);

export default router;
