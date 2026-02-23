import { Router } from 'express';
import { JobController } from './job.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const jobController = new JobController();

router.use(authMiddleware);

router.post('/sessions/:sessionId/jobs', jobController.createJob);
router.get('/sessions/:sessionId/jobs', jobController.getSessionJobs);
router.get('/jobs/:id', jobController.getJobById);
router.post('/jobs/:id/generate-schema', jobController.generateSchemaForJob);
router.post('/jobs/:id/content-metrics', jobController.startContentMetricsForJob);
router.get('/jobs/:id/snapshot', jobController.getJobSnapshot);
router.post('/jobs/:id/generate-schema', jobController.generateSchemaForJob);
router.post('/jobs/:id/content-metrics', jobController.startContentMetricsForJob);
router.get('/jobs/:id/status', jobController.getJobRuntimeStatus);
router.get('/jobs/:id/results/pages', jobController.getJobPages);
router.get('/jobs/:id/results/links', jobController.getJobLinks);
router.get('/jobs/:id/results/sitemaps', jobController.getJobSitemaps);
router.get('/jobs/:id/results/fields', jobController.getJobFields);
router.get('/jobs/:id/results/aeo-analysis', jobController.getJobAeoAnalysis);
router.get('/jobs/:id/summary', jobController.getJobSummary);
router.get('/jobs/:id/results/schema', jobController.getJobSchema);
router.get('/jobs/:id/site-structure', jobController.getJobSiteStructure);
router.get('/jobs/:id/results/content-metrics', jobController.getJobContentMetrics);
router.post('/jobs/:id/cancel', jobController.cancelJob);
router.post('/jobs/:id/retry', jobController.retryJob);

export default router;
