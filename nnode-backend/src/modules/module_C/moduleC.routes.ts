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

// ===== New C1-C9 Submodule Field Endpoints =====

// C5 — Entity Extraction (NER, topics, word-count)
router.get('/module-c/jobs/:jobId/c5', moduleCController.getC5EntityExtraction);

// C1 — AEO Checker (LLM-friendliness score, sub-component scores)
router.get('/module-c/jobs/:jobId/c1', moduleCController.getC1AeoChecker);

// C3 — Entity Coverage Audit
router.get('/module-c/jobs/:jobId/c3', moduleCController.getC3EntityCoverage);

// C6 — Missing Information Analysis
router.get('/module-c/jobs/:jobId/c6', moduleCController.getC6MissingInfo);

// C4 — Answer Completeness Score
router.get('/module-c/jobs/:jobId/c4', moduleCController.getC4AnswerCompleteness);

// C2 — Bulk LLM-Friendliness Audit
router.get('/module-c/jobs/:jobId/c2', moduleCController.getC2BulkAudit);

// C7 — LLM Answer Simulation
router.get('/module-c/jobs/:jobId/c7', moduleCController.getC7LlmSimulator);

// C9 — Multi-Model Insights
router.get('/module-c/jobs/:jobId/c9', moduleCController.getC9MultiModel);

// C8 — Page-Level Improvement Actions
router.get('/module-c/jobs/:jobId/c8', moduleCController.getC8PageActions);

// Overall Score Summary
router.get('/module-c/jobs/:jobId/summary', moduleCController.getSummary);

// AI Visibility Report — consultant-style insight report
router.get('/module-c/jobs/:jobId/visibility-report', moduleCController.getVisibilityReport);
router.post('/module-c/ask-ai', moduleCController.askModuleCAI);
router.post('/module-c/ask-ai/suggested-questions', moduleCController.moduleCSuggestedQuestions);

export default router;
