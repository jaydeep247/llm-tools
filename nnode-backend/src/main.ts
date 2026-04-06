import { createApp } from './app';
import { env } from './config/env';
import { connectToMongo } from './config/mongo';
import { logger } from './shared/logger/logger';
import { initSocket } from './socket';
import { startJobEventsConsumer } from './consumers/job-events.consumer';
import { urlCacheRepository } from './modules/url_cache/urlCache.repository';

const startServer = async () => {
  try {
    await connectToMongo();

    // Bootstrap URL cache indexes (unique on url, TTL on expiresAt)
    await urlCacheRepository.ensureIndexes().catch((err: any) =>
      logger.warn(`url_cache index bootstrap warning: ${err?.message}`)
    );
    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running on port ${env.PORT}`);
      logger.info(`📝 Environment: ${env.NODE_ENV}`);
      logger.info(`🔗 API: http://localhost:${env.PORT}${env.API_PREFIX}`);
    });

    // Initialize Socket.IO
    initSocket(server);
    logger.info('✅ Socket.IO initialized');

    // Start Job Events Consumer
    startJobEventsConsumer();

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
