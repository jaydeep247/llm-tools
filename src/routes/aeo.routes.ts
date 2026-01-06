import express from 'express';
import { Logger } from '../logging/Logger.js';
import { authenticateUser, checkUsageLimit } from '../auth/authMiddleware.js';

const router = express.Router();
const logger = Logger.getInstance();

// AEO API base URL - should match the aeo-api service
const AEO_API_BASE_URL = process.env.AEO_API_BASE_URL || 'http://localhost:8000';

// Proxy AEO analysis requests to FastAPI
router.post('/analyze',
    authenticateUser,
    checkUsageLimit('aeo_analysis'),
    async (req, res) => {
        const startTime = Date.now();
        try {
            const userId = req.user!.userId;
            const db = await import('../database/DatabaseService.js').then(m => m.getDatabase());

            logger.info('=== AEO ANALYZE REQUEST START ===', {
                userId,
                url: req.body.url,
                hasCompetitorUrls: !!req.body.competitor_urls,
                timestamp: new Date().toISOString()
            });

            logger.info('Proxying AEO analysis request to FastAPI', {
                userId,
                targetUrl: `${AEO_API_BASE_URL}/api/aeo/analyze`,
                requestBody: req.body
            });

            const fetchStartTime = Date.now();
            const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(req.body),
            });
            const fetchDuration = Date.now() - fetchStartTime;

            logger.info('FastAPI response received', {
                status: response.status,
                statusText: response.statusText,
                duration: `${fetchDuration}ms`,
                contentType: response.headers.get('content-type')
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`FastAPI AEO analysis failed: ${response.status} - ${errorText}`);
                return res.status(response.status).json({
                    error: 'AEO analysis failed',
                    details: errorText
                });
            }

            logger.info('Parsing FastAPI response JSON...');
            const data = await response.json();
            logger.info('FastAPI response parsed successfully', {
                success: data.success,
                hasResults: !!data.results,
                error: data.error
            });

            // Track user usage
            try {
                await db.recordUserUsage(userId, 'aeo_analysis', 1);
                logger.info('User usage tracked successfully');
            } catch (error) {
                logger.error('Failed to track AEO usage', error as Error);
            }

            // Save AEO analysis results to database
            if (data.success && data.results) {
                try {
                    const result = data.results;
                    const url = req.body.url;
                    const explicitSessionId = req.body.sessionId;

                    logger.info('Saving AEO results to database...', {
                        url,
                        explicitSessionId,
                        hasResults: !!result
                    });

                    // Use explicit sessionId if provided, otherwise find latest
                    let sessionId = explicitSessionId;
                    if (!sessionId) {
                        const latestSession = await db.getLatestSessionByUrl(url, userId);
                        sessionId = latestSession?.id;
                        logger.info('Found latest session', { sessionId });
                    }

                    await db.saveAeoAnalysisResult({
                        sessionId: sessionId,
                        url: url,
                        userId: userId,
                        grade: result.grade || 'N/A',
                        gradeColor: result.grade_color || '#666666',
                        overallScore: result.overall_score || 0,
                        moduleScores: result.module_scores,
                        moduleWeights: result.module_weights,
                        detailedAnalysis: result.detailed_analysis,
                        structuredData: result.structured_data,
                        recommendations: result.all_recommendations || result.recommendations,
                        errors: result.errors,
                        warnings: result.warnings,
                        analysisTimestamp: result.analysis_timestamp || new Date().toISOString(),
                        runId: result.run_id
                    });

                    logger.info('AEO analysis results saved to database successfully', {
                        userId,
                        url,
                        sessionId,
                        grade: result.grade
                    });
                } catch (error) {
                    logger.error('Failed to save AEO results to database', error as Error);
                }
            }

            const totalDuration = Date.now() - startTime;
            logger.info('=== AEO ANALYZE REQUEST COMPLETE ===', {
                userId,
                totalDuration: `${totalDuration}ms`,
                success: data.success
            });

            res.json(data);
        } catch (error) {
            const totalDuration = Date.now() - startTime;
            logger.error(
                '=== AEO ANALYZE REQUEST FAILED ===',
                error instanceof Error ? error : undefined,
                {
                    duration: `${totalDuration}ms`
                }
            );
            res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

// Proxy AEO health check requests to FastAPI
router.get('/health', async (req, res) => {
    try {
        logger.info('Proxying AEO health check to FastAPI');

        const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/health`);

        if (!response.ok) {
            logger.error(`FastAPI AEO health check failed: ${response.status}`);
            return res.status(response.status).json({
                error: 'AEO service unhealthy',
                status: 'unhealthy'
            });
        }

        const data = await response.json();
        logger.info('AEO health check completed');
        res.json(data);
    } catch (error) {
        logger.error('AEO health check proxy error:', error as Error);
        res.status(500).json({
            error: 'AEO service unavailable',
            status: 'unhealthy',
            details: (error as Error).message
        });
    }
});

// Proxy AEO schema generation requests to FastAPI
router.post('/generate-schema',
    authenticateUser,
    checkUsageLimit('schema_generation'),
    async (req, res) => {
        try {
            const userId = req.user!.userId;
            const db = await import('../database/DatabaseService.js').then(m => m.getDatabase());

            logger.info('Proxying schema generation request to FastAPI', { userId, url: req.body.url, type: req.body.schema_type });
            console.log(`[Proxy] Sending schema generation request for: ${req.body.url} (${req.body.schema_type})`);

            const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/generate-schema`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(req.body),
            });

            console.log(`[Proxy] Python API Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Proxy] Error from Python API:`, errorText);
                logger.error(`FastAPI schema generation failed: ${response.status} - ${errorText}`);
                return res.status(response.status).json({
                    error: 'Schema generation failed',
                    details: errorText
                });
            }

            const responseText = await response.text();
            console.log(`[Proxy] Raw response length: ${responseText.length}`);
            console.log(`[Proxy] Raw response preview: ${responseText.substring(0, 200)}...`);

            let data;
            try {
                data = JSON.parse(responseText);
                console.log(`[Proxy] Successfully parsed JSON response. Success: ${data.success}`);
            } catch (e) {
                console.error(`[Proxy] Failed to parse JSON response:`, e);
                throw new Error('Invalid JSON received from Python API');
            }

            // Track user usage
            try {
                await db.recordUserUsage(userId, 'schema_generation', 1);
            } catch (error) {
                logger.error('Failed to track schema generation usage', error as Error);
            }

            logger.info('Schema generation completed successfully', { userId });
            res.json(data);
        } catch (error) {
            console.error('[Proxy] Schema generation exception:', error);
            logger.error('Schema generation proxy error:', error as Error);
            res.status(500).json({
                error: 'Schema generation service unavailable',
                details: (error as Error).message
            });
        }
    });

// Retrieve stored AEO analysis results by session ID
router.get('/results/:sessionId',
    authenticateUser,
    async (req, res) => {
        try {
            const { sessionId } = req.params;
            const db = await import('../database/DatabaseService.js').then(m => m.getDatabase());

            const aeoResult = await db.getAeoAnalysisResultBySessionId(parseInt(sessionId, 10));

            if (!aeoResult) {
                return res.status(404).json({
                    error: 'No AEO analysis found for this session',
                    sessionId
                });
            }

            logger.info('Retrieved AEO analysis results', { sessionId });
            res.json({
                success: true,
                results: aeoResult
            });
        } catch (error) {
            logger.error('Error retrieving AEO analysis results:', error as Error);
            res.status(500).json({
                error: 'Failed to retrieve AEO analysis results',
                details: (error as Error).message
            });
        }
    });

export default router;
