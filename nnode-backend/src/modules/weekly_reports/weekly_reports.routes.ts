import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { WeeklyReportsController } from './weekly_reports.controller';

const router = Router();
const c = new WeeklyReportsController();

router.use(authMiddleware);

router.get('/reports/weekly', c.list);
router.post('/reports/weekly/generate', c.generate);
router.get('/reports/weekly/:reportId/export', c.exportReport);
router.get('/reports/weekly/:reportId', c.getOne);

export default router;
