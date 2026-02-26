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
}

const REDIS_TTL = 3600 * 24; // 24 hours
const MAX_LOGS = 1000;
const MAX_LINKS = 1000;

export class LiveJobService {
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
             }
        }
      }

      // 2. Append Logs (Only meaningful progress events - NOT link_found)
      // Filter to: log, JOB_STARTED, JOB_COMPLETED, JOB_FAILED, page_crawled
      const logEventTypes = ['log', 'JOB_STARTED', 'JOB_COMPLETED', 'JOB_FAILED', 'page_crawled'];
      if (logEventTypes.includes(eventType)) {
          pipeline.rpush(logsKey, JSON.stringify(event));
          pipeline.ltrim(logsKey, -MAX_LOGS, -1);
          pipeline.expire(logsKey, REDIS_TTL);
      }

      // 3. Append Pages (completed crawled pages - for progress count)
      // This is separate from links discovered
      const pagesKey = `job:${jobId}:pages`;
      const pagesCountKey = `job:${jobId}:pages_count`;
      if (eventType === 'page_crawled') {
          pipeline.rpush(pagesKey, JSON.stringify(event));
          pipeline.ltrim(pagesKey, -MAX_LINKS, -1);
          pipeline.expire(pagesKey, REDIS_TTL);
          // Increment the real-time counter
          pipeline.incr(pagesCountKey);
          pipeline.expire(pagesCountKey, REDIS_TTL);
      }

      // 4. Append Links (discovered URLs - kept for legacy/reference but not shown in UI count)
      // IMPORTANT: Match ALL possible event type formats:
      // - 'link_found' (lowercase with underscore) - actual spider
      // - 'LINK_FOUND' (uppercase) - test producer
      // - 'link' (just link)
      const linkEventTypes = ['link_found', 'LINK_FOUND', 'link'];
      if (linkEventTypes.includes(eventType) || eventType.toLowerCase().includes('link')) {
          pipeline.rpush(linksKey, JSON.stringify(event));
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
  static async getSnapshot(jobId: string): Promise<JobSnapshot> {
    const redis = getRedisClient();
    
    const statusKey = `job:${jobId}:status`;
    const logsKey = `job:${jobId}:logs`;
    const pagesKey = `job:${jobId}:pages`;  // Crawled pages (for progress count)
    const completedKey = `job:${jobId}:completed`;
    const startedAtKey = `job:${jobId}:startedAt`;
    const metaKey = `job:${jobId}:meta`;
    const pagesCountKey = `job:${jobId}:pages_count`;

    try {
      // Execute in parallel
      const [status, logsRaw, pagesRaw, completed, startedAt, metaRaw, pagesCountRaw] = await Promise.all([
        redis.get(statusKey),
        redis.lrange(logsKey, 0, -1),
        redis.lrange(pagesKey, 0, -1),  // Get crawled pages instead of discovered links
        redis.get(completedKey),
        redis.get(startedAtKey),
        redis.get(metaKey),
        redis.get(pagesCountKey)
      ]);

      logger.info(`📸 LiveJobService.getSnapshot(${jobId}): status=${status}, completed=${completed}, startedAt=${startedAt}, pages=${pagesRaw.length}`);

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
      
      const logs = logsRaw.map(l => {
        try {
          const event = JSON.parse(l);
          // Events are stored as { jobId, eventType, payload, timestamp }
          // Extract actual message from payload or event itself
          const message = event.payload?.message 
            || event.message 
            || (typeof event.payload === 'string' ? event.payload : null)
            || event.eventType
            || JSON.stringify(event);
          const ts = event.timestamp || 0;
          if (ts > maxTimestamp) maxTimestamp = ts;
          return {
            message,
            timestamp: ts || Date.now()
          };
        } catch (e) {
          return { message: l, timestamp: Date.now() };
        }
      });

      // Transform raw event envelopes into clean page format (crawled URLs)
      // Use a Set to deduplicate URLs
      const seenUrls = new Set<string>();
      const links = pagesRaw
        .map(l => {
          try {
            const event = JSON.parse(l);
            // Events are stored as { jobId, eventType, payload: { url, ... }, timestamp }
            const url = event.payload?.url 
              || event.url 
              || (typeof event.payload === 'string' ? event.payload : null);
            const ts = event.timestamp || 0;
            if (ts > maxTimestamp) maxTimestamp = ts;
            return {
              url,
              timestamp: ts || Date.now()
            };
          } catch (e) {
            return { url: l, timestamp: Date.now() };
          }
        })
        .filter(link => {
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
        status: status || 'pending',
        logs,
        links,
        completed: !!completed,
        startedAt: startedAtMs,
        snapshotAt,
        projectId,
        sessionId,
        pagesCrawled
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
}
