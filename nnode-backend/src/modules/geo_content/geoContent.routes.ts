import { Router } from 'express';
import { GeoContentController } from './geoContent.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new GeoContentController();

router.use(authMiddleware);

// Generate a new GEO article via Claude
router.post('/geo-content/generate', controller.generate);

// List all content for the authenticated user
router.get('/geo-content', controller.list);

// Fetch saved brand prompts for the dropdown (proxied from Python backend)
// NOTE: must be declared before /:id to avoid route collision
router.get('/geo-content/brand-prompts', controller.getBrandPrompts);

// Fetch a single piece of content
router.get('/geo-content/:id', controller.getById);

// Inline title update
router.patch('/geo-content/:id/title', controller.updateTitle);

export default router;
