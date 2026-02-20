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
  logs: any[];
  links: any[];
  completed: boolean;
  snapshotAt: number;
  startedAt?: string | number;
}

const REDIS_TTL = 3600 * 24; // 24 hours
const MAX_LOGS = 1000;
const MAX_LINKS = 1000;

export class LiveJobService {
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
             // Save startedAt
             const startedAt = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
             pipeline.set(`job:${jobId}:startedAt`, startedAt);
             pipeline.expire(`job:${jobId}:startedAt`, REDIS_TTL);
        }
        
        if (eventType === 'JOB_COMPLETED' || eventType === 'JOB_FAILED' || status === 'completed' || status === 'failed') {
             pipeline.set(completedKey, 'true');
             pipeline.expire(completedKey, REDIS_TTL);
        }
      }

      // 2. Append Logs (Generic events or specific log events)
      // We treat most events as logs for the stream, but specifically look for 'log' or 'progress'
      if (['log', 'info', 'error', 'PROGRESS_UPDATE', 'JOB_STARTED', 'JOB_COMPLETED', 'JOB_FAILED'].includes(eventType) || eventType.includes('log')) {
          pipeline.rpush(logsKey, JSON.stringify(event));
          pipeline.ltrim(logsKey, -MAX_LOGS, -1);
          pipeline.expire(logsKey, REDIS_TTL);
      }

      // 3. Append Links
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

      await pipeline.exec();
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
    const linksKey = `job:${jobId}:links`;
    const completedKey = `job:${jobId}:completed`;
    const startedAtKey = `job:${jobId}:startedAt`;

    try {
      // Execute in parallel
      const [status, logsRaw, linksRaw, completed, startedAt] = await Promise.all([
        redis.get(statusKey),
        redis.lrange(logsKey, 0, -1),
        redis.lrange(linksKey, 0, -1),
        redis.get(completedKey),
        redis.get(startedAtKey)
      ]);

      // Transform raw event envelopes into clean log format
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
          return {
            message,
            timestamp: event.timestamp || Date.now()
          };
        } catch (e) {
          return { message: l, timestamp: Date.now() };
        }
      });

      // Transform raw event envelopes into clean link format
      // Use a Set to deduplicate URLs
      const seenUrls = new Set<string>();
      const links = linksRaw
        .map(l => {
          try {
            const event = JSON.parse(l);
            // Events are stored as { jobId, eventType, payload: { url, ... }, timestamp }
            const url = event.payload?.url 
              || event.url 
              || (typeof event.payload === 'string' ? event.payload : null);
            return {
              url,
              timestamp: event.timestamp || Date.now()
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

      return {
        jobId,
        status: status || 'pending',
        logs,
        links,
        completed: completed === 'true',
        startedAt: startedAt || undefined,
        snapshotAt: Date.now()
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
