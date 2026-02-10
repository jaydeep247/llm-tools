import { Router } from 'express';
import { JobController } from './job.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const jobController = new JobController();

// All job routes require authentication
router.use(authMiddleware);

// Get pending jobs (for external workers to pull)
router.get('/jobs/pending', jobController.getPendingJobs);

// Create job in a session
router.post('/sessions/:sessionId/jobs', jobController.createJob);

// Get all jobs for a session
router.get('/sessions/:sessionId/jobs', jobController.getSessionJobs);

// Get job statistics for a session
router.get('/sessions/:sessionId/jobs/stats', jobController.getSessionJobStats);

// Get job by ID
router.get('/jobs/:id', jobController.getJobById);

// Update job status (called by external workers)
router.put('/jobs/:id', jobController.updateJobStatus);

// Delete job
router.delete('/jobs/:id', jobController.deleteJob);

export default router;
