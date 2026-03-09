import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { logger } from './shared/logger/logger';
import { errorMiddleware } from './middlewares/error.middleware';
import { mutationRateLimit } from './middlewares/rateLimit.middleware';
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

  // Rate limiting — applies to every route; auth routes add a stricter layer in routes.ts
  app.use(mutationRateLimit);

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
