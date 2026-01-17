import express from 'express';
import { Logger } from '../../helpers/logging/Logger.js';
import { getPool } from '../../config/dbConnection.js';

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
                const pool = getPool();
                // We use a simplified URL key to track history for this brand, appending timestamp for uniqueness
                const trackingUrl = `sentiment-tracker:${req.body.brand_name}:${Date.now()}`;

                logger.info(`[DEBUG] Attempting to save history. URL: ${trackingUrl}`, {
                    brand: req.body.brand_name,
                    url: trackingUrl
                });

                await pool.query(
                    `INSERT INTO aeo_results (url, brand_metrics, created_at) 
                     VALUES ($1, $2, NOW())`,
                    [trackingUrl, data]
                );
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
router.get('/sentiment-history/:brandName',
    async (req: express.Request, res: express.Response) => {
        try {
            const { brandName } = req.params;
            const trackingUrl = `sentiment-tracker:${brandName}`;
            const pool = getPool();

            const result = await pool.query(
                `SELECT brand_metrics, created_at 
                 FROM aeo_results 
                 WHERE url LIKE $1 
                 ORDER BY created_at ASC`,
                [`sentiment-tracker:${brandName}:%`]
            );

            // Format for frontend
            const history = result.rows.map((row: any) => ({
                date: row.created_at,
                score: row.brand_metrics?.overall_score || 0
            }));

            // Get latest full result for hydration
            const latestResult = result.rows.length > 0 ? result.rows[result.rows.length - 1].brand_metrics : null;

            res.json({ success: true, history, latestResult });

        } catch (error) {
            logger.error('Error fetching sentiment history:', error as Error);
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    }
);

export default router;
