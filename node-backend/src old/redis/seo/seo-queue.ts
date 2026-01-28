/**
 * Redis Queue Service for SEO Processing
 * Provides distributed queue management for SEO keyword extraction
 */

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
  sessionId: number; // Required for session tracking
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
    // Always use environment variable if set (even if empty string, though that's unlikely)
    if (process.env.REDIS_PASSWORD !== undefined) {
      config.password = process.env.REDIS_PASSWORD || null;
    }
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
        seo: 'seo:queue',
        'seo-priority': 'seo:priority-queue',
        'seo-processing': 'seo:processing',
        'seo-failed': 'seo:failed'
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
    console.log(`[redis-queue] Connecting to Redis at ${config.host}:${config.port} (password: ${config.password ? '***' : 'none'})`);
    redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password || undefined, // Use undefined instead of null for ioredis
      db: config.db,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      lazyConnect: config.lazyConnect !== false,
      keyPrefix: config.keyPrefix || 'seo:',
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`[redis-queue] Retrying Redis connection (attempt ${times}) in ${delay}ms...`);
        return delay;
      }
    });

    redis.on('error', (err) => {
      console.error('[redis-queue] Redis connection error:', err.message);
    });

    redis.on('connect', () => {
      console.log('[redis-queue] Redis connected successfully');
    });

    redis.on('ready', () => {
      console.log('[redis-queue] Redis is ready to accept commands');
    });

    // Test connection immediately
    try {
      await redis.ping();
      console.log('[redis-queue] Redis ping successful');
    } catch (err) {
      console.error('[redis-queue] Redis ping failed:', (err as Error).message);
    }
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
    
    // Create job object
    const job: SeoJob = {
      url,
      sessionId: sessionId,
      contentType,
      wordCount,
      addedAt: new Date().toISOString()
    };
    
    // Add to priority queue (lower number = higher priority)
    const priority = wordCount ? Math.max(1, Math.min(10, Math.floor(wordCount / 1000))) : 5;
    
    await redisClient.zadd(config.queues['seo-priority'], priority, JSON.stringify(job));
    await redisClient.sadd(`${config.queues.seo}:set`, url);
    
    return true;
  } catch (error) {
    console.error('[redis-queue] Enqueue failed:', error);
    return false;
  }
}

export async function dequeueSeo(): Promise<SeoJob | null> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Get highest priority job (lowest score) - compatible with Redis 3.0
    const result = await redisClient.zrange(config.queues['seo-priority'], 0, 0, 'WITHSCORES');
    if (!result || result.length === 0) return null;
    
    const job: SeoJob = JSON.parse(result[0]);
    
    // Validate job has sessionId (required for proper queue management)
    if (!job.sessionId) {
      console.warn('[redis-queue] Job missing sessionId, removing stale job:', job.url);
      // Remove stale job from queue to prevent infinite loop
      await redisClient.zrem(config.queues['seo-priority'], result[0]);
      // Retry with next job instead of returning null
      return dequeueSeo();
    }
    
    // Remove from priority queue
    await redisClient.zrem(config.queues['seo-priority'], result[0]);
    
    // Move to processing set
    await redisClient.sadd(`${config.queues['seo-processing']}:set`, job.url);
    await redisClient.srem(`${config.queues.seo}:set`, job.url);
    
    // Set processing TTL
    await redisClient.expire(`${config.queues['seo-processing']}:set`, config.ttl?.processing || 300);
    
    return job;
  } catch (error) {
    console.error('[redis-queue] Dequeue failed:', error);
    return null;
  }
}

export async function markJobComplete(url: string, success: boolean): Promise<void> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Remove from processing
    await redisClient.srem(`${config.queues['seo-processing']}:set`, url);
    
    if (!success) {
      // Move to failed queue
      await redisClient.sadd(`${config.queues['seo-failed']}:set`, url);
      await redisClient.expire(`${config.queues['seo-failed']}:set`, config.ttl?.failed || 86400);
    }
  } catch (error) {
    console.error('[redis-queue] Mark complete failed:', error);
  }
}

export async function getQueueStats(): Promise<QueueStats> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    const [totalQueued, processing, failed] = await Promise.all([
      redisClient.zcard(config.queues['seo-priority']),
      redisClient.scard(`${config.queues['seo-processing']}:set`),
      redisClient.scard(`${config.queues['seo-failed']}:set`)
    ]);
    
    // Get sample of queued URLs - compatible with Redis 3.0
    const queuedJobs = await redisClient.zrange(config.queues['seo-priority'], 0, 9);
    const queuedUrls = queuedJobs.map(job => {
      try {
        return JSON.parse(job).url;
      } catch {
        return job; // fallback if parsing fails
      }
    });
    
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

export async function clearQueue(): Promise<void> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    await Promise.all([
      redisClient.del(config.queues['seo-priority']),
      redisClient.del(`${config.queues.seo}:set`),
      redisClient.del(`${config.queues['seo-processing']}:set`),
      redisClient.del(`${config.queues['seo-failed']}:set`)
    ]);
    
    console.log('[redis-queue] Queue cleared successfully');
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

export async function getFailedJobs(): Promise<string[]> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    return await redisClient.smembers(`${config.queues['seo-failed']}:set`);
  } catch (error) {
    console.error('[redis-queue] Get failed jobs failed:', error);
    return [];
  }
}

export async function retryFailedJob(url: string, sessionId: number): Promise<boolean> {
  try {
    const redisClient = await getRedis();
    const config = loadRedisConfig();
    
    // Remove from failed
    await redisClient.srem(`${config.queues['seo-failed']}:set`, url);
    
    // Add back to queue - sessionId is required
    const job: SeoJob = {
      url,
      sessionId: sessionId,
      addedAt: new Date().toISOString()
    };
    
    await redisClient.zadd(config.queues['seo-priority'], 1, JSON.stringify(job)); // High priority for retry
    await redisClient.sadd(`${config.queues.seo}:set`, url);
    
    return true;
  } catch (error) {
    console.error('[redis-queue] Retry failed job failed:', error);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
