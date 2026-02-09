/**
 * LLM Answer Simulator Routes
 * API endpoints for simulating AI responses to content queries
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { LLMAnswerSimulatorController } from '../../controllers/LLMAnswerSimulatorController.js';

const router = Router();

// Rate limiting middleware for simulation endpoints
const simulatorRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Stricter rate limit for URL fetching
const fetchUrlRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // Limit URL fetching to 10 requests per 10 minutes
  message: {
    success: false,
    error: 'Too many URL fetch requests from this IP, please try again later.',
    retryAfter: 10 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint (no rate limiting)
router.get(
  '/health',
  LLMAnswerSimulatorController.healthCheck
);

// Simulate single query response
router.post(
  '/simulate',
  simulatorRateLimit,
  LLMAnswerSimulatorController.simulateQuery
);

// Analyze content for multiple queries
router.post(
  '/analyze',
  simulatorRateLimit,
  LLMAnswerSimulatorController.analyzeContent
);

// Get session results
router.get(
  '/results/:sessionId',
  LLMAnswerSimulatorController.getSessionResults
);

// Get simulator stats
router.get(
  '/stats',
  LLMAnswerSimulatorController.getStats
);

// Fetch content from URL
router.post(
  '/fetch-url',
  fetchUrlRateLimit,
  LLMAnswerSimulatorController.fetchUrlContent
);

export default router;