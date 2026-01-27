import * as dotenv from 'dotenv';
dotenv.config();

// Central Prisma Client configuration for the Node backend.
// All database access in the app should go through this module.
import { PrismaClient, Prisma } from '@prisma/client';

// Prisma must use DATABASE_URL from the environment only.
// Fail fast if it is missing so configuration issues are obvious.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required for Prisma');
}

// Create a process-wide Prisma Client singleton
class PrismaClientSingleton {
  private static instance: PrismaClient;

  public static getInstance(): PrismaClient {
    if (!PrismaClientSingleton.instance) {
      PrismaClientSingleton.instance = new PrismaClient();
    }
    return PrismaClientSingleton.instance;
  }

  public static async disconnect(): Promise<void> {
    if (PrismaClientSingleton.instance) {
      await PrismaClientSingleton.instance.$disconnect();
    }
  }
}

// Export singleton instance
export const prisma = PrismaClientSingleton.getInstance();
export const getPrisma = () => PrismaClientSingleton.getInstance();
export const disconnectPrisma = () => PrismaClientSingleton.disconnect();

// Re-export Prisma namespace for type usage throughout the application
// Prisma.sql, Prisma.empty, Prisma.raw, etc.
export { Prisma };
