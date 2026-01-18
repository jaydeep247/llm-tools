/**
 * Redis Queue Service for Performance Audits
 * Provides distributed queue management for parallel audit processing
 */

import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

export type AuditJob = {
    url: string;
    sessionId: number;
    device: 'mobile' | 'desktop';
    addedAt: string;
};

type QueueStats = {
    totalQueued: number;
    processing: number;
    completed: number;
    failed: number;
};

const CONFIG_PATH = path.resolve(process.cwd(), 'config', 'redis.json');

let redis: Redis | null = null;

function loadRedisConfig() {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        if (process.env.REDIS_HOST) config.host = process.env.REDIS_HOST;
        if (process.env.REDIS_PORT) config.port = parseInt(process.env.REDIS_PORT, 10);
        if (process.env.REDIS_PASSWORD) config.password = process.env.REDIS_PASSWORD;
        return config;
    } catch (error) {
        console.warn('[audit-redis-queue] Redis config not found, using defaults');
        return {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD || null,
            db: 0,
            keyPrefix: 'audit:',
            queues: {
                audit: 'queue',
                'audit-priority': 'priority-queue',
                'audit-processing': 'processing',
                'audit-completed': 'completed',
                'audit-failed': 'failed'
            }
        };
    }
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
            keyPrefix: config.keyPrefix || 'audit:'
        });

        redis.on('error', (err) => {
            console.error('[audit-redis-queue] Redis connection error:', err);
        });

        redis.on('connect', () => {
            console.log('[audit-redis-queue] Redis connected successfully');
        });
    }
    return redis;
}

/**
 * Initialize audit queue for a session
 */
export async function initAuditQueue(sessionId: number): Promise<void> {
    try {
        await getRedis();
        console.log(`[audit-redis-queue] Initialized for sessionId: ${sessionId}`);
    } catch (error) {
        console.error('[audit-redis-queue] Initialization failed:', error);
        throw error;
    }
}

/**
 * Enqueue a URL for audit processing
 */
export async function enqueueAudit(job: AuditJob): Promise<boolean> {
    try {
        const redisClient = await getRedis();
        const config = loadRedisConfig();

        const sessionQueueKey = `${config.queues?.audit || 'queue'}:${job.sessionId}:priority`;
        const sessionQueueSet = `${config.queues?.audit || 'queue'}:${job.sessionId}:set`;
        const sessionProcessingSet = `${config.queues?.['audit-processing'] || 'processing'}:${job.sessionId}:set`;

        // Check if URL is already queued or processing
        const isQueued = await redisClient.sismember(sessionQueueSet, job.url);
        const isProcessing = await redisClient.sismember(sessionProcessingSet, job.url);

        if (isQueued || isProcessing) {
            return false;
        }

        // Add to priority queue (priority 1 = highest)
        await redisClient.zadd(sessionQueueKey, 1, JSON.stringify(job));
        await redisClient.sadd(sessionQueueSet, job.url);

        return true;
    } catch (error) {
        console.error('[audit-redis-queue] Enqueue failed:', error);
        return false;
    }
}

/**
 * Enqueue multiple URLs for audit processing
 */
export async function enqueueAudits(jobs: AuditJob[]): Promise<number> {
    let enqueued = 0;
    for (const job of jobs) {
        if (await enqueueAudit(job)) {
            enqueued++;
        }
    }
    return enqueued;
}

/**
 * Dequeue a job from Redis queue
 */
