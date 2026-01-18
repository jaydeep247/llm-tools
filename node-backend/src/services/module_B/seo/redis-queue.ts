import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

type SeoEligibility = {
  httpsOnly: boolean;
  sameOriginOnly: boolean;
  contentTypeAllow: string[];
  minWordCount: number;
  maxWordCount: number;
};

type SeoJob = {
  url: string;
  sessionId: number; // REQUIRED - no more optional
  priority?: number;
  contentType?: string;
  wordCount?: number;
  addedAt: string;
};

type QueueStats = {
  totalQueued: number;
  queuedUrls: string[];
  processing: number;
  failed: number;
};

const CONFIG_PATH = path.resolve(process.cwd(), 'config', 'redis.json');
const SEO_CONFIG_PATH = path.resolve(process.cwd(), 'config', 'seo.json');

let redis: Redis | null = null;
let allowlistContentTypes: Set<string> = new Set(['text/html']);
let httpsOnly = true;
let sameOriginOnly = true;
let minWordCount = 100;
let maxWordCount = 10000;

function loadRedisConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    // Override config with environment variables if present
    if (process.env.REDIS_HOST) config.host = process.env.REDIS_HOST;
    if (process.env.REDIS_PORT) config.port = parseInt(process.env.REDIS_PORT, 10);
    if (process.env.REDIS_PASSWORD) config.password = process.env.REDIS_PASSWORD;
    return config;
  } catch (error) {
    console.warn('Redis config not found, using defaults from environment or hardcoded values');
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || null,
      db: 0,
      keyPrefix: 'seo:',
      queues: {
        seo: 'queue',
        'seo-priority': 'priority-queue',
        'seo-processing': 'processing',
        'seo-failed': 'failed'
      }
    };
  }
}

function loadSeoConfig(): SeoEligibility {
  try {
    const cfg = JSON.parse(fs.readFileSync(SEO_CONFIG_PATH, 'utf-8'));
    httpsOnly = Boolean(cfg?.urlEligibility?.httpsOnly ?? true);
    sameOriginOnly = Boolean(cfg?.urlEligibility?.sameOriginOnly ?? true);
    minWordCount = Number(cfg?.urlEligibility?.minWordCount ?? 100);
    maxWordCount = Number(cfg?.urlEligibility?.maxWordCount ?? 10000);
    const arr: string[] = Array.isArray(cfg?.urlEligibility?.contentTypeAllow) ? cfg.urlEligibility.contentTypeAllow : ['text/html'];
    allowlistContentTypes = new Set(arr.map((s) => String(s).toLowerCase()));
  } catch {
    httpsOnly = true;
    sameOriginOnly = true;
    minWordCount = 100;
    maxWordCount = 10000;
    allowlistContentTypes = new Set(['text/html']);
  }
  return { httpsOnly, sameOriginOnly, contentTypeAllow: Array.from(allowlistContentTypes), minWordCount, maxWordCount };
}

async function getRedis(): Promise<Redis> {
  if (!redis) {
    const config = loadRedisConfig();
    redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      lazyConnect: config.lazyConnect !== false,
      keyPrefix: config.keyPrefix || 'seo:'
    });

    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redis.on('connect', () => {
      console.log('Redis connected successfully');
    });
  }
  return redis;
}

// Initialize the queue with startUrl and sessionId for session isolation
// Note: This function is kept for backward compatibility but no longer caches sessionId globally
// All functions now require explicit sessionId parameter for proper session isolation
export async function initSeoEnqueue(startUrl: string, sessionId: number): Promise<void> {
  try {
    loadSeoConfig();
    await getRedis();
    console.log(`[redis-queue] Initialized for sessionId: ${sessionId}`);
  } catch (error) {
    console.error('[redis-queue] Initialization failed:', error);
    throw error;
  }
}

// Check if URL is eligible for SEO job based on criteria
// Now requires explicit host and sessionId for proper session isolation
export function isUrlEligible(url: string, host: string, contentType?: string, wordCount?: number): boolean {
  const u = new URL(url);
  if (httpsOnly && u.protocol !== 'https:') return false;
  if (sameOriginOnly && u.hostname !== host) return false;
  
  const ct = (contentType || '').toLowerCase();
  if (ct) {
    const base = ct.split(';')[0].trim();
    if (!allowlistContentTypes.has(base)) return false;
  }
  
  // Check word count eligibility
  if (wordCount !== undefined) {
    if (wordCount < minWordCount || wordCount > maxWordCount) return false;
  }
  
  return true;
}

