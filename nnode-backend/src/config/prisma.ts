import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/logger/logger';

// Singleton Prisma Client
class PrismaService {
  private static instance: PrismaClient;

  private constructor() {}

  public static getInstance(): PrismaClient {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaClient({
        log: [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'stdout' },
          { level: 'warn', emit: 'stdout' },
        ],
      });

// Log queries in development
      /*
      if (process.env.NODE_ENV === 'development') {
        PrismaService.instance.$on('query' as never, (e: any) => {
          logger.debug(`Query: ${e.query}`);
          logger.debug(`Duration: ${e.duration}ms`);
        });
      }
      */

      // Handle graceful shutdown
      process.on('beforeExit', async () => {
        await PrismaService.instance.$disconnect();
        logger.info('Prisma client disconnected');
      });
    }

    return PrismaService.instance;
  }

  public static async connect(): Promise<void> {
    try {
      await PrismaService.getInstance().$connect();
      logger.info('✅ Database connected successfully');
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      process.exit(1);
    }
  }

  public static async disconnect(): Promise<void> {
    await PrismaService.getInstance().$disconnect();
    logger.info('Database disconnected');
  }
}

export const prisma = PrismaService.getInstance();
export const connectDatabase = PrismaService.connect;
export const disconnectDatabase = PrismaService.disconnect;
