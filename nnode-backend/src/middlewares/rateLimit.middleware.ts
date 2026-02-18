import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const rateLimitMiddleware = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const workerKey = req.headers['x-worker-key'];
    if (workerKey === env.WORKER_API_KEY) {
      return true;
    }

    const path = req.path;

    // Allow crawl-related endpoints to be called in parallel without hitting the global IP rate limit
    if (
      req.method === 'POST' &&
      path.startsWith(`${env.API_PREFIX}/sessions/`) &&
      path.endsWith('/jobs')
    ) {
      return true;
    }

    return false;
  },
});
