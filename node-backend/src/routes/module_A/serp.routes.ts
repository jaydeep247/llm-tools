import { Router } from 'express';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { SerpService } from '../../services/module_A/SerpService.js';
import { Logger } from '../../helpers/logging/Logger.js';
import { getDatabase } from '../../services/DatabaseService.js';

const router = Router();
const logger = Logger.getInstance();

router.post(
  '/serp/analyze',
  authenticateUser,
  async (req, res) => {
    try {
      const { keyword, target_domain, targetDomain, location, device, max_results, maxResults, sessionId } = req.body ?? {};

      const resolvedKeyword = (keyword ?? '').toString().trim();
      const resolvedTargetDomain = (targetDomain ?? target_domain ?? '').toString().trim();
      const resolvedLocation = (location ?? '').toString().trim();
      const resolvedDevice = (device === 'mobile' ? 'mobile' : 'desktop') as 'desktop' | 'mobile';
      const resolvedMaxResults = Number(maxResults ?? max_results ?? 100) || 100;

      if (!resolvedKeyword) {
        return res.status(400).json({ error: 'keyword is required' });
      }
      if (!resolvedTargetDomain) {
        return res.status(400).json({ error: 'target_domain is required' });
      }
      if (!resolvedLocation) {
        return res.status(400).json({ error: 'location is required' });
      }

      logger.info('SERP analyze request', {
        keyword: resolvedKeyword,
        targetDomain: resolvedTargetDomain,
        location: resolvedLocation,
        device: resolvedDevice,
        maxResults: resolvedMaxResults,
        sessionId,
        userId: req.user?.userId,
      });

      const result = await SerpService.analyze({
        keyword: resolvedKeyword,
        targetDomain: resolvedTargetDomain,
        location: resolvedLocation,
        device: resolvedDevice,
        maxResults: resolvedMaxResults,
        sessionId: sessionId != null ? Number(sessionId) : undefined,
      });

      return res.json(result);
    } catch (error) {
      logger.error('SERP analyze failed', error as Error);
      return res.status(500).json({
        error: 'Failed to analyze SERP',
        details: (error as Error).message,
      });
    }
  },
);

router.get(
  '/serp/history',
  authenticateUser,
  async (req, res) => {
    try {
      const keyword = (req.query.keyword ?? '').toString().trim();
      const domain = (req.query.domain ?? req.query.target_domain ?? '').toString().trim();
      const location = req.query.location ? req.query.location.toString().trim() : undefined;
      const device = req.query.device ? (req.query.device === 'mobile' ? 'mobile' : 'desktop') : undefined;
      const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit))) : 50;

      if (!keyword) {
        return res.status(400).json({ error: 'keyword is required' });
      }
      if (!domain) {
        return res.status(400).json({ error: 'domain is required' });
      }

      const db = getDatabase();

      const normalizedDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');

      const history = await db.getSerpHistory(keyword, normalizedDomain, location, device as any, limit);

      return res.json({ items: history });
    } catch (error) {
      logger.error('SERP history failed', error as Error);
      return res.status(500).json({
        error: 'Failed to load SERP history',
        details: (error as Error).message,
      });
    }
  },
);

export default router;

