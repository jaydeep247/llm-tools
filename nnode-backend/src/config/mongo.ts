import { MongoClient, Db } from 'mongodb';
import { env } from './env';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

let client: MongoClient | null = null;
let db: Db | null = null;

export const connectToMongo = async (): Promise<Db> => {
  if (db) return db;

  try {
    client = new MongoClient(env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    await client.connect();

    db = client.db(env.MONGO_DB_NAME);
    logger.info('✅ Connected to MongoDB');
    return db;
  } catch (error: any) {
    logger.error(`❌ MongoDB connection error: ${error?.message || String(error)}`);
    throw error;
  }
};

export const getMongoDb = (): Db => {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectToMongo first.');
  }
  return db;
};

export const closeMongoConnection = async (): Promise<void> => {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('🔌 MongoDB connection closed');
  }
};
