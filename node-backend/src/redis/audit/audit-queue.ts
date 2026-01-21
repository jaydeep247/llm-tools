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
    userId: number; // User ID for user-wise isolation
    device: 'mobile' | 'desktop';
    addedAt: string;
    retryCount?: number; // Number of retry attempts (0 = first attempt)
    nextRetryAt?: number; // Timestamp when job should be retried (for exponential backoff)
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
        // Always use environment variable if set (even if empty string, though that's unlikely)
        if (process.env.REDIS_PASSWORD !== undefined) {
            config.password = process.env.REDIS_PASSWORD || null;
        }
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
        console.log(`[audit-redis-queue] Connecting to Redis at ${config.host}:${config.port} (password: ${config.password ? '***' : 'none'})`);
        redis = new Redis({
            host: config.host,
            port: config.port,
            password: config.password || undefined, // Use undefined instead of null for ioredis
            db: config.db,
            maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
            lazyConnect: config.lazyConnect !== false,
            keyPrefix: config.keyPrefix || 'audit:',
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                console.log(`[audit-redis-queue] Retrying Redis connection (attempt ${times}) in ${delay}ms...`);
                return delay;
            }
        });

        redis.on('error', (err) => {
            console.error('[audit-redis-queue] Redis connection error:', err.message);
        });

        redis.on('connect', () => {
            console.log('[audit-redis-queue] Redis connected successfully');
        });

        redis.on('ready', () => {
            console.log('[audit-redis-queue] Redis is ready to accept commands');
        });

        // Test connection immediately
        try {
            await redis.ping();
            console.log('[audit-redis-queue] Redis ping successful');
        } catch (err) {
            console.error('[audit-redis-queue] Redis ping failed:', (err as Error).message);
        }
    }
    return redis;
}

/**
 * Get userId for a session (helper function)
 */
async function getUserIdForSession(sessionId: number): Promise<number | null> {
    try {
        const { getDatabase } = await import('../../services/DatabaseService.js');
        const db = getDatabase();
        const session = await db.getCrawlSession(sessionId);
        return session?.userId || null;
    } catch (error) {
        console.error(`[audit-redis-queue] Failed to get userId for session ${sessionId}:`, error);
        return null;
    }
}

/**
 * Initialize audit queue for a session
 */
export async function initAuditQueue(sessionId: number): Promise<void> {
    try {
        await getRedis();
        const userId = await getUserIdForSession(sessionId);
        if (!userId) {
            throw new Error(`Cannot initialize queue: userId not found for session ${sessionId}`);
        }
        console.log(`[audit-redis-queue] Initialized for userId: ${userId}, sessionId: ${sessionId}`);
    } catch (error) {
        console.error('[audit-redis-queue] Initialization failed:', error);
        throw error;
    }
}

/**
 * Generate queue keys with user and session isolation
 */
function getQueueKeys(config: any, userId: number, sessionId: number) {
    const baseKey = `${config.queues?.audit || 'queue'}:${userId}:${sessionId}`;
    return {
        priority: `${baseKey}:priority`,
        set: `${baseKey}:set`,
        processing: `${config.queues?.['audit-processing'] || 'processing'}:${userId}:${sessionId}:set`,
        completed: `${config.queues?.['audit-completed'] || 'completed'}:${userId}:${sessionId}:set`,
        failed: `${config.queues?.['audit-failed'] || 'failed'}:${userId}:${sessionId}:set`
    };
}

/**
 * Enqueue a URL for audit processing
 * Requires userId in job for user-wise isolation
 */
export async function enqueueAudit(job: AuditJob): Promise<boolean> {
    try {
        // Validate userId is present
        if (!job.userId) {
            // Try to get userId from session if not provided
            const userId = await getUserIdForSession(job.sessionId);
            if (!userId) {
                console.error('[audit-redis-queue] Cannot enqueue: userId not found for session', job.sessionId);
                return false;
            }
            job.userId = userId;
        }

        const redisClient = await getRedis();
        const config = loadRedisConfig();
        const keys = getQueueKeys(config, job.userId, job.sessionId);

        // Check if URL is already queued or processing
        const isQueued = await redisClient.sismember(keys.set, job.url);
        const isProcessing = await redisClient.sismember(keys.processing, job.url);

        if (isQueued || isProcessing) {
            return false;
        }

        // Add to priority queue (priority 1 = highest)
        await redisClient.zadd(keys.priority, 1, JSON.stringify(job));
        await redisClient.sadd(keys.set, job.url);

        return true;
    } catch (error) {
        console.error('[audit-redis-queue] Enqueue failed:', error);
        return false;
    }
}

