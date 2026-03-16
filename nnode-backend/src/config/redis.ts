import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../shared/logger/logger';

let client: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (client) return client;

  client = new Redis(env.REDIS_URL, {
    // Avoid long retry queues that amplify latency under transient outages.
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectTimeout: 10_000,
    commandTimeout: 5_000,
    keepAlive: 30_000,
    retryStrategy: (attempt) => {
      // Exponential backoff capped to keep reconnect storms contained.
      const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000);
      return delay;
    },
  });

  client.on('error', (error: any) => {
    logger.error(`Redis error: ${error?.message || String(error)}`);
  });

  client.on('connect', () => {
    logger.info('✅ Connected to Redis');
  });

  return client;
};
