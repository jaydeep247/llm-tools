import { MongoClient, Db } from 'mongodb';
import { env } from './env';
import { logger } from '../shared/logger/logger';

let client: MongoClient | null = null;
let db: Db | null = null;
let indexesEnsured: Promise<void> | null = null;

const ensureMongoIndexes = async (database: Db): Promise<void> => {
  if (!indexesEnsured) {
    indexesEnsured = Promise.all([
      database.collection('sessions').createIndex({ projectId: 1, createdAt: -1 }),
      database.collection('sessions').createIndex({ projectId: 1, status: 1, createdAt: -1 }),
      database.collection('jobs').createIndex({ sessionId: 1, createdAt: -1 }),
      database.collection('projects').createIndex({ userId: 1, status: 1, createdAt: -1 }),
      database.collection('pages').createIndex({ jobId: 1, createdAt: 1 }),
      database.collection('links').createIndex({ jobId: 1, createdAt: 1 }),
      database.collection('fields').createIndex({ jobId: 1, createdAt: 1 }),
      database.collection('sitemaps').createIndex({ jobId: 1, createdAt: 1 }),
      database.collection('module_c').createIndex({ jobId: 1, timestamp: -1 }),
      database.collection('performance_audits').createIndex({ jobId: 1, device: 1, runAt: -1 }),
      database.collection('module_f').createIndex({ sessionId: 1, updatedAt: -1 }),
    ])
      .then(() => {
        logger.info('MongoDB indexes verified');
      })
      .catch((error) => {
        indexesEnsured = null;
        throw error;
      });
  }

  await indexesEnsured;
};

export const connectToMongo = async (): Promise<Db> => {
  if (db) return db;

  try {
    client = new MongoClient(env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: env.MONGO_MAX_POOL_SIZE,
      minPoolSize: env.MONGO_MIN_POOL_SIZE,
      maxIdleTimeMS: env.MONGO_MAX_IDLE_TIME_MS,
      waitQueueTimeoutMS: env.MONGO_WAIT_QUEUE_TIMEOUT_MS,
    });
    await client.connect();

    db = client.db(env.MONGO_DB_NAME);
    await ensureMongoIndexes(db);
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
    indexesEnsured = null;
    logger.info('🔌 MongoDB connection closed');
  }
};
