import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { ModuleEController } from './moduleE.controller';

const router = Router();
const moduleEController = new ModuleEController();

router.use(authMiddleware);

router.get('/module-e/jobs/:jobId', moduleEController.getModuleEResult);

export default router;
