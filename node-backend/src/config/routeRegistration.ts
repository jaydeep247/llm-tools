/**
 * Route Registration
 * Registers all application routes in the correct order
 */

import express from 'express';
import { monitoringRoutes } from '../routes/module_D/index.js';
import { auditsRoutes, linksRoutes, linkScoreRoutes, auditRoutes, crawlerRoutes, auditActionsRoutes, crawlRoutes, auditCheckerRoutes, serpRoutes, pageContentRoutes } from '../routes/module_A/index.js';
import { seoRoutes } from '../routes/module_B/index.js';
import { aeoRoutes } from '../routes/module_C/index.js';
import { sentimentRoutes } from '../routes/module_E/index.js';
import { schedulerRoutes } from '../routes/module_D/index.js';
import { answerCompletenessRoutes } from '../routes/module_C/answerCompleteness.routes.js';import sseRoutes from '../routes/sse.routes.js';
import authRoutes from '../routes/auth.routes.js';

/**
 * Register all application routes
 */
export function registerRoutes(app: express.Application): void {
    // Module D: Monitoring & Health
    app.use('/api', monitoringRoutes);

    // Module A: Crawling, Link Analysis, Performance Audits
    app.use('/api', auditsRoutes);
    app.use(linksRoutes);
    app.use(linkScoreRoutes);
    app.use('/api', auditActionsRoutes);
    app.use('/api', crawlerRoutes);
    app.use('/api', crawlRoutes);
    app.use(auditCheckerRoutes);
    app.use('/api', serpRoutes);
    app.use('/api', pageContentRoutes);

    // Module B: SEO & Structured Data
    app.use('/api', seoRoutes);

    // Module C: AI Intelligence
    app.use('/api/aeo', aeoRoutes);

    // Answer Completeness Analysis
    app.use('/api/answer-completeness', answerCompletenessRoutes);

    // Module E: Sentiment Tracking (New)
    app.use('/api/aeo', sentimentRoutes);

    // Module D: Scheduling
    app.use('/api', schedulerRoutes);

    // SSE (Server-Sent Events)
    app.use(sseRoutes);

    // Auth routes
    app.use('/api/auth', authRoutes);
}
