import { Router } from 'express';
import { AuditReportsController } from './audit_reports.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new AuditReportsController();

router.use(authMiddleware);

router.get('/jobs/:id/audit-report', controller.getReport);
router.get('/jobs/:id/audit-report/history', controller.listReports);

export default router;
