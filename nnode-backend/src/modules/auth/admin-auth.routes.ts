import { Router } from 'express';
import { AdminAuthController } from './admin-auth.controller';
import { adminMiddleware } from '../../middlewares/admin.middleware';
import { credentialRateLimit, sessionRateLimit } from '../../middlewares/rateLimit.middleware';

const router = Router();
const controller = new AdminAuthController();

// Public — rate-limited to prevent brute-force
router.post('/login', credentialRateLimit, controller.login);

// Protected — require valid admin_token cookie + ADMIN role
router.post('/logout', adminMiddleware, controller.logout);
router.get('/me', sessionRateLimit, adminMiddleware, controller.getMe);

export default router;
