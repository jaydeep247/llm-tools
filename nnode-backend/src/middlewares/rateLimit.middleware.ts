import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const rateLimitMiddleware = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Globally disable rate limiting for API consumers to avoid 429 errors
  skip: () => true,
});