export async function dequeueAudit(sessionId?: number): Promise<AuditJob | null> {
    try {
        const redisClient = await getRedis();
        const config = loadRedisConfig();

        // If sessionId provided, dequeue from session-specific queue
        if (sessionId) {
            const queueKey = `${config.queues?.audit || 'queue'}:${sessionId}:priority`;

            // Get highest priority job (lowest score) - compatible with Redis 3.0
            const result = await redisClient.zrange(queueKey, 0, 0, 'WITHSCORES');
            if (!result || result.length === 0) {
                return null;
            }

            const job: AuditJob = JSON.parse(result[0]);

            // Validate job has sessionId
            if (!job.sessionId) {
                console.warn('[audit-redis-queue] Job missing sessionId, removing stale job:', job.url);
                await redisClient.zrem(queueKey, result[0]);
                return dequeueAudit(sessionId);
            }

            // Remove from priority queue
            await redisClient.zrem(queueKey, result[0]);

            // Move to processing set (session-specific)
            const sessionProcessingSet = `${config.queues?.['audit-processing'] || 'processing'}:${job.sessionId}:set`;
            const sessionQueueSet = `${config.queues?.audit || 'queue'}:${job.sessionId}:set`;

            await redisClient.sadd(sessionProcessingSet, job.url);
            await redisClient.srem(sessionQueueSet, job.url);

            return job;
        }

        // No sessionId provided - scan all session-specific queues to find a job
        // Note: keys() with keyPrefix doesn't auto-prefix the pattern, so we need to include prefix manually
        // Keys are stored as 'seo:audit-queue:11:priority' (ioredis auto-prefixes when storing)
        // So pattern should be 'seo:audit-queue:*:priority' (with prefix included)
        const queuePrefix = config.keyPrefix || 'audit:';
        const queueBaseName = config.queues?.audit || 'audit-queue';
        const pattern = `${queuePrefix}${queueBaseName}:*:priority`;

        // Use call('KEYS', ...) to bypass ioredis keyPrefix handling for pattern matching
        // Returns keys with full prefix (e.g., 'seo:audit-queue:11:priority')
        const queueKeysWithPrefix = await redisClient.call('KEYS', pattern) as string[];

        // Strip the prefix from keys since ioredis operations auto-add the prefix
        // If keyPrefix is 'seo:' and key is 'seo:audit-queue:11:priority', strip to 'audit-queue:11:priority'
        const prefixLength = queuePrefix.length;
        const queueKeys = queueKeysWithPrefix.map(key => key.startsWith(queuePrefix) ? key.substring(prefixLength) : key);

        // Try each queue until we find a job
        for (const queueKey of queueKeys) {
            // Get highest priority job (lowest score) - compatible with Redis 3.0
            // queueKey now has prefix stripped, so ioredis will auto-add it back
            const result = await redisClient.zrange(queueKey, 0, 0, 'WITHSCORES');
            if (!result || result.length === 0) {
                continue; // This queue is empty, try next
            }

            const job: AuditJob = JSON.parse(result[0]);

            // Validate job has sessionId
            if (!job.sessionId) {
                console.warn('[audit-redis-queue] Job missing sessionId, removing stale job:', job.url);
                await redisClient.zrem(queueKey, result[0]);
                continue; // Try next queue or retry this one
            }

            // Remove from priority queue
            await redisClient.zrem(queueKey, result[0]);

            // Move to processing set (session-specific)
            const sessionProcessingSet = `${config.queues?.['audit-processing'] || 'processing'}:${job.sessionId}:set`;
            const sessionQueueSet = `${config.queues?.audit || 'queue'}:${job.sessionId}:set`;

            await redisClient.sadd(sessionProcessingSet, job.url);
            await redisClient.srem(sessionQueueSet, job.url);

            return job;
        }

        // No jobs found in any queue
        return null;
    } catch (error) {
        console.error('[audit-redis-queue] Dequeue failed:', error);
        return null;
    }
}

/**
 * Mark job as complete and move from processing queue
 */
export async function markAuditComplete(url: string, success: boolean, sessionId: number): Promise<void> {
    try {
        const redisClient = await getRedis();
        const config = loadRedisConfig();

        const processingSet = `${config.queues?.['audit-processing'] || 'processing'}:${sessionId}:set`;

        // Remove from processing
        await redisClient.srem(processingSet, url);

        if (success) {
            // Move to completed set
            const completedSet = `${config.queues?.['audit-completed'] || 'completed'}:${sessionId}:set`;
            await redisClient.sadd(completedSet, url);
            await redisClient.expire(completedSet, config.ttl?.job || 3600);
        } else {
            // Move to failed set
            const failedSet = `${config.queues?.['audit-failed'] || 'failed'}:${sessionId}:set`;
            await redisClient.sadd(failedSet, url);
            await redisClient.expire(failedSet, config.ttl?.failed || 86400);
        }
    } catch (error) {
        console.error('[audit-redis-queue] Mark complete failed:', error);
    }
}

/**
 * Get queue statistics for a session
 */
