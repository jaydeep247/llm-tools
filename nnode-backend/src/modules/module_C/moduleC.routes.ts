import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { ModuleCController } from './moduleC.controller';

const router = Router();
const moduleCController = new ModuleCController();

router.use(authMiddleware);

// Get Module C result for a specific job
router.get('/module-c/jobs/:jobId', moduleCController.getModuleCResult);

// Get all Module C results for a job (multiple URLs)
router.get('/module-c/jobs/:jobId/all', moduleCController.getAllModuleCResults);

// Run Module C analysis for a job
router.post('/module-c/jobs/:jobId/run', moduleCController.runModuleCAnalysis);

// Get Module C results for a session
router.get('/module-c/sessions/:sessionId', moduleCController.getSessionModuleCResults);

// ===== Individual Module Field Endpoints =====

// AI Presence - Overall score, robots checks, content checks, AI understanding
router.get('/module-c/jobs/:jobId/ai-presence', moduleCController.getAiPresence);

// Answerability - Q&A analysis, completeness, depth, breadth scores
router.get('/module-c/jobs/:jobId/answerability', moduleCController.getAnswerability);

// Knowledge Base - Entity coverage, fact density
router.get('/module-c/jobs/:jobId/knowledge-base', moduleCController.getKnowledgeBase);

// LLM Simulator - Multi-model simulation results
router.get('/module-c/jobs/:jobId/llm-simulator', moduleCController.getLlmSimulator);

// Multi-Model Insights - Cross-model agreement & consensus
router.get('/module-c/jobs/:jobId/multi-model-insights', moduleCController.getMultiModelInsights);

// Actionable Insights - Prioritized action items
router.get('/module-c/jobs/:jobId/actionable-insights', moduleCController.getActionableInsights);

// Overall Score Summary
router.get('/module-c/jobs/:jobId/summary', moduleCController.getSummary);

export default router;
