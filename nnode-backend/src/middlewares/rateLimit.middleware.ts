import rateLimit from 'express-rate-limit';

/**
 * Auth endpoints (login/register): 10 attempts per 15-minute window.
 * Tight ceiling prevents credential-stuffing attacks.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * State-mutation endpoints (POST/PUT/DELETE): 60 per minute.
 * Covers normal usage without enabling abuse.
 * Health-check path is exempt (used by load-balancers).
 */
export const mutationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.endsWith('/health'),
});

/**
 * Read-heavy endpoints (GET): 200 per minute.
 * Allows real-time dashboards and polling without undue constraint.
 */
export const readRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
