import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { ModuleDController } from './moduleD.controller';

const router = Router();
const moduleDController = new ModuleDController();

router.use(authMiddleware);

router.post('/module-d/ask-ai', moduleDController.askModuleDAI);
router.post('/module-d/ask-ai/suggested-questions', moduleDController.suggestedQuestions);

export default router;
