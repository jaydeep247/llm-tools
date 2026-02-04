import express from 'express';
import { Logger } from '../../helpers/logging/Logger.js';

const router = express.Router();
const logger = Logger.getInstance();

const AEO_API_BASE_URL = process.env.AEO_API_BASE_URL || 'http://localhost:8000';

router.post('/ranking-analysis',
    async (req: express.Request, res: express.Response) => {
        try {
            const { url, prompts, sessionId, location, topicOverride } = req.body || {};
            logger.info('Proxying Ranking Analysis request to FastAPI', {
                url,
                promptsCount: prompts?.length,
                sessionId: sessionId ?? 'none',
                location: location ?? 'none',
                topicOverride: topicOverride ?? 'none',
            });

            const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/ranking-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    prompts,
                    location: location || undefined,
                    topic_override: topicOverride || undefined,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`FastAPI Ranking Analysis failed: ${response.status} - ${errorText}`);
                return res.status(response.status).json({
                    error: 'Ranking Analysis Failed',
                    details: errorText
                });
            }

            const data = await response.json();

            if (sessionId != null && data?.success && Array.isArray(data.ranking_position_per_prompt) && data.ranking_position_per_prompt.length > 0) {
                try {
                    const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());
                    const saved = await db.audits.updateCitationMetricsForSession(Number(sessionId), {
                        ranking_position_per_prompt: data.ranking_position_per_prompt,
                        url: data.url,
                    });
                    if (saved) {
                        logger.info(`[ranking] Saved citation_metrics for sessionId=${sessionId}`);
                    } else {
                        logger.debug(`[ranking] No AeoResult for sessionId=${sessionId}, citation_metrics not persisted`);
                    }
                } catch (dbErr: any) {
                    logger.warn(`[ranking] Failed to save citation_metrics: ${dbErr?.message}`);
                }
            }

            res.json(data);

        } catch (error: any) {
            logger.error('Ranking Analysis proxy error:', error);
            res.status(500).json({
                error: 'Ranking Service Unavailable',
                details: error.message
            });
        }
    }
);

export default router;
