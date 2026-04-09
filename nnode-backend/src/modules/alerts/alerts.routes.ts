import { Router } from 'express';
import { AlertsController } from './alerts.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new AlertsController();

router.use(authMiddleware);

router.get('/jobs/:id/alerts', controller.getAlerts);
router.get('/jobs/:id/alerts/count', controller.getAlertCount);
router.post('/alerts/:alertId/dismiss', controller.dismissAlert);
router.post('/alerts/:alertId/resolve', controller.resolveAlert);
router.post('/alerts/:alertId/snooze', controller.snoozeAlert);

export default router;