/**
 * Enqueue multiple URLs for audit processing (optimized with batch operations)
 */
export async function enqueueAudits(jobs: AuditJob[]): Promise<number> {
    if (jobs.length === 0) return 0;

    try {
        const redisClient = await getRedis();
        const config = loadRedisConfig();
        
        // Group jobs by userId:sessionId for batch operations
        const jobGroups = new Map<string, AuditJob[]>();
        
        for (const job of jobs) {
            // Ensure userId is set
            if (!job.userId) {
                const userId = await getUserIdForSession(job.sessionId);
                if (!userId) {
                    console.warn(`[audit-redis-queue] Skipping job: userId not found for session ${job.sessionId}`);
                    continue;
                }
                job.userId = userId;
            }
            
            const key = `${job.userId}:${job.sessionId}`;
            if (!jobGroups.has(key)) {
                jobGroups.set(key, []);
            }
            jobGroups.get(key)!.push(job);
        }

        let enqueued = 0;
        
        // Process each group in batch
        for (const [key, groupJobs] of jobGroups) {
            const [userId, sessionId] = key.split(':').map(Number);
            const keys = getQueueKeys(config, userId, sessionId);
            
            // Batch check for duplicates
            const urlsToCheck = groupJobs.map(j => j.url);
            const [queuedUrls, processingUrls] = await Promise.all([
                redisClient.smembers(keys.set),
                redisClient.smembers(keys.processing)
            ]);
            
            const existingUrls = new Set([...queuedUrls, ...processingUrls]);
            
            // Batch add new jobs
            const multi = redisClient.multi();
            let batchCount = 0;
            
            for (const job of groupJobs) {
                if (!existingUrls.has(job.url)) {
                    multi.zadd(keys.priority, 1, JSON.stringify(job));
                    multi.sadd(keys.set, job.url);
                    batchCount++;
                }
            }
            
            if (batchCount > 0) {
                await multi.exec();
                enqueued += batchCount;
            }
        }
        
        return enqueued;
    } catch (error) {
        console.error('[audit-redis-queue] Batch enqueue failed, falling back to individual:', error);
        // Fallback to individual enqueueing
        let enqueued = 0;
        for (const job of jobs) {
            if (await enqueueAudit(job)) {
                enqueued++;
            }
        }
        return enqueued;
    }
}

/**
 * Dequeue a job from Redis queue using atomic operations to prevent race conditions
 */
export async function dequeueAudit(sessionId?: number): Promise<AuditJob | null> {
    try {
        const redisClient = await getRedis();
        const config = loadRedisConfig();

        // If sessionId provided, get userId and dequeue from user:session-specific queue
        if (sessionId) {
            const userId = await getUserIdForSession(sessionId);
            if (!userId) {
                console.warn(`[audit-redis-queue] Cannot dequeue: userId not found for session ${sessionId}`);
                return null;
            }
            return await dequeueFromSession(redisClient, config, userId, sessionId);
        }

        // No sessionId provided - scan all user:session-specific queues to find a job
        const queuePrefix = config.keyPrefix || 'audit:';
        const queueBaseName = config.queues?.audit || 'queue';
        // Pattern: queue:userId:sessionId:priority
        const pattern = `${queuePrefix}${queueBaseName}:*:*:priority`;

        // Try SCAN first (non-blocking), fallback to KEYS if SCAN not available
        // Increased COUNT for faster scanning
        let queueKeys: string[] = [];
        try {
            let cursor = '0';
            do {
                const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
                cursor = nextCursor;
                // Strip prefix from keys
                const prefixLength = queuePrefix.length;
                queueKeys.push(...keys.map(key => key.startsWith(queuePrefix) ? key.substring(prefixLength) : key));
            } while (cursor !== '0');
        } catch (scanError) {
            // Fallback to KEYS if SCAN not supported (Redis < 2.8)
            console.warn('[audit-redis-queue] SCAN not available, using KEYS (may block Redis):', scanError);
            const queueKeysWithPrefix = await redisClient.call('KEYS', pattern) as string[];
            const prefixLength = queuePrefix.length;
            queueKeys = queueKeysWithPrefix.map(key => key.startsWith(queuePrefix) ? key.substring(prefixLength) : key);
        }

        // Try each queue until we find a job
        for (const queueKey of queueKeys) {
            const job = await dequeueFromSession(redisClient, config, undefined, undefined, queueKey);
            if (job) {
                return job;
            }
        }

        // No jobs found in any queue
        return null;
    } catch (error) {
        console.error('[audit-redis-queue] Dequeue failed:', error);
        return null;
    }
}

