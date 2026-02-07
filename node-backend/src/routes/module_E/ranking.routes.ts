import express from 'express';
import { Logger } from '../../helpers/logging/Logger.js';

const router = express.Router();
const logger = Logger.getInstance();

const AEO_API_BASE_URL = (process.env.AEO_API_BASE_URL || 'http://127.0.0.1:8000').replace('localhost', '127.0.0.1');

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

            const fullUrl = `${AEO_API_BASE_URL}/api/aeo/ranking-analysis`;
            logger.info(`Proxying request to Python: ${fullUrl}`);

            // Build forwarding payload explicitly so we can log and validate it
            const forwardPayload: any = { url };
            if (prompts) forwardPayload.prompts = prompts;
            if (location) forwardPayload.location = location;
            if (topicOverride) forwardPayload.topic_override = topicOverride;

            logger.debug('[ranking] Forwarding payload to Python:', forwardPayload);

            const controller = new AbortController();
            // 🔧 FIX: Increase timeout from 5min to 10min to accommodate slow Python backend
            // Python processes 5 prompts × 3 LLM models = 15 API calls to DataForSEO
            const timeout = setTimeout(() => controller.abort(), 600000); // 10 minute timeout

            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify(forwardPayload),
            });
            clearTimeout(timeout);

            // Capture and log Python response body for debugging
            let pythonRespText = '';
            try {
                pythonRespText = await response.text();
            } catch (e) {
                logger.error('[ranking] Failed to read Python response text', e);
            }

            logger.debug('[ranking] Python response status:', response.status, 'body preview:', pythonRespText?.substring?.(0, 400));

            if (!response.ok) {
                logger.warn(`[ranking] Python ranking endpoint returned HTTP ${response.status}; coercing to safe empty result`);
                const safeEmpty = {
                    success: true,
                    url: url,
                    ranking_position_per_prompt: [],
                    percentile_by_prompt: {},
                    model_wise_comparison: [{ prompt: '', chat_gpt: null, claude: null, gemini: null }],
                    content_quality: { overall_score: 0, by_prompt_model: {} },
                    entity_coverage: { score: 0, found_entities: [], missing_entities: [], total_expected: 0 },
                    errors: [`Python HTTP ${response.status}`]
                };

                if (sessionId != null) {
                    try {
                        const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());
                        await db.audits.updateCitationMetricsForSession(Number(sessionId), {
                            ranking_metrics: safeEmpty.ranking_position_per_prompt ? { ranking_position_per_prompt: [] } : {},
                            citation_metrics: { content_quality: safeEmpty.content_quality, entity_coverage: safeEmpty.entity_coverage },
                            url: url
                        });
                        logger.info(`[ranking] Persisted empty ranking for sessionId=${sessionId}`);
                    } catch (saveErr: any) {
                        logger.warn(`[ranking] Failed to persist empty ranking for sessionId=${sessionId}: ${saveErr?.message}`);
                    }
                }

                return res.json(safeEmpty);
            }

            // Try to parse JSON; if parse fails, include raw text and coerce
            let data: any;
            try {
                data = pythonRespText ? JSON.parse(pythonRespText) : undefined;
            } catch (e) {
                logger.warn('[ranking] Could not parse Python response as JSON, coercing to safe empty result');
                data = { success: false, raw: pythonRespText };
            }
            logger.info(`[ranking] Received Python API response: success=${data?.success}, rankingRows=${data?.ranking_position_per_prompt?.length}`);

            if (sessionId != null && !data?.success) {
                logger.warn(`[ranking] Python returned success=false, coercing to empty result for sessionId=${sessionId}`);
                const safeEmpty = {
                    success: true,
                    url: data?.url || url,
                    ranking_position_per_prompt: [],
                    percentile_by_prompt: {},
                    model_wise_comparison: [{ prompt: '', chat_gpt: null, claude: null, gemini: null }],
                    content_quality: { overall_score: 0, by_prompt_model: {} },
                    entity_coverage: { score: 0, found_entities: [], missing_entities: [], total_expected: 0 },
                    errors: data?.errors || []
                };

                try {
                    const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());
                    await db.audits.updateCitationMetricsForSession(Number(sessionId), {
                        ranking_metrics: safeEmpty.ranking_position_per_prompt ? { ranking_position_per_prompt: [] } : {},
                        citation_metrics: { content_quality: safeEmpty.content_quality, entity_coverage: safeEmpty.entity_coverage },
                        url: safeEmpty.url
                    });
                    logger.info(`[ranking] Persisted coerced empty ranking for sessionId=${sessionId}`);
                } catch (saveErr: any) {
                    logger.warn(`[ranking] Failed to persist coerced empty ranking for sessionId=${sessionId}: ${saveErr?.message}`);
                }

                return res.json(safeEmpty);
            }

            if (sessionId != null && data?.success) {
                try {
                    const db = await import('../../services/DatabaseService.js').then(m => m.getDatabase());
                    const rankingMetrics = {
                        ranking_position_per_prompt: data.ranking_position_per_prompt,
                        percentile_by_prompt: data.percentile_by_prompt,
                        model_wise_comparison: data.model_wise_comparison,
                    };
                    const citationMetrics = {
                        content_quality: data.content_quality,
                        entity_coverage: data.entity_coverage,
                    };

                    logger.debug(`[ranking] Saving to DB for sessionId=${sessionId}`, {
                        hasRanking: !!rankingMetrics.ranking_position_per_prompt,
                        hasCitation: !!citationMetrics.content_quality
                    });

                    const saved = await db.audits.updateCitationMetricsForSession(Number(sessionId), {
                        ranking_metrics: rankingMetrics,
                        citation_metrics: citationMetrics,
                        url: data.url,
                    });
                    if (saved) {
                        logger.info(`[ranking] ✅ Saved ranking and citation metrics for sessionId=${sessionId}`);
                    } else {
                        logger.warn(`[ranking] ⚠️ No AeoResult found for sessionId=${sessionId}, metrics not persisted`);
                    }
                } catch (dbErr: any) {
                    logger.error(`[ranking] ❌ Failed to save ranking metrics: ${dbErr?.message}`, dbErr);
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
