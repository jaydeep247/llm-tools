import { Router } from 'express';
import { GA4Controller } from './ga4.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const ga4Controller = new GA4Controller();

router.get('/ga4/status', authMiddleware, ga4Controller.getStatus);
router.get('/ga4/properties', authMiddleware, ga4Controller.listProperties);
router.post('/ga4/select-property', authMiddleware, ga4Controller.selectProperty);
router.get('/ga4/traffic', authMiddleware, ga4Controller.getTraffic);
router.post('/ga4/disconnect', authMiddleware, ga4Controller.disconnect);
router.get('/ga4/llm-traffic', authMiddleware, ga4Controller.getLLMTraffic);
router.post('/ga4/llm-traffic/sync', authMiddleware, ga4Controller.syncLLMTraffic);
router.get('/ga4/top-landing-pages', authMiddleware, ga4Controller.getTopLandingPages);
router.get('/ga4/citation-sparkline', authMiddleware, ga4Controller.getCitationSparkline);
// Events & Conversions
router.get('/ga4/conversion-events', authMiddleware, ga4Controller.getConversionEvents);
router.post('/ga4/conversion-events', authMiddleware, ga4Controller.saveConversionEvents);
router.get('/ga4/events-list', authMiddleware, ga4Controller.listGA4Events);
router.get('/ga4/llm-conversions', authMiddleware, ga4Controller.getLLMConversions);
router.post('/ga4/llm-conversions/sync', authMiddleware, ga4Controller.syncLLMConversions);

export default router;