// Enqueue a URL for SEO processing with session isolation
// IMPORTANT: Each crawl session has its own isolated queue to prevent stale data
// URLs are always re-extracted fresh for each new crawl session
// REQUIRES: sessionId and host for proper session isolation (no global state)
export async function maybeEnqueueSeo(url: string, sessionId: number, host: string, contentType?: string, wordCount?: number): Promise<boolean> {
  try {
    if (!isUrlEligible(url, host, contentType, wordCount)) return false;

    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Session-specific queue keys to prevent data leakage between concurrent crawls
    const sessionQueueKey = `${config.queues.seo}:${sessionId}:priority`;
    const sessionQueueSet = `${config.queues.seo}:${sessionId}:set`;
    const sessionProcessingSet = `${config.queues['seo-processing']}:${sessionId}:set`;
    
    // Check if URL is already queued or processing IN THIS SESSION ONLY
    const isQueued = await redisClient.sismember(sessionQueueSet, url);
    const isProcessing = await redisClient.sismember(sessionProcessingSet, url);
    
    if (isQueued || isProcessing) return false;
    
    // Create job object with required sessionId
    const job: SeoJob = {
      url,
      sessionId: sessionId,
      contentType,
      wordCount,
      addedAt: new Date().toISOString()
    };
    
    // Add to priority queue (lower number = higher priority)
    const priority = wordCount ? Math.max(1, Math.min(10, Math.floor(wordCount / 1000))) : 5;
    
    await redisClient.zadd(sessionQueueKey, priority, JSON.stringify(job));
    await redisClient.sadd(sessionQueueSet, url);
    
    return true;
  } catch (error) {
    console.error('[redis-queue] Enqueue failed:', error);
    return false;
  }
}

// Dequeue a job from Redis with optional session filtering
export async function dequeueSeo(sessionId?: number): Promise<SeoJob | null> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // If sessionId provided, dequeue from session-specific queue; otherwise use global (for backward compat)
    const queueKey = sessionId ? `${config.queues.seo}:${sessionId}:priority` : config.queues['seo-priority'];
    
    // Get highest priority job (lowest score) - compatible with Redis 3.0
    const result = await redisClient.zrange(queueKey, 0, 0, 'WITHSCORES');
    if (!result || result.length === 0) return null;
    
    const job: SeoJob = JSON.parse(result[0]);
    
    // Validate job has sessionId (required for proper queue management)
    if (!job.sessionId) {
      console.warn('[redis-queue] Job missing sessionId, removing stale job:', job.url);
      // Remove stale job from queue to prevent infinite loop
      await redisClient.zrem(queueKey, result[0]);
      // Retry with next job instead of returning null
      return dequeueSeo(sessionId);
    }
    
    // Remove from priority queue
    await redisClient.zrem(queueKey, result[0]);
    
    // Move to processing set (session-specific)
    const sessionProcessingSet = `${config.queues['seo-processing']}:${job.sessionId}:set`;
    const sessionQueueSet = `${config.queues.seo}:${job.sessionId}:set`;
    
    await redisClient.sadd(sessionProcessingSet, job.url);
    await redisClient.srem(sessionQueueSet, job.url);
    
    return job;
  } catch (error) {
    console.error('[redis-queue] Dequeue failed:', error);
    return null;
  }
}

// Mark job as complete and move from processing queue
export async function markJobComplete(url: string, success: boolean, sessionId?: number): Promise<void> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Use session-specific processing queue if sessionId provided
    const processingSet = sessionId 
      ? `${config.queues['seo-processing']}:${sessionId}:set`
      : `${config.queues['seo-processing']}:set`;
    
    // Remove from processing
    await redisClient.srem(processingSet, url);
    
    if (!success) {
      // Move to failed queue (session-specific)
      const failedSet = sessionId
        ? `${config.queues['seo-failed']}:${sessionId}:set`
        : `${config.queues['seo-failed']}:set`;
      await redisClient.sadd(failedSet, url);
      await redisClient.expire(failedSet, config.ttl?.failed || 86400);
    }
  } catch (error) {
    console.error('[redis-queue] Mark complete failed:', error);
  }
}

