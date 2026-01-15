/**
 * Error Handler Module
 * Handles request errors during crawl
 */

import { log } from 'crawlee';
import { Logger } from '../../helpers/logging/Logger.js';
import { getDatabase } from '../../services/DatabaseService.js';
import { MetricsCollector } from '../../controllers/module_D/monitoring/MetricsCollector.js';
import { calculateFolderDepth, getCrawlDepthFromRequest } from '../../helpers/module_A/contentAnalysis/urlDepth.js';
import type { Request } from 'crawlee';
import type { CrawlEvents } from '../types/index.js';

const logger = Logger.getInstance();

interface ErrorHandlerContext {
    sessionId: number;
    events: CrawlEvents;
    metricsCollector?: MetricsCollector;
    requestStartTimes: Map<string, number>;
}

export function createErrorHandler(context: ErrorHandlerContext) {
    return async (params: any) => {
        const { request, error } = params;
        const { sessionId, events, metricsCollector, requestStartTimes } = context;
        const db = getDatabase();

        const warn = `Request failed ${request.url}: ${(error as Error).message}`;
        log.warning(warn);
        events.onLog?.(warn);

        const startTime = requestStartTimes.get(request.url) || Date.now();
        const responseTime = Date.now() - startTime;

        // Log failed request
        await db.insertPage({
            sessionId,
            url: request.url,
            title: 'Request Failed',
            titleLength: 0,
            description: `Error: ${(error as Error).message}`,
            descriptionLength: 0,
            contentType: 'Unknown',
            lastModified: null,
            statusCode: 0,
            responseTime,
            wordCount: 0,
            sentenceCount: 0,
            averageWordsPerSentence: 0,
            crawlDepth: getCrawlDepthFromRequest(request),
            folderDepth: calculateFolderDepth(request.url),
            timestamp: new Date().toISOString(),
            success: false,
            errorMessage: (error as Error).message
        });

        if (metricsCollector) {
            metricsCollector.recordRequest({
                url: request.url,
                statusCode: 0,
                responseTime,
                timestamp: new Date().toISOString(),
                success: false,
                error: (error as Error).message
            });
        }

        events.onPage?.(request.url);
    };
}
