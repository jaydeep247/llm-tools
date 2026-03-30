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

export default router;
