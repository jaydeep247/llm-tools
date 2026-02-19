import { Router } from 'express';
import { JobController } from './job.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const jobController = new JobController();

router.use(authMiddleware);

router.post('/sessions/:sessionId/jobs', jobController.createJob);
router.get('/sessions/:sessionId/jobs', jobController.getSessionJobs);
router.get('/jobs/:id', jobController.getJobById);
router.get('/jobs/:id/status', jobController.getJobRuntimeStatus);
router.get('/jobs/:id/results/pages', jobController.getJobPages);
router.get('/jobs/:id/results/links', jobController.getJobLinks);
router.get('/jobs/:id/results/sitemaps', jobController.getJobSitemaps);
router.get('/jobs/:id/results/fields', jobController.getJobFields);

export default router;