export async function getAuditQueueStats(sessionId: number): Promise<QueueStats> {
    try {
        const redisClient = await getRedis();
        const config = loadRedisConfig();

        const queueKey = `${config.queues?.audit || 'queue'}:${sessionId}:priority`;
        const processingSet = `${config.queues?.['audit-processing'] || 'processing'}:${sessionId}:set`;
        const completedSet = `${config.queues?.['audit-completed'] || 'completed'}:${sessionId}:set`;
        const failedSet = `${config.queues?.['audit-failed'] || 'failed'}:${sessionId}:set`;

        const [totalQueued, processing, completed, failed] = await Promise.all([
            redisClient.zcard(queueKey),
            redisClient.scard(processingSet),
            redisClient.scard(completedSet),
            redisClient.scard(failedSet)
        ]);

        return {
            totalQueued,
            processing,
            completed,
            failed
        };
    } catch (error) {
        console.error('[audit-redis-queue] Get stats failed:', error);
        return {
            totalQueued: 0,
            processing: 0,
            completed: 0,
            failed: 0
        };
    }
}

/**
 * Cleanup stuck jobs in processing set (jobs stuck for > 5 minutes)
 * This handles cases where jobs were dequeued but never marked as complete
 */
export async function cleanupStuckJobs(sessionId: number, timeoutMs: number = 5 * 60 * 1000): Promise<number> {
    try {
        const redisClient = await getRedis();
        const config = loadRedisConfig();
        const processingSet = `${config.queues?.['audit-processing'] || 'processing'}:${sessionId}:set`;
        const failedSet = `${config.queues?.['audit-failed'] || 'failed'}:${sessionId}:set`;

        // Get all URLs in processing
        const processingUrls = await redisClient.smembers(processingSet);
        let cleanedCount = 0;

        // Note: Redis sets don't store timestamps, so we use a heuristic:
        // If queue is empty and we have stuck jobs, mark them as failed after reasonable timeout
        // In practice, if processing jobs exist for > 5 minutes with no queue activity, they're likely stuck
        if (processingUrls.length > 0) {
            // Move all stuck URLs to failed set
            for (const url of processingUrls) {
                await redisClient.srem(processingSet, url);
                await redisClient.sadd(failedSet, url);
                cleanedCount++;
            }
        }

        return cleanedCount;
    } catch (error) {
        console.error('[audit-redis-queue] Cleanup stuck jobs failed:', error);
        return 0;
    }
}

/**
 * Check if all audits are complete for a session
 * If queue is empty but jobs are stuck in processing > 5 minutes, clean them up
 */
export async function areAuditsComplete(sessionId: number): Promise<boolean> {
    try {
        const stats = await getAuditQueueStats(sessionId);
        
        // If queue is empty but jobs are stuck in processing, cleanup after timeout
        if (stats.totalQueued === 0 && stats.processing > 0) {
            // Check if jobs have been stuck (heuristic: if no queue activity for > 5 min, cleanup)
            // In practice, this handles cases where workers crashed or jobs failed silently
            const cleaned = await cleanupStuckJobs(sessionId);
            if (cleaned > 0) {
                console.log(`[audit-redis-queue] Cleaned up ${cleaned} stuck jobs in processing set`);
            }
            
            // Re-check stats after cleanup
            const newStats = await getAuditQueueStats(sessionId);
            return newStats.totalQueued === 0 && newStats.processing === 0;
        }
        
        return stats.totalQueued === 0 && stats.processing === 0;
    } catch (error) {
        console.error('[audit-redis-queue] Check complete failed:', error);
        return false;
    }
}

/**
 * Clear audit queues for a session
 */
export async function clearAuditQueue(sessionId: number): Promise<void> {
    try {
        const redisClient = await getRedis();
        const config = loadRedisConfig();

        await Promise.all([
            redisClient.del(`${config.queues?.audit || 'queue'}:${sessionId}:priority`),
            redisClient.del(`${config.queues?.audit || 'queue'}:${sessionId}:set`),
            redisClient.del(`${config.queues?.['audit-processing'] || 'processing'}:${sessionId}:set`),
            redisClient.del(`${config.queues?.['audit-completed'] || 'completed'}:${sessionId}:set`),
            redisClient.del(`${config.queues?.['audit-failed'] || 'failed'}:${sessionId}:set`)
        ]);

        console.log(`[audit-redis-queue] Queue cleared successfully for session ${sessionId}`);
    } catch (error) {
        console.error('[audit-redis-queue] Clear queue failed:', error);
        throw error;
    }
}

/**
 * Close Redis connection
 */
export async function closeAuditRedis(): Promise<void> {
    if (redis) {
        await redis.quit();
        redis = null;
    }
}
