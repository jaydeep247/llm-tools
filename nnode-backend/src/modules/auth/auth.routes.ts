import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { credentialRateLimit, sessionRateLimit } from '../../middlewares/rateLimit.middleware';

const router = Router();
const authController = new AuthController();

// Public routes — credential guard prevents brute-force / stuffing.
// /me and /logout are intentionally excluded so normal session checks never hit a tight limit.
router.post('/signup', credentialRateLimit, authController.signup);
router.post('/login', credentialRateLimit, authController.login);

// Google OAuth — same credential rate limit to prevent token-stuffing attacks
router.post('/google', credentialRateLimit, authController.googleAuth);

// Google Analytics OAuth — separate integration
router.get('/google/analytics', authMiddleware, authController.initiateAnalyticsOAuth);
router.get('/google/analytics/callback', authMiddleware, authController.analyticsOAuthCallback);

// Protected routes
router.post('/logout', authMiddleware, authController.logout);
router.post('/refresh', authMiddleware, authController.refresh);
router.get('/me', sessionRateLimit, authMiddleware, authController.getCurrentUser);

export default router;