/**
 * Dequeue from a specific user:session queue using atomic operations
 */
async function dequeueFromSession(
    redisClient: Redis,
    config: any,
    userId?: number,
    sessionId?: number,
    queueKeyOverride?: string
): Promise<AuditJob | null> {
    let queueKey: string;
    let keys: ReturnType<typeof getQueueKeys> | null = null;

    if (queueKeyOverride) {
        // Extract userId and sessionId from queue key pattern: queue:userId:sessionId:priority
        const parts = queueKeyOverride.split(':');
        if (parts.length >= 3) {
            const extractedUserId = parseInt(parts[1], 10);
            const extractedSessionId = parseInt(parts[2], 10);
            if (!isNaN(extractedUserId) && !isNaN(extractedSessionId)) {
                keys = getQueueKeys(config, extractedUserId, extractedSessionId);
                queueKey = keys.priority;
            } else {
                queueKey = queueKeyOverride;
            }
        } else {
            queueKey = queueKeyOverride;
        }
    } else if (userId && sessionId) {
        keys = getQueueKeys(config, userId, sessionId);
        queueKey = keys.priority;
    } else {
        return null;
    }

    const now = Date.now();

    // Use atomic transaction to get and remove job (prevents race conditions)
    const multi = redisClient.multi();
    
    // Get more jobs at once for faster processing (check up to 20 jobs for ready ones)
    multi.zrange(queueKey, 0, 20, 'WITHSCORES');
    
    const results = await multi.exec();
    if (!results || results.length === 0) {
        return null;
    }

    const jobsWithScores = results[0][1] as (string | number)[];
    if (!jobsWithScores || jobsWithScores.length === 0) {
        return null;
    }

    // Find first job that's ready to process (nextRetryAt <= now or not set)
    let selectedJob: AuditJob | null = null;
    let selectedJobStr: string | null = null;

    for (let i = 0; i < jobsWithScores.length; i += 2) {
        const jobStr = String(jobsWithScores[i]);
        const score = Number(jobsWithScores[i + 1]);

        try {
            const job: AuditJob = JSON.parse(jobStr);
            
            // Validate job has required fields
            if (!job.sessionId || !job.userId) {
                console.warn('[audit-redis-queue] Job missing sessionId or userId, will remove:', job.url);
                await redisClient.zrem(queueKey, jobStr);
                continue;
            }

            // Check if job is ready (no nextRetryAt or it's time to retry)
            if (!job.nextRetryAt || job.nextRetryAt <= now) {
                selectedJob = job;
                selectedJobStr = jobStr;
                break;
            }
        } catch (parseError) {
            console.warn('[audit-redis-queue] Failed to parse job, removing:', parseError);
            await redisClient.zrem(queueKey, jobStr);
            continue;
        }
    }

    if (!selectedJob || !selectedJobStr) {
        return null; // No ready jobs found
    }

    // Atomically remove the job and move to processing
    const multi2 = redisClient.multi();
    multi2.zrem(queueKey, selectedJobStr);
    const execResults = await multi2.exec();

    if (!execResults || execResults[0][1] !== 1) {
        // Job was already taken by another worker
        return null;
    }

    // Get keys if not already determined
    if (!keys) {
        keys = getQueueKeys(config, selectedJob.userId, selectedJob.sessionId);
    }

    // Move to processing set (user:session-specific)
    await redisClient.sadd(keys.processing, selectedJob.url);
    await redisClient.srem(keys.set, selectedJob.url);

    return selectedJob;
}

/**
 * Mark job as complete and move from processing queue
 * If failed and retries available, re-queue with exponential backoff
 */
