import { Router } from 'express';
import { ExecutiveSnapshotController } from './executiveSnapshot.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new ExecutiveSnapshotController();

router.use(authMiddleware);

router.get('/jobs/:id/executive-snapshot', controller.getSnapshot);

export default router;
