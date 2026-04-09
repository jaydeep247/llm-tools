import { Request, Response } from 'express';
import { AlertsService } from './alerts.service';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';

export class AlertsController {
  private alertsService = new AlertsService();

  /** GET /jobs/:id/alerts */
  getAlerts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const jobId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)?.trim() ?? '';
      if (!jobId) return ResponseUtil.error(res, 'Job ID is required', undefined, 400);

      const data = await this.alertsService.getAlerts(userId, jobId);
      return ResponseUtil.success(res, 'Alerts retrieved', data);
    } catch (error: any) {
      logger.error(`[ALERTS] getAlerts: ${error.message}`);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve alerts');
    }
  };

  /** GET /jobs/:id/alerts/count */
  getAlertCount = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const jobId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)?.trim() ?? '';
      if (!jobId) return ResponseUtil.error(res, 'Job ID is required', undefined, 400);

      const data = await this.alertsService.getAlertCount(userId, jobId);
      return ResponseUtil.success(res, 'Alert count retrieved', data);
    } catch (error: any) {
      logger.error(`[ALERTS] getAlertCount: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve alert count');
    }
  };

  /** POST /alerts/:alertId/dismiss */
  dismissAlert = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const alertId = (Array.isArray(req.params.alertId) ? req.params.alertId[0] : req.params.alertId)?.trim() ?? '';
      if (!alertId) return ResponseUtil.error(res, 'Alert ID is required', undefined, 400);

      await this.alertsService.dismissAlert(userId, alertId);
      return ResponseUtil.success(res, 'Alert dismissed', { success: true });
    } catch (error: any) {
      logger.error(`[ALERTS] dismissAlert: ${error.message}`);
      if (error.message?.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to dismiss alert');
    }
  };

  /** POST /alerts/:alertId/resolve */
  resolveAlert = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const alertId = (Array.isArray(req.params.alertId) ? req.params.alertId[0] : req.params.alertId)?.trim() ?? '';
      if (!alertId) return ResponseUtil.error(res, 'Alert ID is required', undefined, 400);

      await this.alertsService.resolveAlert(userId, alertId);
      return ResponseUtil.success(res, 'Alert marked as resolved. It will remain in your Alert History for audit purposes.', { success: true });
    } catch (error: any) {
      logger.error(`[ALERTS] resolveAlert: ${error.message}`);
      if (error.message?.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to resolve alert');
    }
  };

  /** POST /alerts/:alertId/snooze */
  snoozeAlert = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const alertId = (Array.isArray(req.params.alertId) ? req.params.alertId[0] : req.params.alertId)?.trim() ?? '';
      if (!alertId) return ResponseUtil.error(res, 'Alert ID is required', undefined, 400);

      const days = typeof req.body?.days === 'number' ? req.body.days : 7;
      const snoozeUntil = await this.alertsService.snoozeAlert(userId, alertId, days);

      return ResponseUtil.success(res, `Alert snoozed for ${days} days. We'll re-notify you on ${snoozeUntil.toLocaleDateString()} if unresolved.`, {
        success: true,
        snoozed_until: snoozeUntil.toISOString(),
      });
    } catch (error: any) {
      logger.error(`[ALERTS] snoozeAlert: ${error.message}`);
      if (error.message?.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to snooze alert');
    }
  };
}
