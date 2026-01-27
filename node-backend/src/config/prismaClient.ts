import * as dotenv from 'dotenv';
dotenv.config();

// Import PrismaClient from @prisma/client package (Prisma 7)
// This is the standard way to import Prisma Client in Prisma 7
import { PrismaClient, Prisma } from '@prisma/client';

// Build DATABASE_URL from individual env vars if not provided
const databaseUrl = process.env.DATABASE_URL || 
  `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'contentlytics'}`;

// Create Prisma Client singleton
class PrismaClientSingleton {
  private static instance: PrismaClient;

  public static getInstance(): PrismaClient {
    if (!PrismaClientSingleton.instance) {
      // Set DATABASE_URL environment variable if not already set
      if (!process.env.DATABASE_URL) {
        process.env.DATABASE_URL = databaseUrl;
      }
      // Prisma 6: Standard connection via DATABASE_URL
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
