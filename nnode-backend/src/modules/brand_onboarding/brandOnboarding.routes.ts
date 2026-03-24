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

// Retrieve all stored onboarding data by job ID
router.get('/brand-onboarding/data/:jobId', brandOnboardingController.getOnboardingData);

// Generate AI-suggested topics based on brand info
router.post('/brand-onboarding/topics', brandOnboardingController.generateTopics);

// Save user's selected topics
router.post('/brand-onboarding/topics/save', brandOnboardingController.saveTopics);

// Generate AI prompts based on selected topics
router.post('/brand-onboarding/prompts', brandOnboardingController.generatePrompts);

// Save user's selected prompts
router.post('/brand-onboarding/prompts/save', brandOnboardingController.savePrompts);

// Execute all prompts against GPT, Gemini, Claude and analyze for brand visibility
router.post('/brand-onboarding/prompts/execute', brandOnboardingController.executePrompts);

// Retrieve stored prompt execution results
router.get('/brand-onboarding/prompts/results/:jobId', brandOnboardingController.getPromptResults);

export default router;
