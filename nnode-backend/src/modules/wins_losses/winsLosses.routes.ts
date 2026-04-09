import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { WinsLossesController } from './winsLosses.controller';

const router = Router();
const controller = new WinsLossesController();

router.use(authMiddleware);

// GET /jobs/:jobId/wins-losses?period=7d|30d
router.get('/jobs/:jobId/wins-losses', controller.getWinsLosses);

export default router;
