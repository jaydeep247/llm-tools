import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { BrandOnboardingController } from './brandOnboarding.controller';

const router = Router();
const brandOnboardingController = new BrandOnboardingController();

router.use(authMiddleware);

// Generate brand description from URL
router.post('/brand-onboarding/describe', brandOnboardingController.describeBrand);

// Retrieve stored brand description by job ID
router.get('/brand-onboarding/description/:jobId', brandOnboardingController.getBrandDescription);

export default router;
