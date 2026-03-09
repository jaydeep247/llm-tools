import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { QuickStartController } from './quickStart.controller';

const router = Router();
const quickStartController = new QuickStartController();

router.use(authMiddleware);

router.get('/quick-start/jobs/:jobId', quickStartController.getQuickStartResult);
router.post('/quick-start/jobs/:jobId/resume-crawl', quickStartController.resumeCrawl);

export default router;
