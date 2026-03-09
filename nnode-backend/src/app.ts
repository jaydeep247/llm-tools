import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { logger } from './shared/logger/logger';
import { errorMiddleware } from './middlewares/error.middleware';
import { globalRateLimit } from './middlewares/rateLimit.middleware';
import routes from './routes';

export const createApp = (): Application => {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    })
  );

  // Global safety-net: 1 000 req/IP/15 min — Redis-backed, works across all instances.
  // Credential endpoints add a tighter per-IP layer in auth.routes.ts.
  app.use(globalRateLimit);

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // Request logging
  app.use((req, _res, next) => {
    logger.http(`${req.method} ${req.path}`);
    next();
  });

  // API routes
  app.use(env.API_PREFIX, routes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found',
    });
  });

  // Error handling middleware (must be last)
  app.use(errorMiddleware);

  return app;
};
