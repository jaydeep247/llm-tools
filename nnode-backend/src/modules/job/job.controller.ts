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

      const key = `job:${id}`;
      const runtime = await this.redis.hgetall(key);

      return ResponseUtil.success(res, 'Job runtime status retrieved', {
        job,
        runtime: Object.keys(runtime).length > 0 ? runtime : null,
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
