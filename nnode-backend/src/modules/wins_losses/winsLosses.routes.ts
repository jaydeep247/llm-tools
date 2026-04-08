import { Router } from 'express';
import { WinsLossesController } from './winsLosses.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new WinsLossesController();

router.use(authMiddleware);

router.get('/jobs/:id/wins-losses', controller.getWinsLosses);

export default router;
