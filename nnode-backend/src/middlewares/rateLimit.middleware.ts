import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const rateLimitMiddleware = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for authenticated workers
    const workerKey = req.headers['x-worker-key'];
    return workerKey === env.WORKER_API_KEY;
  },
});
