import { Router } from 'express';
import { JobController } from './job.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { workerAuthMiddleware } from '../../middlewares/worker.auth.middleware';

const router = Router();
const jobController = new JobController();

// ==========================================
// WORKER ROUTES (API Key Auth)
// ==========================================

// Get pending jobs (for external workers to pull)
router.get('/jobs/pending', workerAuthMiddleware, jobController.getPendingJobs);

// Update job status (called by external workers)
// This is the primary way jobs move to RUNNING/COMPLETED/FAILED
router.put('/jobs/:id', workerAuthMiddleware, jobController.updateJobStatusByWorker);


// ==========================================
// USER ROUTES (JWT Auth)
// ==========================================
router.use(authMiddleware);

// Create job in a session
router.post('/sessions/:sessionId/jobs', jobController.createJob);

// Get all jobs for a session
router.get('/sessions/:sessionId/jobs', jobController.getSessionJobs);

// Get job statistics for a session
router.get('/sessions/:sessionId/jobs/stats', jobController.getSessionJobStats);

// Get job by ID
router.get('/jobs/:id', jobController.getJobById);

// Update job status (User override - e.g. CANCEL)
// Note: Workers should use the Worker route above
router.patch('/jobs/:id', jobController.updateJobStatus);

// Delete job
router.delete('/jobs/:id', jobController.deleteJob);

export default router;
