import { getRedisClient } from '../config/redis';
import { logger } from '../shared/logger/logger';

export interface JobEvent {
  jobId: string;
  eventType: string;
  payload: any;
  timestamp: number;
}

export interface JobSnapshot {
  jobId: string;
  status: string;
  logs: { message: string; timestamp: number }[];
  links: { url: string; timestamp: number }[];
  completed: boolean;
  snapshotAt: number;     // epoch ms - boundary for socket event filtering
  startedAt?: number;     // epoch ms - when job started
  projectId?: string;
  sessionId?: string;
  pagesCrawled?: number;  // Final count from completion event
  steps?: Record<string, string>;  // Step statuses for quick-start jobs (e.g. { brand_analysis: 'completed' })
}

interface CompactLogEntry {
  m: string;
  t: number;
}

interface CompactLinkEntry {
  u: string;
  t: number;
}

const REDIS_TTL = 3600 * 24; // 24 hours
const MAX_LOGS = 1000;
const MAX_LINKS = 1000;
const SNAPSHOT_DEFAULT_LIMIT = 200;
const SNAPSHOT_MAX_LIMIT = 500;

export class LiveJobService {
  private static toCompactLogEntry(event: JobEvent): CompactLogEntry {
    const message = event.payload?.message
      || (event as any).message
      || (typeof event.payload === 'string' ? event.payload : null)
      || event.eventType
      || 'event';

    return {
      m: String(message),
      t: Number(event.timestamp) || Date.now(),
    };
  }

  private static toCompactLinkEntry(event: JobEvent): CompactLinkEntry | null {
    const url = event.payload?.url
      || (event as any).url
      || (typeof event.payload === 'string' ? event.payload : null);

    if (!url) {
      return null;
    }

    return {
      u: String(url),
      t: Number(event.timestamp) || Date.now(),
    };
  }

  private static parseLogEntry(raw: string): { message: string; timestamp: number } {
    try {
      const parsed = JSON.parse(raw);

      // New compact format.
      if (parsed && typeof parsed.m === 'string') {
        return {
          message: parsed.m,
          timestamp: Number(parsed.t) || Date.now(),
        };
      }

      // Legacy full event envelope.
      const message = parsed?.payload?.message
        || parsed?.message
        || (typeof parsed?.payload === 'string' ? parsed.payload : null)
        || parsed?.eventType
        || raw;

      return {
        message: String(message),
        timestamp: Number(parsed?.timestamp) || Date.now(),
      };
    } catch {
      return { message: raw, timestamp: Date.now() };
    }
  }

  private static parseLinkEntry(raw: string): { url: string | null; timestamp: number } {
    try {
      const parsed = JSON.parse(raw);

      // New compact format.
      if (parsed && typeof parsed.u === 'string') {
        return {
          url: parsed.u,
          timestamp: Number(parsed.t) || Date.now(),
        };
      }

      // Legacy full event envelope.
      const url = parsed?.payload?.url
        || parsed?.url
        || (typeof parsed?.payload === 'string' ? parsed.payload : null)
        || null;

      return {
        url: url ? String(url) : null,
        timestamp: Number(parsed?.timestamp) || Date.now(),
      };
    } catch {
      return { url: raw || null, timestamp: Date.now() };
    }
  }

  /**
   * Save job metadata (projectId, sessionId) to Redis
   */
  static async setJobMeta(jobId: string, projectId: string, sessionId: string): Promise<void> {
    const redis = getRedisClient();
    const metaKey = `job:${jobId}:meta`;
    await redis.set(metaKey, JSON.stringify({ projectId, sessionId }));
    await redis.expire(metaKey, REDIS_TTL);
  }

