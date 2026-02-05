import express from 'express';
import { MultiModelScoringService } from '../../helpers/module_E/MultiModelScoringService.js';
import { aeoMetricsRepository } from '../../models/repositories/aeoMetricsRepository.js';
import { Logger } from '../../helpers/logging/Logger.js';
import { authenticateUser, checkUsageLimit } from '../../middleware/authMiddleware.js';

const router = express.Router();
const logger = Logger.getInstance();

// AEO API base URL - should match the aeo-api service
const AEO_API_BASE_URL = process.env.AEO_API_BASE_URL || 'http://localhost:8000';

// Proxy AEO analysis requests to FastAPI
router.post('/analyze',
    authenticateUser,
    checkUsageLimit('aeo_analysis'),
    async (req: express.Request, res: express.Response) => {
        const startTime = Date.now();
        try {
            const userId = req.user!.userId;
            const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());

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
            // ✅ FIX: Cast object to 'any' to prevent TS error "Property 'error' does not exist on type 'Error'"
            logger.error('=== AEO ANALYZE REQUEST FAILED ===', {
                message: error instanceof Error ? error.message : String(error), // Changed 'error' to 'message'
                stack: error instanceof Error ? error.stack : undefined,
                duration: `${totalDuration}ms`
            } as any);

            res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

// Proxy AEO bulk analysis requests to FastAPI
router.post('/analyze-bulk',
    authenticateUser,
    checkUsageLimit('aeo_analysis'),
    async (req: express.Request, res: express.Response) => {
        const startTime = Date.now();
        try {
            const userId = req.user!.userId;
            const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());

            logger.info('=== AEO BULK ANALYZE REQUEST START ===', {
                userId,
                hasSitemap: !!req.body.sitemap,
                hasUrls: !!req.body.urls,
                urlCount: req.body.urls?.length || 0,
                timestamp: new Date().toISOString()
            });

            logger.info('Proxying AEO bulk analysis request to FastAPI', {
                userId,
                targetUrl: `${AEO_API_BASE_URL}/api/aeo/analyze-bulk`,
                requestBody: req.body
            });

            const fetchStartTime = Date.now();
            const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/analyze-bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(req.body),
            });
            const fetchDuration = Date.now() - fetchStartTime;

            logger.info('FastAPI bulk analysis response received', {
                status: response.status,
                statusText: response.statusText,
                duration: `${fetchDuration}ms`,
                contentType: response.headers.get('content-type')
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`FastAPI bulk AEO analysis failed: ${response.status} - ${errorText}`);
                return res.status(response.status).json({
                    error: 'Bulk AEO analysis failed',
                    details: errorText
                });
            }

            logger.info('Parsing FastAPI bulk analysis response JSON...');
            const data = await response.json();
            logger.info('FastAPI bulk analysis response parsed successfully', {
                success: data.success,
                hasData: !!data.data,
                error: data.error
            });

            // Track user usage (count each URL analyzed)
            try {
                const urlCount = req.body.urls?.length || 0;
                if (urlCount > 0) {
                    await db.recordUserUsage(userId, 'aeo_analysis', urlCount);
                    logger.info('User usage tracked successfully', { urlCount });
                }
            } catch (error) {
                logger.error('Failed to track bulk AEO usage', error as Error);
            }

            const totalDuration = Date.now() - startTime;
            logger.info('=== AEO BULK ANALYZE REQUEST COMPLETE ===', {
                userId,
                totalDuration: `${totalDuration}ms`,
                success: data.success
            });

            res.json(data);
        } catch (error: any) {
            const totalDuration = Date.now() - startTime;
            logger.error('=== AEO BULK ANALYZE REQUEST FAILED ===', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                duration: `${totalDuration}ms`
            } as any);

            res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);


