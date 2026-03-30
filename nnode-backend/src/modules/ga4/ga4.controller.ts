import { Request, Response } from 'express';
import { GA4Service } from './ga4.service';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';

const ga4Service = new GA4Service();

export class GA4Controller {
  /**
   * GET /ga4/status
   */
  getStatus = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    try {
      const status = await ga4Service.getStatus(userId);
      return ResponseUtil.success(res, 'GA4 status retrieved', status);
    } catch (error: any) {
      logger.error(`GA4 getStatus error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to get GA4 status');
    }
  };

  /**
   * GET /ga4/properties
   */
  listProperties = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    try {
      const properties = await ga4Service.listProperties(userId);
      return ResponseUtil.success(res, 'GA4 properties retrieved', properties);
    } catch (error: any) {
      if (error.message === 'GA4_NOT_CONNECTED') {
        return ResponseUtil.error(res, 'Google Analytics is not connected.', undefined, 403);
      }
      logger.error(`GA4 listProperties error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to fetch GA4 properties');
    }
  };

  /**
   * POST /ga4/select-property
   */
  selectProperty = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { propertyId } = req.body;
    if (!propertyId || typeof propertyId !== 'string') {
      return ResponseUtil.error(res, 'propertyId is required', undefined, 400);
    }

    // Validate format
    if (!/^(properties\/)?\d+$/.test(propertyId)) {
      return ResponseUtil.error(res, 'Invalid propertyId format', undefined, 400);
    }

    try {
      await ga4Service.selectProperty(userId, propertyId);
      return ResponseUtil.success(res, 'GA4 property selected');
    } catch (error: any) {
      if (error.message === 'GA4_NOT_CONNECTED') {
        return ResponseUtil.error(res, 'Google Analytics is not connected.', undefined, 403);
      }
      logger.error(`GA4 selectProperty error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to select GA4 property');
    }
  };

  /**
   * GET /ga4/traffic?propertyId=properties/123&startDate=30daysAgo&endDate=today
   */
  getTraffic = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { propertyId, startDate, endDate } = req.query as Record<string, string>;

    if (!propertyId) {
      return ResponseUtil.error(res, 'propertyId is required', undefined, 400);
    }

    if (!/^(properties\/)?\d+$/.test(propertyId)) {
      return ResponseUtil.error(res, 'Invalid propertyId format', undefined, 400);
    }

    const datePattern = /^(\d{4}-\d{2}-\d{2}|\d+daysAgo|today|yesterday)$/;
    const safeStart = startDate && datePattern.test(startDate) ? startDate : '30daysAgo';
    const safeEnd = endDate && datePattern.test(endDate) ? endDate : 'today';

    try {
      const data = await ga4Service.getTraffic(userId, propertyId, safeStart, safeEnd);
      return ResponseUtil.success(res, 'GA4 traffic data retrieved', data);
    } catch (error: any) {
      if (error.message === 'GA4_NOT_CONNECTED') {
        return ResponseUtil.error(res, 'Google Analytics is not connected.', undefined, 403);
      }
      logger.error(`GA4 getTraffic error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to fetch GA4 traffic data');
    }
  };

  /**
   * POST /ga4/disconnect
   */
  disconnect = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    try {
      await ga4Service.disconnect(userId);
      return ResponseUtil.success(res, 'GA4 disconnected');
    } catch (error: any) {
      logger.error(`GA4 disconnect error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to disconnect GA4');
    }
  };
}
