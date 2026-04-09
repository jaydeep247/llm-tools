import { MongoClient, Db } from 'mongodb';
import { env } from './env';
import { logger } from '../shared/logger/logger';

let client: MongoClient | null = null;
let db: Db | null = null;
let indexesEnsured: Promise<void> | null = null;

/** Seed entries for llm_source_map if the collection is empty. */
const LLM_SOURCE_MAP_SEED = [
  { source_domain: 'chatgpt.com',          display_name: 'ChatGPT',   is_active: true },
  { source_domain: 'chat.openai.com',      display_name: 'ChatGPT',   is_active: true },
  { source_domain: 'gemini.google.com',    display_name: 'Gemini',    is_active: true },
  { source_domain: 'bard.google.com',      display_name: 'Gemini',    is_active: true },
  { source_domain: 'perplexity.ai',        display_name: 'Perplexity',is_active: true },
  { source_domain: 'claude.ai',            display_name: 'Claude',    is_active: true },
  { source_domain: 'bing.com',             display_name: 'Bing AI',   is_active: true },
  { source_domain: 'copilot.microsoft.com',display_name: 'Copilot',   is_active: true },
  { source_domain: 'you.com',              display_name: 'You.com AI',is_active: true },
  { source_domain: 'phind.com',            display_name: 'Phind',     is_active: true },
  { source_domain: 'kagi.com',             display_name: 'Kagi AI',   is_active: true },
  { source_domain: 'poe.com',              display_name: 'Poe',       is_active: true },
];

const seedLLMSourceMap = async (database: Db): Promise<void> => {
  const col = database.collection('llm_source_map');
  const count = await col.countDocuments();
  if (count === 0) {
    const now = new Date();
    await col.insertMany(LLM_SOURCE_MAP_SEED.map((e) => ({ ...e, added_at: now })));
    logger.info('llm_source_map seeded with default entries');
  }
};

const ensureMongoIndexes = async (database: Db): Promise<void> => {
  if (!indexesEnsured) {
    indexesEnsured = Promise.all([
      database.collection('llm_source_map').createIndex({ source_domain: 1 }, { unique: true }),
      database.collection('users').createIndex(
        { emailNormalized: 1 },
        {
          unique: true,
          partialFilterExpression: {
            emailNormalized: { $exists: true, $type: 'string' },
          },
        }
      ),
      database.collection('users').createIndex(
        { googleId: 1 },
        {
          unique: true,
          sparse: true,
        }
      ),
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
    await seedLLMSourceMap(db);
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
