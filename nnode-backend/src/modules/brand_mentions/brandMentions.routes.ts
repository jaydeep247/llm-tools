import { Router } from 'express';
import { BrandMentionsController } from './brandMentions.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new BrandMentionsController();

router.use(authMiddleware);

// Free-form search — any query, results NOT saved to DB
router.post('/brand-mentions/search', controller.search);

// Run a brand mention scan via Google Custom Search API
router.post('/brand-mentions/scan', controller.scan);

// List stored mentions with filters + pagination
router.get('/brand-mentions', controller.list);

// Dashboard summary (totals, top domains, recent)
router.get('/brand-mentions/dashboard', controller.dashboard);

// Export all matching mentions as CSV
router.get('/brand-mentions/export', controller.exportCsv);

export default router;
