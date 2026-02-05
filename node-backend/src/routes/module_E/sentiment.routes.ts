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
                const { sessionId, url, brand_name } = req.body;
                const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());

                // Extract sentiment and visibility metrics from the response
                const sentimentMetrics = {
                    overall_score: data?.overall_score,
                    by_model: data?.by_model,
                    sentiment_distribution: data?.sentiment_distribution,
                    average_sentiment_score: data?.average_sentiment_score,
                    sentiment_trend: data?.sentiment_trend
                };
                const visibilityMetrics = {
                    overall_visibility_score: data?.visibility?.overall_visibility_score,
                    by_model: data?.visibility?.by_model,
                    trend: data?.visibility?.trend
                };

                // Use sessionId if provided, otherwise create a tracking URL
                const saveUrl = url || `sentiment-tracker:${brand_name || 'unknown'}:${Date.now()}`;

                logger.info(`[SENTIMENT] Attempting to save to database`, {
                    brand: brand_name,
                    url: saveUrl,
                    hasSessionId: !!sessionId,
                    sessionId: sessionId || 'none'
                });

                // Use DatabaseService to save (handles sessionId properly)
                const dataToSave = {
                    session_id: sessionId || undefined,
                    url: saveUrl,
                    brand_metrics: data,
                    sentiment_metrics: sentimentMetrics,
                    visibility_metrics: visibilityMetrics,
                    consistency: 0, // Not applicable for sentiment tracking
                    score_entity_coverage: 0, // Not applicable
                    entities_expected: [],
                    entities_observed: [],
                    entities_missing: []
                };

                if (sessionId) {
                    // Update existing record if sessionId exists
                    await db.insertAeoResultsTable(dataToSave);
                    logger.info(`[SENTIMENT] ✅ Successfully saved/updated sentiment data for sessionId=${sessionId}`);
                } else {
                    // Create new record without sessionId
                    // Try with new fields first, fallback to old schema if migration not applied
                    try {
                        await prisma.aeoResult.create({
                            data: {
                                url: saveUrl,
                                brandMetrics: data as any,
                                sentimentMetrics: sentimentMetrics as any,
                                visibilityMetrics: visibilityMetrics as any,
                            },
                        });
                        logger.info(`[SENTIMENT] ✅ Successfully saved sentiment history with new fields for ${saveUrl}`);
                    } catch (fieldError: any) {
                        // Fallback: save without new fields if migration not applied
                        if (fieldError.message?.includes('Unknown arg') || fieldError.message?.includes('does not exist')) {
                            logger.warn(`[SENTIMENT] New fields not available, saving with brandMetrics only`);
                            await prisma.aeoResult.create({
                                data: {
                                    url: saveUrl,
                                    brandMetrics: {
                                        ...data,
                                        sentiment_metrics: sentimentMetrics,
                                        visibility_metrics: visibilityMetrics
                                    } as any,
                                },
                            });
                            logger.info(`[SENTIMENT] ✅ Successfully saved sentiment history (fallback) for ${saveUrl}`);
                        } else {
                            throw fieldError; // Re-throw if it's a different error
                        }
                    }
                }
            } catch (dbError: any) {
                logger.error(`[SENTIMENT] ❌ Failed to save sentiment history`, {
                    error: dbError.message,
                    code: dbError.code,
                    stack: dbError.stack,
                    body: JSON.stringify(req.body).substring(0, 200)
                });
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
