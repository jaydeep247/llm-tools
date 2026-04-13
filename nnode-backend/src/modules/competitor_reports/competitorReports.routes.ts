import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { CompetitorReportsController } from './competitorReports.controller';

const router = Router();
const controller = new CompetitorReportsController();

router.use(authMiddleware);

// PDF-aligned: Competitor Reports in Reports & Alerts module
// Query params: project_id, period=7d|30d
router.get('/reports/competitors', controller.getReport);

export default router;

