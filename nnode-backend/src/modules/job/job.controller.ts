import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { JobService } from './job.service';
import { LiveJobService } from '../../services/live-job.service';
import { ResponseUtil } from '../../utils/response';
import { createJobSchema } from './job.validator';
import { sessionIdSchema } from '../session/session.validator';
import { logger } from '../../shared/logger/logger';
import { getRedisClient } from '../../config/redis';
import { connectToMongo } from '../../config/mongo';
import { fetchPsi, DeviceStrategy } from './psiClient';

export class JobController {
  private jobService: JobService;
  private redis = getRedisClient();

  constructor() {
    this.jobService = new JobService();
  }

  getJobSnapshot = async (req: Request, res: Response): Promise<Response> => {
    try {
        const { id } = sessionIdSchema.parse({ id: req.params.id });
        const snapshot = await LiveJobService.getSnapshot(id);
        
        return ResponseUtil.success(res, 'Job snapshot retrieved', snapshot);
    } catch (error: any) {
        logger.error(`Error getting job snapshot: ${error.message}`);
        return ResponseUtil.serverError(res, 'Failed to retrieve job snapshot');
    }
  }

  createJob = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.sessionId });
      const data = createJobSchema.parse(req.body);

      const job = await this.jobService.createJob(userId, id, data);
      return ResponseUtil.created(res, 'Job created and enqueued successfully', job);
    } catch (error: any) {
      if (error instanceof ZodError || error.name === 'ZodError') {
        logger.warn(`Validation failed creating job: ${error.message}`);
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }

      logger.error(`Error creating job: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to create job');
    }
  };

  generateSchemaForJob = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const schemaType = (req.body && typeof req.body.schemaType === 'string') ? req.body.schemaType : undefined;

      const job = await this.jobService.startSchemaGeneration(userId, id, schemaType);

      return ResponseUtil.success(res, 'Schema generation job enqueued successfully', job);
    } catch (error: any) {
      logger.error(`Error starting schema generation: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to start schema generation');
    }
  };

  startContentMetricsForJob = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const { sourceJobId } = req.body || {};

      const job = await this.jobService.startContentMetrics(userId, id, sourceJobId);

      return ResponseUtil.success(res, 'Content metrics job enqueued successfully', job);
    } catch (error: any) {
      logger.error(`Error starting content metrics analysis: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to start content metrics analysis');
    }
  };

  getJobSchema = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const collection = db.collection('schemas');
      const docs = await collection
        .find({ jobId: id })
        .sort({ createdAt: 1 })
        .toArray();

      const latest = docs.length > 0 ? docs[docs.length - 1] : null;

      return ResponseUtil.success(res, 'Job schema retrieved successfully', latest);
    } catch (error: any) {
      logger.error(`Error getting job schema: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job schema');
    }
  };

  getJobContentMetrics = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const collection = db.collection('content_metrics');
      const docs = await collection
        .find({ jobId: id })
        .sort({ createdAt: 1 })
        .toArray();

      const latest = docs.length > 0 ? docs[docs.length - 1] : null;

      return ResponseUtil.success(res, 'Job content metrics retrieved successfully', latest);
    } catch (error: any) {
      logger.error(`Error getting job content metrics: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job content metrics');
    }
  };

  getJobRedirectAudit = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const job = await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const collection = db.collection('fields');
      const docs = await collection
        .find({ jobId: id })
        .sort({ createdAt: 1 })
        .toArray();

      const results: any[] = [];

      for (const doc of docs) {
        const url = (doc as any).url || (doc as any).pageUrl || '';
        const fields = (doc as any).fields || {};
        const redirectData = fields.Redirects_audit || fields.redirects_audit;

        if (!url || !redirectData) {
          continue;
        }

        const redirectChainRaw = redirectData.redirectChain || redirectData.redirect_chain || [];
        const redirectChain = (redirectChainRaw || []).map((hop: any) => ({
          url: hop.url || '',
          statusCode: hop.statusCode ?? hop.status_code ?? 0,
          redirectType: (hop.redirectType ?? hop.redirect_type ?? null) as
            | '301'
            | '302'
            | '307'
            | '308'
            | null,
          redirectUrl: hop.redirectUrl ?? hop.redirect_url ?? null,
          headers: hop.headers || {},
        }));

        const finalStatusCode =
          redirectData.finalStatusCode ??
          redirectData.final_status_code ??
          (redirectData.finalUrlStatusCode ?? 0);

        const result = {
          originalUrl: redirectData.originalUrl || url,
          finalUrl: redirectData.finalUrl || url,
          finalStatusCode,
          has301Redirect: !!redirectData.has301Redirect,
          has302Redirect: !!redirectData.has302Redirect,
          has307Redirect: !!redirectData.has307Redirect,
          redirectChain,
          chainLength:
            redirectData.chainLength ??
            redirectData.chain_length ??
            Math.max(redirectChain.length - 1, 0),
          hasRedirectChain: !!redirectData.hasRedirectChain,
          hasRedirectLoop: !!redirectData.hasRedirectLoop,
          loopDetectedAt: redirectData.loopDetectedAt,
          finalUrlStatus:
            redirectData.finalUrlStatus ||
            redirectData.final_url_status ||
            (finalStatusCode >= 400 ? 'broken' : 'ok'),
          finalUrlStatusCode:
            redirectData.finalUrlStatusCode ??
            redirectData.final_url_status_code ??
            finalStatusCode,
          isBrokenRedirect:
            redirectData.isBrokenRedirect ?? (finalStatusCode >= 400 ? true : false),
          brokenReason: redirectData.brokenReason,
          canonicalUrl: redirectData.canonicalUrl,
          canonicalAlignment:
            redirectData.canonicalAlignment ||
            redirectData.canonical_alignment ||
            'not_found',
          canonicalMismatchReason: redirectData.canonicalMismatchReason,
          overallStatus: redirectData.overallStatus || redirectData.status || 'ok',
          issues: Array.isArray(redirectData.issues) ? redirectData.issues : [],
        };

        results.push(result);
      }

      const summary = {
        totalChecked: results.length,
        total301Redirects: results.filter((r: any) => r.has301Redirect).length,
        total302Redirects: results.filter((r: any) => r.has302Redirect).length,
        total307Redirects: results.filter((r: any) => r.has307Redirect).length,
        totalRedirectChains: results.filter((r: any) => r.hasRedirectChain).length,
        totalRedirectLoops: results.filter((r: any) => r.hasRedirectLoop).length,
        totalBrokenRedirects: results.filter((r: any) => r.isBrokenRedirect).length,
        totalCanonicalMismatches: results.filter(
          (r: any) => r.canonicalAlignment === 'mismatch',
        ).length,
        totalOk: results.filter((r: any) => r.overallStatus === 'ok').length,
        totalWarnings: results.filter((r: any) => r.overallStatus === 'warning').length,
        totalErrors: results.filter((r: any) => r.overallStatus === 'error').length,
      };

      const payload = {
        sessionId: job.sessionId,
        summary,
        results,
      };

      return ResponseUtil.success(
        res,
        'Job redirect audit results retrieved successfully',
        payload,
      );
    } catch (error: any) {
      logger.error(`Error getting job redirect audit results: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(
        res,
        'Failed to retrieve job redirect audit results',
      );
    }
  };

  getSessionJobs = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.sessionId });

      const jobs = await this.jobService.getJobsForSession(userId, id);
      return ResponseUtil.success(res, 'Jobs retrieved successfully', jobs);
    } catch (error: any) {
      logger.error(`Error getting jobs: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve jobs');
    }
  };

  getJobById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });

      const job = await this.jobService.getJobById(userId, id);
      return ResponseUtil.success(res, 'Job retrieved successfully', job);
    } catch (error: any) {
      logger.error(`Error getting job: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job');
    }
  };

  getJobRuntimeStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const job = await this.jobService.getJobById(userId, id);

      // Get real-time status from Redis
      const statusKey = `job:${id}:status`;
      const redisStatus = await this.redis.get(statusKey);

      // If Redis has a more recent status (e.g. completed), overlay it
      if (redisStatus && redisStatus !== job.status) {
          (job as any).status = redisStatus;
      }

      return ResponseUtil.success(res, 'Job runtime status retrieved', {
        job,
        runtime: redisStatus ? { status: redisStatus } : null,
      });
    } catch (error: any) {
      logger.error(`Error getting job runtime status: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job runtime status');
    }
  };

  getJobPages = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      await this.jobService.getJobById(userId, id);

      const page = req.query.page ? parseInt(String(req.query.page), 10) || 1 : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) || 100 : 100;

      const db = await connectToMongo();
      const collection = db.collection('pages');
      const filter = { jobId: id };
      const total = await collection.countDocuments(filter);
      const skip = (page - 1) * limit;
      const data = await collection
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      return ResponseUtil.success(res, 'Job pages retrieved successfully', {
        data,
        pagination: { page, limit, total },
      });
    } catch (error: any) {
      logger.error(`Error getting job pages: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job pages');
    }
  };

  getJobLinks = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      await this.jobService.getJobById(userId, id);

      const page = req.query.page ? parseInt(String(req.query.page), 10) || 1 : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) || 100 : 100;

      const db = await connectToMongo();
      const collection = db.collection('links');
      const filter = { jobId: id };
      const total = await collection.countDocuments(filter);
      const skip = (page - 1) * limit;
      const data = await collection
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      return ResponseUtil.success(res, 'Job links retrieved successfully', {
        data,
        pagination: { page, limit, total },
      });
    } catch (error: any) {
      logger.error(`Error getting job links: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job links');
    }
  };

  getJobSitemaps = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const collection = db.collection('sitemaps');
      const data = await collection
        .find({ jobId: id })
        .sort({ createdAt: 1 })
        .toArray();

      return ResponseUtil.success(res, 'Job sitemaps retrieved successfully', { data });
    } catch (error: any) {
      logger.error(`Error getting job sitemaps: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job sitemaps');
    }
  };

  getJobFields = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const collection = db.collection('fields');
      const data = await collection
        .find({ jobId: id })
        .sort({ createdAt: 1 })
        .toArray();

      return ResponseUtil.success(res, 'Job fields retrieved successfully', { data });
    } catch (error: any) {
      logger.error(`Error getting job fields: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job fields');
    }
  };

  getJobRecommendations = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const docs = await db
        .collection('fields')
        .find({ jobId: id }, { projection: { url: 1, recommendations: 1, createdAt: 1 } })
        .sort({ createdAt: 1 })
        .toArray();

      // The fields collection document is FLAT (pipeline does **fields_data).
      // recommendations lives at doc.recommendations, NOT doc.fields.recommendations.
      const pages = docs.map((doc: any) => {
        const rec = doc?.recommendations ?? null;
        return {
          url: doc.url,
          health_score: rec?.health_score ?? null,
          summary: rec?.summary ?? null,
          recommendations: rec?.recommendations ?? [],
        };
      });

      const aggregate = {
        total_pages: pages.length,
        avg_health_score:
          pages.length > 0
            ? Math.round(
                pages.reduce((sum: number, p: any) => sum + (p.health_score ?? 100), 0) /
                  pages.length,
              )
            : 100,
        critical: pages.reduce((s: number, p: any) => s + (p.summary?.critical ?? 0), 0),
        warning: pages.reduce((s: number, p: any) => s + (p.summary?.warning ?? 0), 0),
        info: pages.reduce((s: number, p: any) => s + (p.summary?.info ?? 0), 0),
        by_category: {} as Record<string, number>,
      };

      for (const page of pages) {
        const bc = page.summary?.by_category ?? {};
        for (const [cat, count] of Object.entries(bc)) {
          aggregate.by_category[cat] = (aggregate.by_category[cat] ?? 0) + (count as number);
        }
      }

      return ResponseUtil.success(res, 'Recommendations retrieved successfully', {
        aggregate,
        pages,
      });
    } catch (error: any) {
      logger.error(`Error getting recommendations: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve recommendations');
    }
  };

  getJobAeoAnalysis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const collection = db.collection('aeo_analysis');
      const data = await collection
        .find({ jobId: id })
        .sort({ timestamp: -1 })
        .toArray();

      return ResponseUtil.success(res, 'Job AEO analysis retrieved successfully', { data });
    } catch (error: any) {
      logger.error(`Error getting job AEO analysis: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job AEO analysis');
    }
  };

  getJobSummary = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const collection = db.collection('job_summaries');
      const summary = await collection.findOne({ jobId: id });

      return ResponseUtil.success(res, 'Job summary retrieved successfully', summary);
    } catch (error: any) {
      logger.error(`Error getting job summary: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job summary');
    }
  };

  getJobSiteStructure = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const job = await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const pagesCollection = db.collection('pages');
      const pages = await pagesCollection
        .find({ jobId: id })
        .project({ url: 1, _id: 0 })
        .sort({ createdAt: 1 })
        .toArray();

      return ResponseUtil.success(res, 'Job site structure retrieved successfully', {
        jobId: id,
        sessionId: job.sessionId,
        projectId: job.projectId,
        startUrl: job.url,
        pages,
      });
    } catch (error: any) {
      logger.error(`Error getting job site structure: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job site structure');
    }
  };

  startJobPerformanceAudits = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const deviceRaw = typeof req.body?.device === 'string' ? req.body.device : 'desktop';
      const device: DeviceStrategy =
        deviceRaw === 'mobile' || deviceRaw === 'desktop' ? deviceRaw : 'desktop';

      const job = await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const pagesCollection = db.collection('pages');
      const auditsCollection = db.collection('performance_audits');

      const pages = await pagesCollection
        .find({ jobId: id })
        .project({ url: 1 })
        .toArray();

      const urls = pages
        .map((p: any) => (p && typeof p.url === 'string' ? p.url : ''))
        .filter((u: string) => !!u);

      if (urls.length === 0) {
        return ResponseUtil.success(res, 'No pages found for this job to audit', {
          jobId: id,
          device,
          totalPages: 0,
        });
      }

      const runAudit = async () => {
        try {
          logger.info(
            `Starting performance audits for job ${id} (device=${device}) on ${urls.length} pages`,
          );

          for (const url of urls) {
            try {
              const result = await fetchPsi(url, device, {});

              const doc = {
                jobId: id,
                sessionId: job.sessionId,
                projectId: job.projectId,
                url: result.url,
                device: result.device,
                runAt: result.runAt,
                LCP_ms: result.lab?.LCP_ms ?? result.field?.LCP_ms,
                TBT_ms: result.lab?.TBT_ms,
                CLS: result.lab?.CLS ?? result.field?.CLS,
                FCP_ms: result.lab?.FCP_ms,
                TTFB_ms: result.lab?.TTFB_ms,
                performanceScore: result.lab?.performanceScore,
                psiReportUrl: result.psiReportUrl,
                createdAt: new Date(),
              };

              await auditsCollection.updateOne(
                { jobId: id, url: doc.url, device: doc.device },
                { $set: doc },
                { upsert: true },
              );
            } catch (err: any) {
              logger.warn(
                `Failed performance audit for url=${url} job=${id}: ${err?.message || err}`,
              );
            }
          }

          logger.info(`Performance audits completed for job ${id}`);
        } catch (err: any) {
          logger.error(
            `Error during performance audits for job ${id}: ${err?.message || err}`,
          );
        }
      };

      void runAudit();

      return ResponseUtil.success(res, 'Performance audits started', {
        jobId: id,
        device,
        totalPages: urls.length,
      });
    } catch (error: any) {
      logger.error(`Error starting performance audits: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to start performance audits');
    }
  };

  getJobPerformanceAudits = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const deviceRaw = req.query.device ? String(req.query.device) : 'all';
      const deviceFilter: DeviceStrategy | 'all' =
        deviceRaw === 'mobile' || deviceRaw === 'desktop' ? (deviceRaw as DeviceStrategy) : 'all';

      await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const collection = db.collection('performance_audits');

      const filter: any = { jobId: id };
      if (deviceFilter !== 'all') {
        filter.device = deviceFilter;
      }

      const docs = await collection.find(filter).sort({ runAt: -1 }).toArray();

      const items = docs.map((doc: any) => ({
        id: String(doc._id),
        url: doc.url,
        device: doc.device as DeviceStrategy,
        runAt: doc.runAt || doc.createdAt || new Date().toISOString(),
        LCP_ms: doc.LCP_ms,
        TBT_ms: doc.TBT_ms,
        CLS: doc.CLS,
        FCP_ms: doc.FCP_ms,
        TTFB_ms: doc.TTFB_ms,
        performanceScore: doc.performanceScore,
        psiReportUrl: doc.psiReportUrl,
      }));

      return ResponseUtil.success(
        res,
        'Job performance audits retrieved successfully',
        { items },
      );
    } catch (error: any) {
      logger.error(`Error getting job performance audits: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job performance audits');
    }
  };

  /**
   * Cancel a running job (called when user closes browser)
   */
  cancelJob = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const reason = req.body?.reason as string | undefined;

      const job = await this.jobService.cancelJob(userId, id, reason);
      return ResponseUtil.success(res, 'Job cancelled successfully', job);
    } catch (error: any) {
      logger.error(`Error cancelling job: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.message.includes('Cannot cancel')) {
        return ResponseUtil.error(res, error.message, undefined, 400);
      }
      return ResponseUtil.serverError(res, 'Failed to cancel job');
    }
  };

  /**
   * Retry a failed job
   */
  retryJob = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });

      const job = await this.jobService.retryJob(userId, id);
      return ResponseUtil.success(res, 'Job retry started successfully', job);
    } catch (error: any) {
      logger.error(`Error retrying job: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.message.includes('Can only retry')) {
        return ResponseUtil.error(res, error.message, undefined, 400);
      }
      return ResponseUtil.serverError(res, 'Failed to retry job');
    }
  };

  // ============ MODULE E SPECIFIC ENDPOINTS ============
  
  /**
   * Start Module E Consistency Analysis
   */
  startModuleEConsistency = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const job = await this.jobService.startModuleEConsistency(userId, id);
      return ResponseUtil.success(res, 'Module E consistency analysis job enqueued', job);
    } catch (error: any) {
      logger.error(`Error starting Module E consistency: ${error.message}`);
      if (error.message.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to start Module E consistency analysis');
    }
  };

  /**
   * Start Module E Sentiment Analysis
   */
  startModuleESentiment = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const job = await this.jobService.startModuleESentiment(userId, id);
      return ResponseUtil.success(res, 'Module E sentiment analysis job enqueued', job);
    } catch (error: any) {
      logger.error(`Error starting Module E sentiment: ${error.message}`);
      if (error.message.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to start Module E sentiment analysis');
    }
  };

  /**
   * Start Module E Competitor Analysis
   */
  startModuleECompetitors = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const job = await this.jobService.startModuleECompetitors(userId, id);
      return ResponseUtil.success(res, 'Module E competitor analysis job enqueued', job);
    } catch (error: any) {
      logger.error(`Error starting Module E competitors: ${error.message}`);
      if (error.message.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to start Module E competitor analysis');
    }
  };

  /**
   * Start Module E AI SOV Analysis
   */
  startModuleEAiSov = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const job = await this.jobService.startModuleEAiSov(userId, id);
      return ResponseUtil.success(res, 'Module E AI SOV analysis job enqueued', job);
    } catch (error: any) {
      logger.error(`Error starting Module E AI SOV: ${error.message}`);
      if (error.message.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to start Module E AI SOV analysis');
    }
  };

  /**
   * Start Module E Ranking Analysis
   */
  startModuleERanking = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const job = await this.jobService.startModuleERanking(userId, id);
      return ResponseUtil.success(res, 'Module E ranking analysis job enqueued', job);
    } catch (error: any) {
      logger.error(`Error starting Module E ranking: ${error.message}`);
      if (error.message.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to start Module E ranking analysis');
    }
  };

  /**
   * Start Module E Brand Analysis
   */
  startModuleEBrand = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const job = await this.jobService.startModuleEBrand(userId, id);
      return ResponseUtil.success(res, 'Module E brand analysis job enqueued', job);
    } catch (error: any) {
      logger.error(`Error starting Module E brand: ${error.message}`);
      if (error.message.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to start Module E brand analysis');
    }
  };

  /**
   * Start Module E AI Citation Ranking Analysis
   */
  startModuleEAiCitationRanking = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      const job = await this.jobService.startModuleEAiCitationRanking(userId, id);
      return ResponseUtil.success(res, 'Module E AI citation ranking job enqueued', job);
    } catch (error: any) {
      logger.error(`Error starting Module E AI citation ranking: ${error.message}`);
      if (error.message.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to start Module E AI citation ranking');
    }
  };

  /**
   * Get Module E Analysis Results
   */
  getJobModuleEAnalysis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.id });
      await this.jobService.getJobById(userId, id);

      const db = await connectToMongo();
      const collection = db.collection('module_e');
      const data = await collection.findOne({ jobId: id });

      return ResponseUtil.success(res, 'Module E analysis retrieved successfully', data);
    } catch (error: any) {
      logger.error(`Error getting Module E analysis: ${error.message}`);
      if (error.message.includes('not found')) return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to retrieve Module E analysis');
    }
  };
}
