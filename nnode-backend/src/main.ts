import { createApp } from './app';
import { env } from './config/env';
import { connectToMongo } from './config/mongo';
import { logger } from './shared/logger/logger';

const startServer = async () => {
  try {
    await connectToMongo();

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running on port ${env.PORT}`);
      logger.info(`📝 Environment: ${env.NODE_ENV}`);
      logger.info(`🔗 API: http://localhost:${env.PORT}${env.API_PREFIX}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error: any) {
    logger.error(`Failed to start server: ${error?.message || String(error)}`);
    process.exit(1);
  }
};

startServer();
