import express from 'express';
import { MultiModelScoringService } from '../modules/module_E/MultiModelScoringService.js';
import { getPool } from '../database/dbConnection.js';
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
        } catch (error: any) {
            const totalDuration = Date.now() - startTime;
            logger.error('=== AEO ANALYZE REQUEST FAILED ===', error instanceof Error ? error : new Error(String(error)), {
                duration: `${totalDuration}ms`
            });
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
            const multiModelResult = await db.getAeoResultsTableBySessionId(parseInt(sessionId, 10));

            logger.info('DEBUG: Retrieved results', {
                hasAeoResult: !!aeoResult,
                hasMultiModelResult: !!multiModelResult,
                multiModelResult: multiModelResult
            });

            if (!aeoResult && !multiModelResult) {
                return res.status(404).json({
                    error: 'No AEO analysis found for this session',
                    sessionId
                });
            }


            // Merge logic: Ensure brand_metrics from multiModelResult is available in the response
            // Parse aeoResult if it's a string (stored as JSON in DB)
            let finalResult = aeoResult || { session_id: parseInt(sessionId, 10), module_scores: {} };

            // If aeoResult is a string, parse it
            if (typeof finalResult === 'string') {
                try {
                    finalResult = JSON.parse(finalResult);
                } catch (parseError) {
                    logger.error('Failed to parse aeoResult JSON string:', parseError as Error);
                    finalResult = { session_id: parseInt(sessionId, 10), module_scores: {} };
                }
            }

            // Also parse module_scores if it's a string (nested JSON)
            if (finalResult.module_scores && typeof finalResult.module_scores === 'string') {
                try {
                    finalResult.module_scores = JSON.parse(finalResult.module_scores);
                } catch (parseError) {
                    logger.error('Failed to parse module_scores JSON string:', parseError as Error);
                    finalResult.module_scores = {};
                }
            }

            logger.info('DEBUG: Before merge', {
                finalResultModuleScores: finalResult.module_scores,
                multiModelBrandMetrics: multiModelResult?.brand_metrics,
                multiModelConsistency: multiModelResult?.consistency,
                multiModelEntityCoverage: multiModelResult?.entity_coverage
            });

            if (multiModelResult) {
                // Initialize module_scores if missing
                if (!finalResult.module_scores) {
                    finalResult.module_scores = {};
                }

                // Inject Brand Metrics if available and not already present
                if (multiModelResult.brand_metrics) {
                    finalResult.module_scores.brand_metrics = multiModelResult.brand_metrics;
                    logger.info('DEBUG: Injected brand_metrics');
                }

                // Inject other scores if missing (Consistency, Entity Coverage)
                if (multiModelResult.consistency && !finalResult.module_scores.consistency) {
                    finalResult.module_scores.consistency = multiModelResult.consistency;
                    logger.info('DEBUG: Injected consistency');
                }

                // Attach entity coverage detailed result if needed by frontend
                if (multiModelResult.entity_coverage) {
                    finalResult.entity_coverage = multiModelResult.entity_coverage;
                    logger.info('DEBUG: Injected entity_coverage');
                }

                // Sync module_scores to moduleScores for frontend compatibility
                // This ensures AppWithAuth (which prefers moduleScores) receives the updated data
                if (finalResult.module_scores) {
                    finalResult.moduleScores = finalResult.module_scores;
                }
            }




            logger.info('Retrieved AEO analysis results', { sessionId, hasBrandMetrics: !!finalResult.module_scores?.brand_metrics });

            // Prevent caching to ensure fresh data
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            res.json({
                success: true,
                results: finalResult
            });
        } catch (error) {
            logger.error('Error retrieving AEO analysis results:', error as Error);
            res.status(500).json({
                error: 'Failed to retrieve AEO analysis results',
                details: (error as Error).message
            });
        }
    });

// Website Score Endpoint
router.post('/website-score', async (req, res) => {
    try {
        const { url, sessionId } = req.body;

        logger.info('=== MODULE E: /website-score endpoint called ===', {
            url,
            sessionId,
            hasSessionId: !!sessionId,
            sessionIdType: typeof sessionId
        });

        if (!url) {
            return res.status(400).json({ success: false, error: 'URL is required' });
        }

        // Ideally fetch homepage content dynamically or from DB
        // For now, we will fetch it live to ensure we have content for the AEO Service
        // This makes it robust even if the crawl DB is missing the content column
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch ${url}`);
            const text = await response.text();

            logger.info('MODULE E: Calling generateWebsiteScores', { url, sessionId });
            const scores = await MultiModelScoringService.generateWebsiteScores(url, [{
                url: url,
                content: text,
                title: 'Homepage',
                word_count: text.length / 5,
                status_code: response.status
            }], sessionId);

            logger.info('MODULE E: Scores generated', {
                hasScores: !!scores,
                consistency: scores?.consistency,
                hasEntityCoverage: !!scores?.entity_coverage,
                entityCoverageScore: scores?.entity_coverage?.score,
                hasBrandMetrics: !!scores?.brand_metrics,
                brandName: scores?.brand_metrics?.brand_name
            });

            // Save Module E results to database for history view
            if (sessionId && scores) {
                logger.info('MODULE E: Attempting to save to database', { sessionId, url });
                try {
                    const db = await import('../database/DatabaseService.js').then(m => m.getDatabase());

                    const dataToSave = {
                        session_id: sessionId,
                        url: url,
                        consistency: scores.consistency,
                        score_entity_coverage: scores.entity_coverage?.score,
                        entities_expected: scores.entity_coverage?.entities_expected,
                        entities_observed: scores.entity_coverage?.entities_observed,
                        entities_missing: scores.entity_coverage?.entities_missing,
                        brand_metrics: scores.brand_metrics
                    };

                    logger.info('MODULE E: Data prepared for save', {
                        session_id: dataToSave.session_id,
                        consistency: dataToSave.consistency,
                        score_entity_coverage: dataToSave.score_entity_coverage,
                        hasBrandMetrics: !!dataToSave.brand_metrics
                    });

                    const savedId = await db.insertAeoResultsTable(dataToSave);
                    logger.info('✅ MODULE E: Successfully saved to database!', { sessionId, url, savedId });
                } catch (saveError) {
                    logger.error('❌ MODULE E: Failed to save to database', saveError as Error, {
                        sessionId,
                        url
                    });
                    // Don't fail the request if save fails
                }
            } else {
                logger.warn('MODULE E: Skipping database save', {
                    hasSessionId: !!sessionId,
                    hasScores: !!scores,
                    sessionId,
                    url
                });
            }

            res.json({ success: true, scores });
        } catch (fetchError) {
            logger.error('Error fetching URL live for scoring:', fetchError as Error);
            return res.status(400).json({ success: false, error: 'Could not fetch URL for analysis' });
        }

    } catch (error) {
        logger.error('Error in website-score endpoint:', error as Error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

export default router;