// Get current queue statistics with optional session filtering
export async function getQueueStats(sessionId?: number): Promise<QueueStats> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Use session-specific queues if sessionId provided
    const queueKey = sessionId ? `${config.queues.seo}:${sessionId}:priority` : config.queues['seo-priority'];
    const processingSet = sessionId ? `${config.queues['seo-processing']}:${sessionId}:set` : `${config.queues['seo-processing']}:set`;
    const failedSet = sessionId ? `${config.queues['seo-failed']}:${sessionId}:set` : `${config.queues['seo-failed']}:set`;
    
    const [totalQueued, processing, failed] = await Promise.all([
      redisClient.zcard(queueKey),
      redisClient.scard(processingSet),
      redisClient.scard(failedSet)
    ]);
    
    // Get sample of queued URLs - compatible with Redis 3.0
    const queuedJobs = await redisClient.zrange(queueKey, 0, 9);
    const queuedUrls = queuedJobs.map(jobStr => {
      try {
        const job: SeoJob = JSON.parse(jobStr);
        return job.url;
      } catch {
        return '';
      }
    }).filter(url => url !== '');
    
    return {
      totalQueued,
      queuedUrls,
      processing,
      failed
    };
  } catch (error) {
    console.error('[redis-queue] Get stats failed:', error);
    return {
      totalQueued: 0,
      queuedUrls: [],
      processing: 0,
      failed: 0
    };
  }
}

// Clear queues for a specific session or all global queues
export async function clearQueue(sessionId?: number): Promise<void> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    if (sessionId) {
      // Clear session-specific queues
      await Promise.all([
        redisClient.del(`${config.queues.seo}:${sessionId}:priority`),
        redisClient.del(`${config.queues.seo}:${sessionId}:set`),
        redisClient.del(`${config.queues['seo-processing']}:${sessionId}:set`),
        redisClient.del(`${config.queues['seo-failed']}:${sessionId}:set`)
      ]);
      console.log(`[redis-queue] Queue cleared successfully for session ${sessionId}`);
    } else {
      // Clear global queues (backward compatibility)
      await Promise.all([
        redisClient.del(config.queues['seo-priority']),
        redisClient.del(`${config.queues.seo}:set`),
        redisClient.del(`${config.queues['seo-processing']}:set`),
        redisClient.del(`${config.queues['seo-failed']}:set`)
      ]);
      console.log('[redis-queue] Global queue cleared successfully');
    }
  } catch (error) {
    console.error('[redis-queue] Clear queue failed:', error);
    throw error;
  }
}

// Add URL to queue (legacy function - now requires explicit sessionId for proper isolation)
export async function addUrlToQueue(url: string, sessionId: number, priority = 5): Promise<boolean> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    const queueKey = `${config.queues.seo}:${sessionId}:priority`;
    const queueSet = `${config.queues.seo}:${sessionId}:set`;
    
    // Check if already queued
    const isQueued = await redisClient.sismember(queueSet, url);
    if (isQueued) return false;
    
    const job: SeoJob = {
      url,
      sessionId: sessionId,
      addedAt: new Date().toISOString()
    };
    
    await redisClient.zadd(queueKey, priority, JSON.stringify(job));
    await redisClient.sadd(queueSet, url);
    
    return true;
  } catch (error) {
    console.error('[redis-queue] Add URL failed:', error);
    return false;
  }
}

// Get list of failed jobs
export async function getFailedJobs(sessionId?: number): Promise<string[]> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    const failedSet = sessionId
      ? `${config.queues['seo-failed']}:${sessionId}:set`
      : `${config.queues['seo-failed']}:set`;
    
    return await redisClient.smembers(failedSet);
  } catch (error) {
    console.error('[redis-queue] Get failed jobs failed:', error);
    return [];
  }
}

// Retry a failed job by moving it back to queue
export async function retryFailedJob(url: string, sessionId?: number): Promise<boolean> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    const failedSet = sessionId
      ? `${config.queues['seo-failed']}:${sessionId}:set`
      : `${config.queues['seo-failed']}:set`;
    
    // Remove from failed
    await redisClient.srem(failedSet, url);
    
    // Add back to queue
    // Note: sessionId is required for proper session isolation
    if (!sessionId) {
      console.error('[redis-queue] Retry failed job requires sessionId');
      return false;
    }
    
    const job: SeoJob = {
      url,
      sessionId: sessionId,
      addedAt: new Date().toISOString()
    };
    
    const queueKey = sessionId ? `${config.queues.seo}:${sessionId}:priority` : config.queues['seo-priority'];
    const queueSet = sessionId ? `${config.queues.seo}:${sessionId}:set` : `${config.queues.seo}:set`;
    
    await redisClient.zadd(queueKey, 1, JSON.stringify(job)); // High priority for retry
    await redisClient.sadd(queueSet, url);
    
    return true;
  } catch (error) {
    console.error('[redis-queue] Retry failed job failed:', error);
    return false;
  }
}

// Close Redis connection
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
