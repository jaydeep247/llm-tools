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

  /**
   * GET /ga4/llm-traffic?propertyId=properties/123&startDate=30daysAgo&endDate=today
   */
  getLLMTraffic = async (req: Request, res: Response): Promise<Response> => {
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
      const data = await ga4Service.getLLMTraffic(userId, propertyId, safeStart, safeEnd);
      return ResponseUtil.success(res, 'LLM traffic data retrieved', data);
    } catch (error: any) {
      if (error.message === 'GA4_NOT_CONNECTED') {
        return ResponseUtil.error(res, 'Google Analytics is not connected.', undefined, 403);
      }
      logger.error(`GA4 getLLMTraffic error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to fetch LLM traffic data');
    }
  };

  /**
   * POST /ga4/llm-traffic/sync
   * Force-refresh LLM traffic cache for the given property + date range.
   */
  syncLLMTraffic = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { propertyId, startDate, endDate } = req.body as Record<string, string>;

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
      const data = await ga4Service.getLLMTraffic(userId, propertyId, safeStart, safeEnd, true);
      return ResponseUtil.success(res, 'LLM traffic data synced', data);
    } catch (error: any) {
      if (error.message === 'GA4_NOT_CONNECTED') {
        return ResponseUtil.error(res, 'Google Analytics is not connected.', undefined, 403);
      }
      logger.error(`GA4 syncLLMTraffic error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to sync LLM traffic data');
    }
  };

  /**
   * GET /ga4/top-landing-pages?propertyId=&startDate=&endDate=&projectId=&sessionUrl=&platform=&page=&pageSize=
   */
  getTopLandingPages = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { propertyId, startDate, endDate, projectId, sessionUrl, platform, page, pageSize } =
      req.query as Record<string, string>;

    if (!propertyId) {
      return ResponseUtil.error(res, 'propertyId is required', undefined, 400);
    }
    if (!/^(properties\/)?\d+$/.test(propertyId)) {
      return ResponseUtil.error(res, 'Invalid propertyId format', undefined, 400);
    }
    if (!projectId) {
      return ResponseUtil.error(res, 'projectId is required', undefined, 400);
    }

    const datePattern = /^(\d{4}-\d{2}-\d{2}|\d+daysAgo|today|yesterday)$/;
    const safeStart = startDate && datePattern.test(startDate) ? startDate : '30daysAgo';
    const safeEnd = endDate && datePattern.test(endDate) ? endDate : 'today';

    const safeSessionUrl =
      sessionUrl && /^https?:\/\/.+/.test(sessionUrl) ? sessionUrl : undefined;
    const safePlatform =
      platform && /^[A-Za-z0-9_-]{1,30}$/.test(platform) ? platform : undefined;
    const safePage = page && /^\d+$/.test(page) ? Math.max(1, parseInt(page, 10)) : 1;
    const safePageSize = pageSize && /^\d+$/.test(pageSize)
      ? Math.min(200, Math.max(1, parseInt(pageSize, 10)))
      : 50;

    try {
      const data = await ga4Service.getTopLandingPages(
        userId,
        propertyId,
        safeStart,
        safeEnd,
        projectId,
        safeSessionUrl,
        safePlatform,
        safePage,
        safePageSize,
      );
      return ResponseUtil.success(res, 'Top landing pages retrieved', data);
    } catch (error: any) {
      if (error.message === 'GA4_NOT_CONNECTED') {
        return ResponseUtil.error(res, 'Google Analytics is not connected.', undefined, 403);
      }
      logger.error(`GA4 getTopLandingPages error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to fetch top landing pages');
    }
  };

  /**
   * GET /ga4/citation-sparkline?projectId=&url=&startDate=&endDate=
   */
  getCitationSparkline = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { projectId, url, startDate, endDate } = req.query as Record<string, string>;

    if (!projectId) return ResponseUtil.error(res, 'projectId is required', undefined, 400);
    if (!url || !/^https?:\/\/.+/.test(url)) {
      return ResponseUtil.error(res, 'A valid url is required', undefined, 400);
    }

    const datePattern = /^(\d{4}-\d{2}-\d{2}|\d+daysAgo|today|yesterday)$/;
    const safeStart = startDate && datePattern.test(startDate) ? startDate : '30daysAgo';
    const safeEnd = endDate && datePattern.test(endDate) ? endDate : 'today';

    try {
      const data = await ga4Service.getCitationSparkline(projectId, url, safeStart, safeEnd);
      return ResponseUtil.success(res, 'Citation sparkline retrieved', data);
    } catch (error: any) {
      logger.error(`GA4 getCitationSparkline error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to fetch citation sparkline');
    }
  };

  // ── Events & Conversions ────────────────────────────────────────────────────

  /**
   * GET /ga4/conversion-events
   * Returns the tracked conversion events configured by the user.
   */
  getConversionEvents = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    try {
      const events = await ga4Service.getConversionEvents(userId);
      return ResponseUtil.success(res, 'Conversion events retrieved', events);
    } catch (error: any) {
      logger.error(`GA4 getConversionEvents error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to fetch conversion events');
    }
  };

  /**
   * POST /ga4/conversion-events
   * Body: { events: [{ ga4_event_name, display_label }] }
   */
  saveConversionEvents = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { events } = req.body;
    if (!Array.isArray(events)) {
      return ResponseUtil.error(res, 'events must be an array', undefined, 400);
    }
    if (events.length > 50) {
      return ResponseUtil.error(res, 'Maximum 50 conversion events allowed', undefined, 400);
    }

    try {
      await ga4Service.saveConversionEvents(userId, events);
      return ResponseUtil.success(res, 'Conversion events saved');
    } catch (error: any) {
      if (error.message?.startsWith('Invalid GA4 event name')) {
        return ResponseUtil.error(res, error.message, undefined, 400);
      }
      logger.error(`GA4 saveConversionEvents error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to save conversion events');
    }
  };

  /**
   * GET /ga4/events-list?propertyId=&startDate=&endDate=
   * Returns all GA4 event names available in the property for selection.
   */
  listGA4Events = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { propertyId, startDate, endDate } = req.query as Record<string, string>;

    if (!propertyId) return ResponseUtil.error(res, 'propertyId is required', undefined, 400);
    if (!/^(properties\/)?\d+$/.test(propertyId)) {
      return ResponseUtil.error(res, 'Invalid propertyId format', undefined, 400);
    }

    const datePattern = /^(\d{4}-\d{2}-\d{2}|\d+daysAgo|today|yesterday)$/;
    const safeStart = startDate && datePattern.test(startDate) ? startDate : '30daysAgo';
    const safeEnd = endDate && datePattern.test(endDate) ? endDate : 'today';

    try {
      const events = await ga4Service.listGA4Events(userId, propertyId, safeStart, safeEnd);
      return ResponseUtil.success(res, 'GA4 events list retrieved', events);
    } catch (error: any) {
      if (error.message === 'GA4_NOT_CONNECTED') {
        return ResponseUtil.error(res, 'Google Analytics is not connected.', undefined, 403);
      }
      logger.error(`GA4 listGA4Events error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to fetch GA4 events list');
    }
  };

  /**
   * GET /ga4/llm-conversions?propertyId=&startDate=&endDate=
   */
  getLLMConversions = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { propertyId, startDate, endDate } = req.query as Record<string, string>;
    if (!propertyId) return ResponseUtil.error(res, 'propertyId is required', undefined, 400);
    if (!/^(properties\/)?\d+$/.test(propertyId)) {
      return ResponseUtil.error(res, 'Invalid propertyId format', undefined, 400);
    }

    const datePattern = /^(\d{4}-\d{2}-\d{2}|\d+daysAgo|today|yesterday)$/;
    const safeStart = startDate && datePattern.test(startDate) ? startDate : '30daysAgo';
    const safeEnd = endDate && datePattern.test(endDate) ? endDate : 'today';

    try {
      const data = await ga4Service.getLLMConversions(userId, propertyId, safeStart, safeEnd);
      return ResponseUtil.success(res, 'LLM conversions retrieved', data);
    } catch (error: any) {
      if (error.message === 'GA4_NOT_CONNECTED') {
        return ResponseUtil.error(res, 'Google Analytics is not connected.', undefined, 403);
      }
      logger.error(`GA4 getLLMConversions error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to fetch LLM conversions data');
    }
  };

  /**
   * POST /ga4/llm-conversions/sync — force-refresh, clearing cache
   */
  syncLLMConversions = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { propertyId, startDate, endDate } = req.body as Record<string, string>;
    if (!propertyId) return ResponseUtil.error(res, 'propertyId is required', undefined, 400);
    if (!/^(properties\/)?\d+$/.test(propertyId)) {
      return ResponseUtil.error(res, 'Invalid propertyId format', undefined, 400);
    }

    const datePattern = /^(\d{4}-\d{2}-\d{2}|\d+daysAgo|today|yesterday)$/;
    const safeStart = startDate && datePattern.test(startDate) ? startDate : '30daysAgo';
    const safeEnd = endDate && datePattern.test(endDate) ? endDate : 'today';

    try {
      const data = await ga4Service.getLLMConversions(userId, propertyId, safeStart, safeEnd, true);
      return ResponseUtil.success(res, 'LLM conversions synced', data);
    } catch (error: any) {
      if (error.message === 'GA4_NOT_CONNECTED') {
        return ResponseUtil.error(res, 'Google Analytics is not connected.', undefined, 403);
      }
      logger.error(`GA4 syncLLMConversions error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to sync LLM conversions data');
    }
  };

  // ── Visibility ↔ Traffic Correlation ──────────────────────────────────────

  /**
   * GET /ga4/correlation?propertyId=&projectId=&weeks=
   */
  getCorrelation = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { propertyId, projectId, weeks } = req.query as Record<string, string>;

    if (!propertyId) return ResponseUtil.error(res, 'propertyId is required', undefined, 400);
    if (!/^(properties\/)?\d+$/.test(propertyId)) {
      return ResponseUtil.error(res, 'Invalid propertyId format', undefined, 400);
    }
    if (!projectId) return ResponseUtil.error(res, 'projectId is required', undefined, 400);

    const safeWeeks = weeks && /^\d+$/.test(weeks)
      ? Math.min(52, Math.max(8, parseInt(weeks, 10)))
      : 16;

    try {
      const data = await ga4Service.getCorrelation(userId, propertyId, projectId, safeWeeks);
      return ResponseUtil.success(res, 'Correlation data retrieved', data);
    } catch (error: any) {
      if (error.message === 'GA4_NOT_CONNECTED') {
        return ResponseUtil.error(res, 'Google Analytics is not connected.', undefined, 403);
      }
      logger.error(`GA4 getCorrelation error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to compute correlation');
    }
  };

  /**
   * GET /ga4/content-events?startDate=&endDate=
   * Returns content events (annotation markers) for the authenticated user.
   */
  getContentEvents = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { startDate, endDate } = req.query as Record<string, string>;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const safeStart = startDate && datePattern.test(startDate) ? startDate : undefined;
    const safeEnd = endDate && datePattern.test(endDate) ? endDate : undefined;

    try {
      const events = await ga4Service.getContentEvents(userId, safeStart, safeEnd);
      return ResponseUtil.success(res, 'Content events retrieved', events);
    } catch (error: any) {
      logger.error(`GA4 getContentEvents error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to fetch content events');
    }
  };

  /**
   * POST /ga4/content-events
   * Body: { event_date, event_type, event_label }
   */
  addContentEvent = async (req: Request, res: Response): Promise<Response> => {
    const userId = req.user?.userId;
    if (!userId) return ResponseUtil.unauthorized(res);

    const { event_date, event_type, event_label } = req.body as Record<string, string>;

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!event_date || !datePattern.test(event_date)) {
      return ResponseUtil.error(res, 'event_date must be YYYY-MM-DD', undefined, 400);
    }

    const validTypes = ['content_published', 'schema_added', 'score_change'];
    if (!event_type || !validTypes.includes(event_type)) {
      return ResponseUtil.error(res, `event_type must be one of: ${validTypes.join(', ')}`, undefined, 400);
    }

    if (!event_label || typeof event_label !== 'string' || event_label.trim().length === 0) {
      return ResponseUtil.error(res, 'event_label is required', undefined, 400);
    }

    // Sanitise: strip any HTML/script characters
    const safeLabel = event_label.replace(/[<>"'&]/g, '').trim().slice(0, 200);
    if (!safeLabel) {
      return ResponseUtil.error(res, 'event_label contains invalid characters', undefined, 400);
    }

    try {
      const event = await ga4Service.addContentEvent(userId, {
        event_date,
        event_type: event_type as any,
        event_label: safeLabel,
      });
      return ResponseUtil.success(res, 'Content event added', event);
    } catch (error: any) {
      logger.error(`GA4 addContentEvent error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to add content event');
    }
  };
}
