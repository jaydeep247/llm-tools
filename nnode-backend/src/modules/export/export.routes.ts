import { Router } from 'express';
import { ExportController } from './export.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const ctrl = new ExportController();

router.use(authMiddleware);

// ── API key management
router.get('/export/api-key', ctrl.getApiKey);
router.post('/export/api-key/regenerate', ctrl.regenerateApiKey);

// ── Scheduled exports
router.get('/export/schedule', ctrl.getSchedule);
router.post('/export/schedule', ctrl.saveSchedule);

// ── Readiness check (pre-flight before any download)
// GET /export/check/:type?project_id=...&job_id=...
router.get('/export/check/:type', ctrl.checkReadiness);

// ── PDF exports  (type = weekly-summary | audit-report | competitor-report | ai-scorecard | serp-analysis | competitor-ai-report)
router.get('/export/pdf/:type', ctrl.getPdf);

// ── CSV exports  (type = crawl-data | citations | prompts | competitors | alerts)
router.get('/export/csv/:type', ctrl.getCsv);

export default router;
