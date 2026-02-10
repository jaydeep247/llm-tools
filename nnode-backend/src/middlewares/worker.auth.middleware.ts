import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { ResponseUtil } from '../utils/response';

/**
 * Middleware to authenticate workers via API Key
 * Workers are system agents that execute jobs
 */
export const workerAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const workerKey = req.headers['x-worker-key'];
  const validWorkerKey = env.WORKER_API_KEY;

  if (!workerKey || workerKey !== validWorkerKey) {
    ResponseUtil.error(res, 'Unauthorized: Invalid Worker Key', undefined, 401);
    return;
  }

  next();
};
