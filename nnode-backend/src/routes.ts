import { Router } from 'express';
import { env } from './config/env';
import authRoutes from './modules/auth/auth.routes';
import adminAuthRoutes from './modules/auth/admin-auth.routes';
import adminUsersRoutes from './modules/admin/admin-users.routes';
import userRoutes from './modules/user/user.routes';
import projectRoutes from './modules/project/project.routes';
import sessionRoutes from './modules/session/session.routes';
import jobRoutes from './modules/job/job.routes';
import moduleARoutes from './modules/module_A/moduleA.routes';
import moduleBRoutes from './modules/module_B';
import moduleERoutes from './modules/module_E/moduleE.routes';
import moduleCRoutes from './modules/module_C/moduleC.routes';
import moduleFRoutes from './modules/module_F/moduleF.routes';
import moduleDRoutes from './modules/module_D/moduleD.routes';
import quickStartRoutes from './modules/quick_start/quickStart.routes';
import brandOnboardingRoutes from './modules/brand_onboarding/brandOnboarding.routes';
import fieldsRoutes from './modules/fields/fields.routes';
import ga4Routes from './modules/ga4/ga4.routes';
import executiveSnapshotRoutes from './modules/executive_snapshot/executiveSnapshot.routes';
import winsLossesRoutes from './modules/wins_losses/winsLosses.routes';
import alertsRoutes from './modules/alerts/alerts.routes';
import auditReportsRoutes from './modules/audit_reports/audit_reports.routes';
import exportRoutes from './modules/export/export.routes';
import weeklyReportsRoutes from './modules/weekly_reports/weekly_reports.routes';
import competitorReportsRoutes from './modules/competitor_reports/competitorReports.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

router.use('/auth', authRoutes);
router.use('/auth/admin', adminAuthRoutes);
router.use('/admin/users', adminUsersRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/', sessionRoutes);
router.use('/', jobRoutes);
router.use('/', moduleARoutes);
router.use('/', moduleBRoutes);
router.use('/', moduleERoutes);
router.use('/', moduleCRoutes);
router.use('/', moduleFRoutes);
router.use('/', moduleDRoutes);
router.use('/', quickStartRoutes);
router.use('/', brandOnboardingRoutes);
router.use('/', fieldsRoutes);
router.use('/', ga4Routes);
router.use('/', executiveSnapshotRoutes);
router.use('/', winsLossesRoutes);
router.use('/', alertsRoutes);
router.use('/', auditReportsRoutes);
router.use('/', exportRoutes);
router.use('/', weeklyReportsRoutes);
router.use('/', competitorReportsRoutes);

export default router;
