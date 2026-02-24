import { Router } from 'express';
import { JobController } from './job.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const jobController = new JobController();

router.use(authMiddleware);

// Job CRUD
router.post('/sessions/:sessionId/jobs', jobController.createJob);
router.get('/sessions/:sessionId/jobs', jobController.getSessionJobs);
router.get('/jobs/:id', jobController.getJobById);
router.post('/jobs/:id/cancel', jobController.cancelJob);
router.post('/jobs/:id/retry', jobController.retryJob);

// Job Status & Snapshots
router.get('/jobs/:id/snapshot', jobController.getJobSnapshot);
router.get('/jobs/:id/status', jobController.getJobRuntimeStatus);
router.get('/jobs/:id/summary', jobController.getJobSummary);
router.get('/jobs/:id/site-structure', jobController.getJobSiteStructure);

// Schema Generation (Module B)
router.post('/jobs/:id/generate-schema', jobController.generateSchemaForJob);
router.get('/jobs/:id/results/schema', jobController.getJobSchema);

// Content Metrics (Module D)
router.post('/jobs/:id/content-metrics', jobController.startContentMetricsForJob);
router.get('/jobs/:id/results/content-metrics', jobController.getJobContentMetrics);

// AEO Analysis (Module C)
router.get('/jobs/:id/results/aeo-analysis', jobController.getJobAeoAnalysis);

// Module E - Brand Intelligence (Isolated Job Endpoints)
router.post('/jobs/:id/module-e/consistency', jobController.startModuleEConsistency);
router.post('/jobs/:id/module-e/sentiment', jobController.startModuleESentiment);
router.post('/jobs/:id/module-e/competitors', jobController.startModuleECompetitors);
router.post('/jobs/:id/module-e/ai-sov', jobController.startModuleEAiSov);
router.post('/jobs/:id/module-e/ranking', jobController.startModuleERanking);
router.post('/jobs/:id/module-e/brand', jobController.startModuleEBrand);
router.post('/jobs/:id/module-e/ai-citation-ranking', jobController.startModuleEAiCitationRanking);
router.get('/jobs/:id/results/module-e', jobController.getJobModuleEAnalysis);

// Crawl Results
router.get('/jobs/:id/results/pages', jobController.getJobPages);
router.get('/jobs/:id/results/links', jobController.getJobLinks);
router.get('/jobs/:id/results/sitemaps', jobController.getJobSitemaps);
router.get('/jobs/:id/results/fields', jobController.getJobFields);

export default router;
