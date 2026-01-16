import { Router } from 'express';
import { cancelAudits } from '../../crawler.js';
import { Logger } from '../../helpers/logging/Logger.js';

const router = Router();
const logger = Logger.getInstance();

// Cancel audits endpoint
router.post('/cancel-audits', (req, res) => {
    try {
        cancelAudits();
        logger.info('Audit cancellation requested by user');

        res.status(200).json({
            message: 'Audit cancellation requested',
            timestamp: new Date().toISOString(),
            success: true
        });
    } catch (error) {
        logger.error('Failed to cancel audits', error as Error);
        res.status(500).json({
            error: 'Failed to cancel audits',
            details: (error as Error).message,
            success: false
        });
    }
});

export default router;
