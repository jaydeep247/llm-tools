import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../shared/logger/logger';

let client: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (client) return client;

  client = new Redis(env.REDIS_URL);

  client.on('error', (error: any) => {
    logger.error(`Redis error: ${error?.message || String(error)}`);
  });

  client.on('connect', () => {
    logger.info('✅ Connected to Redis');
  });

  return client;
};
