import { Router } from 'express';
import { env } from './config/env';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/user/user.routes';
import projectRoutes from './modules/project/project.routes';
import sessionRoutes from './modules/session/session.routes';
import jobRoutes from './modules/job/job.routes';
import moduleARoutes from './modules/module_A/moduleA.routes';
import moduleERoutes from './modules/module_E/moduleE.routes';
import moduleCRoutes from './modules/module_C/moduleC.routes';
import moduleFRoutes from './modules/module_F/moduleF.routes';
import quickStartRoutes from './modules/quick_start/quickStart.routes';
import fieldsRoutes from './modules/fields/fields.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/', sessionRoutes);
router.use('/', jobRoutes);
router.use('/', moduleARoutes);
router.use('/', moduleERoutes);
router.use('/', moduleCRoutes);
router.use('/', moduleFRoutes);
router.use('/', quickStartRoutes);
router.use('/', fieldsRoutes);

export default router;
