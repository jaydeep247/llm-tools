import express from 'express';
import { Logger } from '../../helpers/logging/Logger.js';

const router = express.Router();
const logger = Logger.getInstance();

const AEO_API_BASE_URL = process.env.AEO_API_BASE_URL || 'http://localhost:8000';

router.post('/ranking-analysis',
    async (req: express.Request, res: express.Response) => {
        try {
            logger.info('Proxying Ranking Analysis request to FastAPI', {
                url: req.body?.url,
                promptsCount: req.body?.prompts?.length
            });

            const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/ranking-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
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