  /**
   * Save event to Redis using the Snapshot schema
   */
  static async saveEvent(event: JobEvent): Promise<boolean> {
    const { jobId, eventType, payload, timestamp } = event;
    const redis = getRedisClient(); 
    
    // Keys
    const statusKey = `job:${jobId}:status`;
    const logsKey = `job:${jobId}:logs`;
    const linksKey = `job:${jobId}:links`;
    const completedKey = `job:${jobId}:completed`;

    try {
      const pipeline = redis.pipeline();

      // 1. Update Status
      if (['JOB_STARTED', 'JOB_COMPLETED', 'JOB_FAILED', 'status'].includes(eventType)) {
        const status = payload?.status || eventType;
        pipeline.set(statusKey, status);
        pipeline.expire(statusKey, REDIS_TTL);

        // Keep a compatibility hash for Python/legacy readers while the
        // canonical runtime path uses namespaced keys.
        pipeline.hset(`job:${jobId}`, 'status', status, 'updatedAt', String(Date.now()));
        pipeline.expire(`job:${jobId}`, REDIS_TTL);
        
        if (eventType === 'JOB_STARTED') {
             // ✅ CLEAR all previous job data to prevent stale state
             pipeline.del(logsKey);
             pipeline.del(linksKey);
             pipeline.del(`job:${jobId}:pages`);
             pipeline.del(`job:${jobId}:pages_count`);
             pipeline.del(completedKey);
             
             // Save new startedAt
             const startedAt = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
             pipeline.set(`job:${jobId}:startedAt`, startedAt);
             pipeline.expire(`job:${jobId}:startedAt`, REDIS_TTL);
             
             // Save metadata if available (projectId, sessionId)
             if (payload?.projectId && payload?.sessionId) {
                 pipeline.set(`job:${jobId}:meta`, JSON.stringify({
                     projectId: payload.projectId,
                     sessionId: payload.sessionId
                 }));
                 pipeline.expire(`job:${jobId}:meta`, REDIS_TTL);
               pipeline.hset(
                 `job:${jobId}`,
                 'projectId',
                 payload.projectId,
                 'sessionId',
                 payload.sessionId,
               );
               pipeline.expire(`job:${jobId}`, REDIS_TTL);
             }
        }
        
        if (eventType === 'JOB_COMPLETED' || eventType === 'JOB_FAILED' || status === 'completed' || status === 'failed') {
             pipeline.set(completedKey, 'true');
             pipeline.expire(completedKey, REDIS_TTL);
             
             // Save final stats if available
             if (payload?.pages_crawled !== undefined) {
                 pipeline.set(`job:${jobId}:pages_count`, payload.pages_crawled);
                 pipeline.expire(`job:${jobId}:pages_count`, REDIS_TTL);
             }

             // Save metadata if available (projectId, sessionId) - Robustness for redirect
             if (payload?.projectId && payload?.sessionId) {
                 pipeline.set(`job:${jobId}:meta`, JSON.stringify({
                     projectId: payload.projectId,
                     sessionId: payload.sessionId
                 }));
                 pipeline.expire(`job:${jobId}:meta`, REDIS_TTL);
                 pipeline.hset(
                   `job:${jobId}`,
                   'projectId',
                   payload.projectId,
                   'sessionId',
                   payload.sessionId,
                 );
                 pipeline.expire(`job:${jobId}`, REDIS_TTL);
             }
        }
      }

      // 2. Append Logs (Only meaningful progress events - NOT link_found)
      // Filter to: log, JOB_STARTED, JOB_COMPLETED, JOB_FAILED, page_crawled, QS_STEP_UPDATE
      const logEventTypes = ['log', 'JOB_STARTED', 'JOB_COMPLETED', 'JOB_FAILED', 'page_crawled', 'QS_STEP_UPDATE'];
      if (logEventTypes.includes(eventType)) {
          const compactLog = this.toCompactLogEntry(event);
          pipeline.rpush(logsKey, JSON.stringify(compactLog));
          pipeline.ltrim(logsKey, -MAX_LOGS, -1);
          pipeline.expire(logsKey, REDIS_TTL);
      }

      // 3. Append Pages (completed crawled pages - for progress count)
      // This is separate from links discovered
      const pagesKey = `job:${jobId}:pages`;
      const pagesCountKey = `job:${jobId}:pages_count`;
      if (eventType === 'page_crawled') {
          const compactPage = this.toCompactLinkEntry(event);
          if (compactPage) {
            pipeline.rpush(pagesKey, JSON.stringify(compactPage));
          }
          pipeline.ltrim(pagesKey, -MAX_LINKS, -1);
          pipeline.expire(pagesKey, REDIS_TTL);
          // Increment the real-time counter
          pipeline.incr(pagesCountKey);
          pipeline.expire(pagesCountKey, REDIS_TTL);
      }

      // 3b. Store quick-start step statuses in a dedicated hash
      const stepsKey = `job:${jobId}:steps`;
      if (eventType === 'QS_STEP_UPDATE' && payload?.step && payload?.stepStatus) {
          pipeline.hset(stepsKey, payload.step, payload.stepStatus);
          pipeline.expire(stepsKey, REDIS_TTL);
      }

      // 4. Append Links (discovered URLs - kept for legacy/reference but not shown in UI count)
      // IMPORTANT: Match ALL possible event type formats:
      // - 'link_found' (lowercase with underscore) - actual spider
      // - 'LINK_FOUND' (uppercase) - test producer
      // - 'link' (just link)
      const linkEventTypes = ['link_found', 'LINK_FOUND', 'link'];
      if (linkEventTypes.includes(eventType) || eventType.toLowerCase().includes('link')) {
          const compactLink = this.toCompactLinkEntry(event);
          if (compactLink) {
            pipeline.rpush(linksKey, JSON.stringify(compactLink));
          }
          pipeline.ltrim(linksKey, -MAX_LINKS, -1);
          pipeline.expire(linksKey, REDIS_TTL);
      }

      const results = await pipeline.exec();
      
      // Check for errors in pipeline execution
      if (results) {
        results.forEach(([err], index) => {
          if (err) {
            logger.error(`Redis pipeline error at index ${index} for job ${jobId}:`, err);
          }
        });
      }

      return true;
    } catch (error) {
      logger.error(`Error saving job event for ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get Snapshot of current job state
   * 
   * IMPORTANT: This transforms raw Redis event envelopes into clean format:
   * - Logs: { message, timestamp }
   * - Links: { url, timestamp }
   */
  static async getSnapshot(jobId: string, limit = SNAPSHOT_DEFAULT_LIMIT): Promise<JobSnapshot> {
    const redis = getRedisClient();
    const boundedLimit = Math.max(25, Math.min(limit, SNAPSHOT_MAX_LIMIT));
    
    const statusKey = `job:${jobId}:status`;
    const logsKey = `job:${jobId}:logs`;
    const pagesKey = `job:${jobId}:pages`;  // Crawled pages (for progress count)
    const completedKey = `job:${jobId}:completed`;
    const startedAtKey = `job:${jobId}:startedAt`;
    const metaKey = `job:${jobId}:meta`;
    const pagesCountKey = `job:${jobId}:pages_count`;
    const legacyHashKey = `job:${jobId}`;
    const stepsKey = `job:${jobId}:steps`;  // Quick-start step statuses

    try {
      // Use one pipeline round-trip for snapshot reads.
      const raw = await redis
        .pipeline()
        .get(statusKey)
        .lrange(logsKey, -boundedLimit, -1)
        .lrange(pagesKey, -boundedLimit, -1)
        .get(completedKey)
        .get(startedAtKey)
        .get(metaKey)
        .get(pagesCountKey)
        .hgetall(stepsKey)
        .hget(legacyHashKey, 'status')
        .exec();

      if (!raw) {
        throw new Error('Redis pipeline returned no data');
      }

      const [
        statusResult,
        logsResult,
        pagesResult,
        completedResult,
        startedAtResult,
        metaResult,
        pagesCountResult,
        stepsResult,
        legacyStatusResult,
      ] = raw;

      const status = statusResult[1] as string | null;
      const logsRaw = (logsResult[1] as string[]) || [];
      const pagesRaw = (pagesResult[1] as string[]) || [];
      const completed = completedResult[1] as string | null;
      const startedAt = startedAtResult[1] as string | null;
      const metaRaw = metaResult[1] as string | null;
      const pagesCountRaw = pagesCountResult[1] as string | null;
      const stepsRaw = (stepsResult[1] as Record<string, string>) || {};
      const legacyStatus = legacyStatusResult[1] as string | null;

      // Parse metadata
      let projectId: string | undefined;
      let sessionId: string | undefined;
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw);
          projectId = meta.projectId;
          sessionId = meta.sessionId;
        } catch (e) {
          logger.warn(`Failed to parse job meta for ${jobId}: ${e}`);
        }
      }

      // Transform raw event envelopes into clean log format
      // Track max timestamp for snapshotAt boundary
      let maxTimestamp = 0;
      
      const logs = logsRaw.map((entry) => {
        const parsed = this.parseLogEntry(entry);
        if (parsed.timestamp > maxTimestamp) {
          maxTimestamp = parsed.timestamp;
        }
        return parsed;
      });

      // Transform raw event envelopes into clean page format (crawled URLs)
      // Use a Set to deduplicate URLs
      const seenUrls = new Set<string>();
      const links = pagesRaw
        .map((entry) => {
          const parsed = this.parseLinkEntry(entry);
          if (parsed.timestamp > maxTimestamp) {
            maxTimestamp = parsed.timestamp;
          }
          return parsed;
        })
        .filter((link): link is { url: string; timestamp: number } => {
          // Deduplicate by URL
          if (!link.url || seenUrls.has(link.url)) return false;
          seenUrls.add(link.url);
          return true;
        });

      // snapshotAt is the max timestamp of all events, or Date.now() if no events
      // This ensures socket events with timestamp <= snapshotAt are correctly filtered
      const snapshotAt = maxTimestamp > 0 ? maxTimestamp : Date.now();

      // Convert startedAt to epoch ms for consistent frontend handling
      let startedAtMs: number | undefined = undefined;
      if (startedAt) {
        const parsed = new Date(startedAt).getTime();
        if (!isNaN(parsed)) {
          startedAtMs = parsed;
        }
      }

      const pagesCrawled = pagesCountRaw ? parseInt(pagesCountRaw, 10) : undefined;

      return {
        jobId,
        status: status || legacyStatus || 'pending',
        logs,
        links,
        completed: !!completed,
        startedAt: startedAtMs,
        snapshotAt,
        projectId,
        sessionId,
        pagesCrawled,
        steps: stepsRaw && Object.keys(stepsRaw).length > 0 ? stepsRaw : undefined,
      };
    } catch (error) {
      logger.error(`Error getting snapshot for ${jobId}:`, error);
      throw error;
    }
  }
  
  // Keep for backward compatibility if needed, but alias to getSnapshot logic or remove
  static async getJobState(jobId: string) {
      const snap = await this.getSnapshot(jobId);
      return {
          status: snap.status,
          events: [...snap.logs, ...snap.links].sort((a,b) => a.timestamp - b.timestamp)
      };
  }

  /**
   * Set a cancellation flag in Redis so the Python worker can detect it
   */
  static async setCancelFlag(jobId: string): Promise<void> {
    const redis = getRedisClient();
    try {
      await redis.set(`job:${jobId}:cancelled`, 'true');
      await redis.expire(`job:${jobId}:cancelled`, REDIS_TTL);
      logger.info(`🛑 Cancel flag set for job ${jobId}`);
    } catch (error) {
      logger.warn(`Failed to set cancel flag for job ${jobId}:`, error);
    }
  }

  /**
   * Delete all Redis keys associated with a job
   */
  static async cleanupJob(jobId: string): Promise<void> {
    const redis = getRedisClient();
    const keys = [
      `job:${jobId}:status`,
      `job:${jobId}:logs`,
      `job:${jobId}:links`,
      `job:${jobId}:completed`,
      `job:${jobId}:startedAt`,
      `job:${jobId}:meta`,
      `job:${jobId}:pages`,
      `job:${jobId}:pages_count`,
      `job:${jobId}:steps`,
      `job:${jobId}:cancelled`,
    ];
    try {
      await redis.del(...keys);
      logger.info(`🧹 Redis cleanup done for job ${jobId}`);
    } catch (error) {
      logger.warn(`Redis cleanup error for job ${jobId}:`, error);
    }
  }

  /**
   * Delete Redis hash for a session
   */
  static async cleanupSession(sessionId: string): Promise<void> {
    const redis = getRedisClient();
    try {
      await redis.del(`session:${sessionId}`);
      logger.info(`🧹 Redis cleanup done for session ${sessionId}`);
    } catch (error) {
      logger.warn(`Redis cleanup error for session ${sessionId}:`, error);
    }
  }
}