// Proxy AEO health check requests to FastAPI
router.get('/health', async (req: express.Request, res: express.Response) => {
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
    async (req: express.Request, res: express.Response) => {
        try {
            const userId = req.user!.userId;
            const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());

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
    async (req: express.Request, res: express.Response) => {
        try {
            const { sessionId } = req.params;
            const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());

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

                // Inject model_wise_performance and response_accuracy for Module E
                if (multiModelResult.model_wise_performance) {
                    finalResult.module_scores = finalResult.module_scores || {};
                    finalResult.module_scores.model_wise_performance = multiModelResult.model_wise_performance;
                }
                if (multiModelResult.response_accuracy != null) {
                    finalResult.module_scores = finalResult.module_scores || {};
                    finalResult.module_scores.response_accuracy = multiModelResult.response_accuracy;
                }
                if (multiModelResult.citation_metrics != null) {
                    finalResult.citation_metrics = multiModelResult.citation_metrics;
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

// Website Score Endpoint (Content Consistency + Entity Coverage; does NOT use DataForSEO)
router.post('/website-score', async (req: express.Request, res: express.Response) => {
    try {
        const { url, sessionId } = req.body;
        console.log('[MODULE E DEBUG] /website-score called: url=' + url + ', sessionId=' + sessionId);

        logger.info('=== MODULE E: /website-score endpoint called ===', {
            url,
            sessionId,
            hasSessionId: !!sessionId,
            sessionIdType: typeof sessionId
        });

        if (!url) {
            return res.status(400).json({ success: false, error: 'URL is required' });
        }

        // Prefer LIVE FETCH first to get real HTML content (fixes topic extraction).
        // Fall back to DB when fetch fails.
        try {
            let text = '';
            let statusCode = 200;
            let actualWordCount: number | undefined;
            let contentSource: 'live_fetch' | 'db_fallback' = 'live_fetch';
            const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());

            /** Build content from DB pages: aggregate title, description, meta from top pages for better topic extraction */
            const buildTextFromPages = (pages: any[]): { text: string; actualWordCount?: number } => {
                if (!pages?.length) return { text: '' };
                const parts: string[] = [];
                let totalWords = 0;
                const topPages = pages
                    .filter((p: any) => (p.statusCode ?? p.status_code) === 200)
                    .sort((a: any, b: any) => (b.wordCount || 0) - (a.wordCount || 0))
                    .slice(0, 5);
                for (const p of topPages) {
                    if (p.title) parts.push(`Title: ${p.title}`);
                    if (p.description) parts.push(`Description: ${p.description}`);
                    if (p.metaDescription && p.metaDescription !== p.description) parts.push(`Meta: ${p.metaDescription}`);
                    if (p.ogDescription) parts.push(`OG: ${p.ogDescription}`);
                    if (p.headingTags) parts.push(`Headings: ${p.headingTags}`);
                    totalWords += p.wordCount ?? 0;
                }
                const combined = parts.join('\n\n');
                logger.info('MODULE E: buildTextFromPages', { pageCount: topPages.length, combinedLen: combined.length, totalWords });
                return { text: combined, actualWordCount: totalWords || Math.ceil(combined.length / 5) };
            };

            // 1) Try live fetch FIRST to get real HTML (ensures good content for topic extraction)
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30000);
                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);
                if (response.ok) {
                    text = await response.text();
                    statusCode = response.status;
                    contentSource = 'live_fetch';
                    actualWordCount = Math.ceil(text.length / 5);
                    logger.info('MODULE E: Using content from live fetch', { url, contentLength: text.length, statusCode });
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (fetchError) {
                logger.warn('MODULE E: Live fetch failed, falling back to DB', {
                    url,
                    sessionId,
                    error: (fetchError as Error).message,
                });

                // 2) Fall back to DB when fetch fails
            if (sessionId) {
                let pages = await db.getPages(sessionId, 10000, 0);
                if (pages.length === 0) {
                    await new Promise(r => setTimeout(r, 3000));
                    pages = await db.getPages(sessionId, 10000, 0);
                }
                const fromDb = buildTextFromPages(pages);
                if (fromDb.text) {
                    text = fromDb.text;
                    actualWordCount = fromDb.actualWordCount;
                        contentSource = 'db_fallback';
                        logger.info('MODULE E: Using content from DB fallback', { sessionId, contentLength: text.length });
                    }
                }
                    if (!sessionId) {
                        const pages = await db.getPages(undefined, 10000, 0);
                        const fromDb = buildTextFromPages(pages);
                        if (fromDb.text) {
                            text = fromDb.text;
                            actualWordCount = fromDb.actualWordCount;
                        contentSource = 'db_fallback';
                    }
                }
            }

            if (!text || text.trim().length === 0) {
                logger.warn('MODULE E: No content available', { url, sessionId });
                return res.status(400).json({
                    success: false,
                    error: 'Could not fetch URL for analysis',
                    details: {
                        message: 'No content available. The crawl may still be in progress.',
                        suggestion: 'Wait for the crawl to complete and try again in a few seconds.'
                    }
                });
            }

            const wordCount = actualWordCount !== undefined ? actualWordCount : Math.ceil(text.length / 5);
            const pagesForScore = [{ url, content: text, title: 'Homepage', word_count: wordCount, status_code: statusCode }];
            logger.info('MODULE E: Calling generateWebsiteScores', {
                url,
                sessionId,
                contentLength: text.length,
                wordCount,
                pagesCount: pagesForScore.length,
                contentSource: contentSource!,
            });
            console.log('[MODULE E DEBUG] generateWebsiteScores: contentSource=' + (contentSource ?? 'unknown') + ', contentLength=' + text.length + ', url=' + url);

            let scores: any;
            const runScoring = () => MultiModelScoringService.generateWebsiteScores(url, pagesForScore, sessionId);
            try {
                scores = await runScoring();
            } catch (genErr) {
                const errMsg = (genErr as Error)?.message || '';
                const isFetchFailed = /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(errMsg);
                if (isFetchFailed) {
                    logger.warn('MODULE E: Scoring failed (likely Python unreachable), retrying once in 3s', { message: errMsg });
                    await new Promise(r => setTimeout(r, 3000));
                    try {
                        scores = await runScoring();
                    } catch (retryErr) {
                        logger.error('MODULE E: generateWebsiteScores retry also failed', retryErr as Error);
                        throw retryErr;
                    }
                } else {
                    logger.error('MODULE E: generateWebsiteScores threw', genErr as Error);
                    console.error('[MODULE E DEBUG] generateWebsiteScores failed:', errMsg);
                    throw genErr;
                }
            }

            logger.info('MODULE E: Scores generated', {
                hasScores: !!scores,
                consistency: scores?.consistency,
                hasEntityCoverage: !!scores?.entity_coverage,
                entityCoverageScore: scores?.entity_coverage?.score,
                hasBrandMetrics: !!scores?.brand_metrics,
                brandName: scores?.brand_metrics?.brand_name
            });
            console.log('[MODULE E DEBUG] Content Consistency score:', scores?.consistency, '(undefined = N/A)');
            console.log('[MODULE E DEBUG] Entity Coverage score:', scores?.entity_coverage?.score, '(undefined = N/A)');

            // Save Module E results to database for history view
            if (sessionId && scores) {
                logger.info('MODULE E: Attempting to save to database', { sessionId, url });
                try {
                    const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());

                    const dataToSave = {
                        session_id: sessionId,
                        url: url,
                        consistency: scores.consistency,
                        score_entity_coverage: scores.entity_coverage?.score,
                        entities_expected: scores.entity_coverage?.entities_expected,
                        entities_observed: scores.entity_coverage?.entities_observed,
                        entities_missing: scores.entity_coverage?.entities_missing,
                        brand_metrics: scores.brand_metrics,
                        response_accuracy: scores.response_accuracy
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
            logger.error('MODULE E: Error in scoring endpoint', fetchError as Error, {
                url: req.body.url,
                sessionId: req.body.sessionId
            });
            return res.status(400).json({
                success: false,
                error: 'Could not fetch URL for analysis',
                details: {
                    message: (fetchError as Error).message,
                    suggestion: 'The crawl may still be in progress. Please wait and try again.'
                }
            });
        }

    } catch (error) {
        logger.error('Error in website-score endpoint:', error as Error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// Proxy competitor mentions to FastAPI (DataForSEO phrase_trends)
router.post('/analyze-competitors-mentions',
    authenticateUser,
    async (req: express.Request, res: express.Response) => {
        try {
            const { competitors, brand_name } = req.body || {};
            if (!Array.isArray(competitors) || competitors.length === 0) {
                return res.status(400).json({ success: false, error: 'competitors array is required' });
            }

            logger.info('Proxying competitor mentions request', {
                competitorsCount: competitors.length,
                hasBrandName: !!brand_name
            });

            const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/analyze-competitors-mentions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ competitors, brand_name: brand_name || undefined })
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.warn(`Competitor mentions API failed: ${response.status} - ${errorText}`);
                return res.status(response.status).json({
                    success: false,
                    error: errorText || 'Competitor mentions analysis failed'
                });
            }

            const data = await response.json();
            
            // Save Share of Voice data if available
            if (data.share_of_voice && req.body.sessionId) {
                try {
                    const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());
                    await db.insertAeoResultsTable({
                        session_id: req.body.sessionId,
                        url: req.body.url || 'competitor-mentions',
                        share_of_voice: data.share_of_voice
                    });
                    logger.info('Share of Voice data saved successfully');
                } catch (saveError) {
                    logger.warn('Failed to save Share of Voice data', saveError as Error);
                }
            }
            
            res.json(data);
        } catch (error) {
            logger.error('Competitor mentions proxy error:', error as Error);
            res.status(500).json({
                success: false,
                error: (error as Error).message || 'Service unavailable'
            });
        }
    }
);

// Proxy brand analysis to FastAPI
router.post('/analyze-brand',
    authenticateUser,
    async (req: express.Request, res: express.Response) => {
        try {
            const { brand_name } = req.body || {};
            if (!brand_name) {
                return res.status(400).json({ success: false, error: 'brand_name is required' });
            }

            const { sessionId: reqSessionId, url: reqUrl } = req.body || {};
            logger.info('[BRAND PULSE] ⚡ Endpoint called - Proxying brand analysis request', {
                brandName: brand_name,
                sessionId: reqSessionId || 'NOT PROVIDED',
                url: reqUrl || 'NOT PROVIDED',
                body: JSON.stringify(req.body).substring(0, 300)
            });

            const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/analyze-brand`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brand_name })
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.warn(`Brand analysis API failed: ${response.status} - ${errorText}`);
                return res.status(response.status).json({
                    success: false,
                    error: errorText || 'Brand analysis failed'
                });
            }

            const data = await response.json();
            
            // Log the response structure for debugging
            logger.info(`[BRAND PULSE] API response received`, {
                hasSuccess: !!data.success,
                success: data.success,
                hasData: !!data.data,
                dataKeys: data.data ? Object.keys(data.data) : [],
                fullResponse: JSON.stringify(data).substring(0, 500)
            });
            
            // --- SAVE TO DATABASE FOR HISTORY ---
            if (data.success && data.data) {
                try {
                    // Extract sessionId and url from request (already extracted above)
                    const sessionId = reqSessionId;
                    const url = reqUrl;
                    const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());
                    const { prisma } = await import('../../config/prismaClient.js');

                    // Extract brand metrics from response
                    const brandMetrics = {
                        brand_name: data.data.brand_name,
                        total_mentions: data.data.total_mentions,
                        sentiment: data.data.sentiment,
                        frequency_trend: data.data.frequency_trend || []
                    };

                    // Use sessionId if provided, otherwise create a tracking URL
                    // If sessionId exists, try to get the session URL, otherwise use provided url or create tracking URL
                    let saveUrl = url;
                    if (sessionId && !saveUrl) {
                        try {
                            const session = await prisma.crawlSession.findUnique({
                                where: { id: sessionId },
                                select: { startUrl: true }
                            });
                            saveUrl = session?.startUrl || `brand-pulse:${brand_name}:${Date.now()}`;
                        } catch (e) {
                            saveUrl = `brand-pulse:${brand_name}:${Date.now()}`;
                        }
                    }
                    if (!saveUrl) {
                        saveUrl = `brand-pulse:${brand_name}:${Date.now()}`;
                    }

                    logger.info(`[BRAND PULSE] Attempting to save to database`, {
                        brand: brand_name,
                        url: saveUrl,
                        hasSessionId: !!sessionId,
                        sessionId: sessionId || 'none',
                        totalMentions: brandMetrics.total_mentions,
                        requestUrl: url || 'NOT PROVIDED',
                        requestSessionId: sessionId || 'NOT PROVIDED'
                    });

                    // Use DatabaseService to save (handles sessionId properly)
                    const dataToSave = {
                        session_id: sessionId || undefined,
                        url: saveUrl,
                        brand_metrics: brandMetrics,
                        consistency: 0, // Not applicable for brand pulse
                        score_entity_coverage: 0, // Not applicable
                        entities_expected: [],
                        entities_observed: [],
                        entities_missing: []
                    };

                    if (sessionId) {
                        // Update existing record if sessionId exists
                        await db.insertAeoResultsTable(dataToSave);
                        logger.info(`[BRAND PULSE] ✅ Successfully saved/updated brand pulse data for sessionId=${sessionId}`);
                    } else {
                        // Create new record without sessionId
                        await prisma.aeoResult.create({
                            data: {
                                url: saveUrl,
                                brandMetrics: brandMetrics as any,
                            },
                        });
                        logger.info(`[BRAND PULSE] ✅ Successfully saved brand pulse history for ${saveUrl}`);
                    }
                } catch (dbError: any) {
                    const errorObj = dbError instanceof Error ? dbError : new Error(dbError?.message || String(dbError));
                    logger.error(`[BRAND PULSE] ❌ Failed to save brand pulse data`, errorObj, {
                        code: (dbError as any)?.code,
                        brand: brand_name
                    });
                    // Non-blocking: don't fail the request if save fails
                }
            } else {
                logger.warn(`[BRAND PULSE] ⚠️ Skipping database save - invalid response structure`, {
                    success: data.success,
                    hasData: !!data.data,
                    response: JSON.stringify(data).substring(0, 300)
                });
            }
            
            res.json(data);
        } catch (error) {
            logger.error('Brand analysis proxy error:', error as Error);
            res.status(500).json({
                success: false,
                error: (error as Error).message || 'Service unavailable'
            });
        }
    }
);

// --- NEW: Proxy AI Answer Simulation Request ---
router.post('/simulate-answer',
    authenticateUser,
    async (req: express.Request, res: express.Response) => {
        try {
            const userId = req.user!.userId;

            logger.info('Proxying AI Simulation request to FastAPI', {
                userId,
                url: req.body.url,
                query: req.body.query
            });

            // Forward to Python Backend
            const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/simulate-answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`FastAPI AI Simulation failed: ${response.status} - ${errorText}`);
                return res.status(response.status).json({
                    error: 'AI Simulation Failed',
                    details: errorText
                });
            }

            const data = await response.json();
            res.json(data);

        } catch (error) {
            logger.error('AI Simulation proxy error:', error as Error);
            res.status(500).json({
                error: 'AI Simulation service unavailable',
                details: (error as Error).message
            });
        }
    }
);



export default router;