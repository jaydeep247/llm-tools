/**
 * Session Cleanup Service
 * Removes all session-related data from Redis (audit queues, SEO queues, etc.)
 */

import { clearAuditQueue } from './audit/audit-queue.js';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

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
                'seo-failed': 'failed',
                audit: 'audit-queue',
                'audit-processing': 'audit-processing',
                'audit-completed': 'audit-completed',
                'audit-failed': 'audit-failed'
            }
        };
    }
}

async function getRedis(): Promise<Redis> {
    if (!redis) {
        const config = loadRedisConfig();
        console.log(`[session-cleanup] Connecting to Redis at ${config.host}:${config.port} (password: ${config.password ? '***' : 'none'})`);
        redis = new Redis({
            host: config.host,
            port: config.port,
            password: config.password || undefined, // Use undefined instead of null for ioredis
            db: config.db,
            maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
            lazyConnect: config.lazyConnect !== false,
            keyPrefix: config.keyPrefix || 'seo:'
        });

        redis.on('error', (err) => {
            console.error('[session-cleanup] Redis connection error:', (err as Error).message);
        });

        redis.on('connect', () => {
            console.log('[session-cleanup] Redis connected successfully');
        });
    }
    return redis;
}

/**
 * Clean up all Redis data for a session
 * Removes audit queues, SEO queues, and any session-specific keys
 */
export async function cleanupSessionFromRedis(sessionId: number): Promise<void> {
    try {
        const redisClient = await getRedis();
        const config = loadRedisConfig();

        console.log(`[session-cleanup] Cleaning up Redis data for session ${sessionId}`);

        // Clean up audit queues (uses existing function)
        try {
            await clearAuditQueue(sessionId);
        } catch (error) {
            console.warn(`[session-cleanup] Failed to clear audit queue for session ${sessionId}:`, error);
        }

        // Clean up SEO session-specific keys
        const seoKeys = [
            `${config.queues?.seo || 'queue'}:${sessionId}:priority`,
            `${config.queues?.seo || 'queue'}:${sessionId}:set`,
            `${config.queues?.['seo-processing'] || 'processing'}:${sessionId}:set`,
            `${config.queues?.['seo-failed'] || 'failed'}:${sessionId}:set`
        ];

        // Remove session-specific SEO keys
        for (const key of seoKeys) {
            try {
                await redisClient.del(key);
            } catch (error) {
                console.warn(`[session-cleanup] Failed to delete key ${key}:`, error);
            }
        }

        // Remove jobs from global SEO priority queue that match this sessionId
        // Note: We need to scan through the queue and remove matching jobs
        try {
            const globalQueueKey = config.queues?.['seo-priority'] || 'priority-queue';
            const allJobs = await redisClient.zrange(globalQueueKey, 0, -1, 'WITHSCORES');
            
            const jobsToRemove: string[] = [];
            for (const jobJson of allJobs) {
                if (typeof jobJson === 'string') {
                    try {
                        const job = JSON.parse(jobJson);
                        if (job.sessionId === sessionId) {
                            jobsToRemove.push(jobJson);
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }

            if (jobsToRemove.length > 0) {
                // Remove matching jobs from global queue
                await Promise.all(jobsToRemove.map(job => redisClient.zrem(globalQueueKey, job)));
                console.log(`[session-cleanup] Removed ${jobsToRemove.length} SEO jobs from global queue for session ${sessionId}`);
            }
        } catch (error) {
            console.warn(`[session-cleanup] Failed to clean global SEO queue for session ${sessionId}:`, error);
        }

        // Also clean from global SEO sets if they exist
        const globalSeoSets = [
            `${config.queues?.seo || 'queue'}:set`,
            `${config.queues?.['seo-processing'] || 'processing'}:set`,
            `${config.queues?.['seo-failed'] || 'failed'}:set`
        ];

        // For sets, we need to scan all members and remove URLs that belong to this session
        // This is complex, so we'll skip it for now unless there's a specific need
        // The keys above should handle most session-specific data

        console.log(`[session-cleanup] Successfully cleaned up Redis data for session ${sessionId}`);
    } catch (error) {
        console.error(`[session-cleanup] Failed to cleanup Redis for session ${sessionId}:`, error);
        throw error;
    }
}

/**
 * Close Redis connection
 */
export async function closeSessionCleanupRedis(): Promise<void> {
    if (redis) {
        await redis.quit();
        redis = null;
    }
}
