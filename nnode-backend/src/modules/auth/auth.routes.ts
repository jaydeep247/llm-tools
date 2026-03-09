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

// Protected routes
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', sessionRateLimit, authMiddleware, authController.getCurrentUser);

export default router;