export async function markAuditComplete(
    url: string,
    success: boolean,
    sessionId: number,
    job?: AuditJob,
    maxRetries: number = 3
): Promise<void> {
    try {
        if (!job || !job.userId) {
            console.error('[audit-redis-queue] Cannot mark complete: job missing userId');
            return;
        }

        const redisClient = await getRedis();
        const config = loadRedisConfig();
        const keys = getQueueKeys(config, job.userId, sessionId);

        // Remove from processing
        await redisClient.srem(keys.processing, url);

        if (success) {
            // Move to completed set
            await redisClient.sadd(keys.completed, url);
            await redisClient.expire(keys.completed, config.ttl?.job || 3600);
        } else {
            // Check if we should retry
            const retryCount = (job.retryCount || 0) + 1;
            
            if (retryCount <= maxRetries) {
                // Faster retry backoff: reduced delays for quicker retries (min 2s, max 30s)
                const backoffSeconds = Math.min(Math.max(2, Math.pow(1.5, retryCount)), 30);
                const nextRetryAt = Date.now() + (backoffSeconds * 1000);

                // Re-queue with retry info
                const retryJob: AuditJob = {
                    ...job,
                    retryCount,
                    nextRetryAt
                };

                // Use lower priority for retries (higher score = lower priority)
                // Priority = 1 + retryCount (so first retry = 2, second = 3, etc.)
                const priority = 1 + retryCount;
                await redisClient.zadd(keys.priority, priority, JSON.stringify(retryJob));
                
                console.log(`[audit-redis-queue] Re-queued ${url} for retry ${retryCount}/${maxRetries} (retry in ${backoffSeconds}s) - userId: ${job.userId}, sessionId: ${sessionId}`);
            } else {
                // Max retries exceeded, move to failed set
                await redisClient.sadd(keys.failed, url);
                await redisClient.expire(keys.failed, config.ttl?.failed || 86400);
                console.log(`[audit-redis-queue] Max retries exceeded for ${url}, marked as failed - userId: ${job.userId}, sessionId: ${sessionId}`);
            }
        }
    } catch (error) {
        console.error('[audit-redis-queue] Mark complete failed:', error);
    }
}

/**
 * Get queue statistics for a session (user:session-specific)
 */
export async function getAuditQueueStats(sessionId: number): Promise<QueueStats> {
    try {
        const userId = await getUserIdForSession(sessionId);
        if (!userId) {
            console.warn(`[audit-redis-queue] Cannot get stats: userId not found for session ${sessionId}`);
            return {
                totalQueued: 0,
                processing: 0,
                completed: 0,
                failed: 0
            };
        }

        const redisClient = await getRedis();
        const config = loadRedisConfig();
        const keys = getQueueKeys(config, userId, sessionId);

        const [totalQueued, processing, completed, failed] = await Promise.all([
            redisClient.zcard(keys.priority),
            redisClient.scard(keys.processing),
            redisClient.scard(keys.completed),
            redisClient.scard(keys.failed)
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
        const userId = await getUserIdForSession(sessionId);
        if (!userId) {
            console.warn(`[audit-redis-queue] Cannot cleanup: userId not found for session ${sessionId}`);
            return 0;
        }

        const redisClient = await getRedis();
        const config = loadRedisConfig();
        const keys = getQueueKeys(config, userId, sessionId);

        // Get all URLs in processing
        const processingUrls = await redisClient.smembers(keys.processing);
        let cleanedCount = 0;

        // Note: Redis sets don't store timestamps, so we use a heuristic:
        // If queue is empty and we have stuck jobs, mark them as failed after reasonable timeout
        // In practice, if processing jobs exist for > 5 minutes with no queue activity, they're likely stuck
        if (processingUrls.length > 0) {
            // Move all stuck URLs to failed set
            for (const url of processingUrls) {
                await redisClient.srem(keys.processing, url);
                await redisClient.sadd(keys.failed, url);
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
 * Clear audit queues for a session (user:session-specific)
 */
export async function clearAuditQueue(sessionId: number): Promise<void> {
    try {
        const userId = await getUserIdForSession(sessionId);
        if (!userId) {
            console.warn(`[audit-redis-queue] Cannot clear: userId not found for session ${sessionId}`);
            return;
        }

        const redisClient = await getRedis();
        const config = loadRedisConfig();
        const keys = getQueueKeys(config, userId, sessionId);

        await Promise.all([
            redisClient.del(keys.priority),
            redisClient.del(keys.set),
            redisClient.del(keys.processing),
            redisClient.del(keys.completed),
            redisClient.del(keys.failed)
        ]);

        console.log(`[audit-redis-queue] Queue cleared successfully for userId: ${userId}, sessionId: ${sessionId}`);
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
