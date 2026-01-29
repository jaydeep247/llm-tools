import express from 'express';
import { Logger } from '../../helpers/logging/Logger.js';
import { prisma } from '../../config/prismaClient.js';

const router = express.Router();
const logger = Logger.getInstance();

// AEO API base URL - should match the aeo-api service
const AEO_API_BASE_URL = process.env.AEO_API_BASE_URL || 'http://localhost:8000';

// --- Proxy Sentiment Tracking (Module E) ---
router.post('/sentiment-tracking',
    // authenticateUser, // Optional: uncomment if auth required
    async (req: express.Request, res: express.Response) => {
        try {
            logger.info('Proxying Sentiment Tracking request to FastAPI', {
                brand_name: req.body.brand_name
            });

            const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/sentiment-tracking`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`FastAPI Sentiment Tracking failed: ${response.status} - ${errorText}`);
                return res.status(response.status).json({
                    error: 'Sentiment Analysis Failed',
                    details: errorText
                });
            }

            const data = await response.json();

            // --- SAVE TO DATABASE FOR HISTORY ---
            try {
                // We use a simplified URL key to track history for this brand, appending timestamp for uniqueness
                const trackingUrl = `sentiment-tracker:${req.body.brand_name}:${Date.now()}`;

                logger.info(`[DEBUG] Attempting to save history. URL: ${trackingUrl}`, {
                    brand: req.body.brand_name,
                    url: trackingUrl
                });

                await prisma.aeoResult.create({
                    data: {
                        url: trackingUrl,
                        brandMetrics: data as any,
                    },
                });
                logger.info(`[DEBUG] Successfully saved sentiment history for ${trackingUrl}`);
            } catch (dbError: any) {
                logger.error(`[DEBUG-ERROR] Failed to save sentiment history. Code: ${dbError.code}, Message: ${dbError.message}`);
                // Non-blocking: don't fail the request if save fails
            }

            res.json(data);

        } catch (error: any) {
            logger.error('Sentiment Tracking proxy error:', error);
            res.status(500).json({
                error: 'Sentiment Service Unavailable',
                details: error.message
            });
        }
    }
);

// --- Get Sentiment History ---
// NOTE: This endpoint does NOT call Python. It reads from the DB only.
// Python (aeo-api) is only called on POST /sentiment-tracking (Run Analysis).
router.get('/sentiment-history/:brandName',
    async (req: express.Request, res: express.Response) => {
        try {
            const { brandName } = req.params;
            logger.info('GET sentiment-history (DB only, no Python call)', { brandName });
            const trackingUrlPattern = `sentiment-tracker:${brandName}:%`;

            // Use Prisma raw query for LIKE pattern matching
            const results = await prisma.$queryRaw<any[]>`
                SELECT brand_metrics, created_at 
                FROM aeo_results 
                WHERE url LIKE ${trackingUrlPattern}
                ORDER BY created_at ASC
            `;

            // Format for frontend: include both sentiment and visibility scores
            const history = results.map((row: any) => {
                const metrics = row.brand_metrics as any;

                const sentimentScore = metrics?.overall_score ?? 0;
                const visibilityScore =
                    metrics?.visibility?.overall_visibility_score ??
                    sentimentScore;

                return {
                    date: row.created_at,
                    sentimentScore,
                    visibilityScore,
                };
            });

            // Get latest full result for hydration
            const latestResult = results.length > 0 ? results[results.length - 1].brand_metrics : null;

            res.json({ success: true, history, latestResult });

        } catch (error) {
            logger.error('Error fetching sentiment history:', error as Error);
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    }
);

export default router;
