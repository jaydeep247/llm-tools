import { Request, Response } from 'express';
import { JobService } from './job.service';
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

  createJob = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse({ id: req.params.sessionId });
      const data = createJobSchema.parse(req.body);

      const job = await this.jobService.createJob(userId, id, data);
      return ResponseUtil.created(res, 'Job created and enqueued successfully', job);
    } catch (error: any) {
      logger.error(`Error creating job: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to create job');
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
}
