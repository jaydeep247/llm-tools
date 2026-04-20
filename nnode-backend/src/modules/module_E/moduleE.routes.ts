import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { ModuleEController } from './moduleE.controller';

const router = Router();
const moduleEController = new ModuleEController();

// authMiddleware applied once at router level — no per-route duplication
router.use(authMiddleware);

// GET results endpoints — canonical read paths for Module E data
router.get('/module-e/jobs/:jobId', moduleEController.getModuleEResult);
router.post('/module-e/perception/run', moduleEController.runPerceptionAnalysis);
router.get('/module-e/perception', moduleEController.getPerceptionAnalysis);
router.get('/module-e/perception-sources', moduleEController.getPerceptionSources);
router.get('/module-e/perception-sources/responses', moduleEController.getPerceptionSourceResponses);
router.get('/module-e/perception-sources-overview', moduleEController.getPerceptionSourcesOverview);

router.post('/module-e/ask-ai', moduleEController.askModuleEAI);
router.post('/module-e/ask-ai/suggested-questions', moduleEController.moduleESuggestedQuestions);

// NOTE: run-* POST endpoints (run-sentiment, run-competitors, etc.) have been
// consolidated into job.routes.ts as the canonical owner:
//   POST /jobs/:id/module-e/sentiment
//   POST /jobs/:id/module-e/competitors
//   etc.

export default router;
