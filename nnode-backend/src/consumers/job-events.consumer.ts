import amqp, { ConsumeMessage } from 'amqplib';
import { env } from '../config/env';
import { logger } from '../shared/logger/logger';
import { LiveJobService, JobEvent } from '../services/live-job.service';
import { JobService } from '../modules/job/job.service';
import { SessionService } from '../modules/session/session.service';
import { getIo } from '../socket';

const EXCHANGE_NAME = 'job.events';
const QUEUE_NAME = 'job.events.queue.v3'; // Bump version to force fresh queue binding
const ROUTING_KEY_PATTERN = 'job.#';
const BATCH_INTERVAL_MS = 500;
const PREFETCH_COUNT = 50;

const NON_BATCHED_EVENT_TYPES = new Set([
  'page_crawled',
  'CRAWL_STATUS_UPDATED',
  'CRAWL_PAUSED',
  'CONTENT_AUDIT_COMPLETED',
  'CONTENT_AUDIT_FAILED',
]);

// Buffer for batching events: jobId -> events[]
const eventBuffers = new Map<string, JobEvent[]>();
const flushTimers = new Map<string, NodeJS.Timeout>();

const flushBuffer = (jobId: string) => {
  const events = eventBuffers.get(jobId);
  if (!events || events.length === 0) return;

  // Clear buffer and timer
  eventBuffers.delete(jobId);
  flushTimers.delete(jobId);

  try {
    const io = getIo();
    // Emit batch event to reduce network overhead
    io.to(`job:${jobId}`).emit('job:batch', events);
  } catch (socketError) {
    logger.warn('Socket.io error during broadcast:', socketError);
  }
};

const jobService = new JobService();
const sessionService = new SessionService();

export const startJobEventsConsumer = async () => {
  try {
    const connection = await amqp.connect(env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Assert Topic Exchange
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

    // Assert Queue
    await channel.assertQueue(QUEUE_NAME, { 
      durable: true,
      messageTtl: 1000 * 60 * 60 * 24 // 24 hours TTL
    });

    // Bind Queue
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY_PATTERN);
    await channel.prefetch(PREFETCH_COUNT);

    logger.info(`✅ Job Events Consumer connected to ${EXCHANGE_NAME} (Queue: ${QUEUE_NAME})`);

    // Consume
    await channel.consume(QUEUE_NAME, async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      try {
        const content = msg.content.toString();
        const event: JobEvent = JSON.parse(content);
        
        // Validate event structure
        if (!event.jobId || !event.eventType) {
          logger.warn('Invalid event format received:', content);
          channel.ack(msg);
          return;
        }

        // 1. Save to Redis (Immediate persistence)
        await LiveJobService.saveEvent(event);

        // 2. Update MongoDB Status for critical events
        try {
          if (event.eventType === 'JOB_STARTED') {
           const jobPromise = jobService.markRunning(event.jobId);
             
             // Emit direct socket event for start
           const socketPromise = (async () => {
                 const io = getIo();
                 io.to(`job:${event.jobId}`).emit('job:started', event);
           })();

           const [jobResult] = await Promise.allSettled([jobPromise, socketPromise]);
           if (jobResult.status === 'fulfilled' && !jobResult.value) {
             logger.error(`❌ Failed to mark job ${event.jobId} as RUNNING - Job not found`);
           }

          } else if (event.eventType === 'JOB_COMPLETED' || (event.payload && event.payload.status === 'completed')) {
           const sessionId = event.payload?.sessionId;
           const jobPromise = jobService.markCompleted(event.jobId);
           const sessionPromise = sessionId
             ? sessionService.markSessionCompleted(sessionId)
             : Promise.resolve();
           if (!sessionId) {
             logger.warn(`⚠️  JOB_COMPLETED for ${event.jobId} missing sessionId — session not updated`);
           }
             
           const socketPromise = (async () => {
                 const io = getIo();
                 io.to(`job:${event.jobId}`).emit('job:completed', {
                     jobId: event.jobId,
                     status: 'completed',
                     completedAt: new Date().toISOString(),
                     payload: event.payload
                 });
           })();

           await Promise.allSettled([jobPromise, sessionPromise, socketPromise]);

             // Flush Buffer immediately
             const existingTimer = flushTimers.get(event.jobId);
             if (existingTimer) clearTimeout(existingTimer);
             
             // Add to buffer for batch consistency
             if (!eventBuffers.has(event.jobId)) eventBuffers.set(event.jobId, []);
             eventBuffers.get(event.jobId)?.push(event);
             
             flushBuffer(event.jobId);
             
          } else if (event.eventType === 'JOB_FAILED' || (event.payload && event.payload.status === 'failed')) {
              const reason = event.payload?.reason || event.payload?.message || 'Unknown error';
              const sessionId = event.payload?.sessionId;
              const jobPromise = jobService.markFailed(event.jobId, reason);
              const sessionPromise = sessionId
                ? sessionService.markSessionFailed(sessionId)
                : Promise.resolve();
              if (!sessionId) {
                logger.warn(`⚠️  JOB_FAILED for ${event.jobId} missing sessionId — session not updated`);
              }
              
              // Emit Direct Socket Event
              const socketPromise = (async () => {
                 const io = getIo();
                 io.to(`job:${event.jobId}`).emit('job:failed', {
                     jobId: event.jobId,
                     status: 'failed',
                     error: reason,
                     payload: event.payload
                 });
              })();

              await Promise.allSettled([jobPromise, sessionPromise, socketPromise]);

              // Flush Buffer
              const existingTimer = flushTimers.get(event.jobId);
              if (existingTimer) clearTimeout(existingTimer);
              
              if (!eventBuffers.has(event.jobId)) eventBuffers.set(event.jobId, []);
              eventBuffers.get(event.jobId)?.push(event);
              
              flushBuffer(event.jobId);
          }
        } catch (dbError) {
           logger.error(`Failed to update DB status for job ${event.jobId}:`, dbError);
        }

        // 2b. page_crawled — push crawl:progress directly to socket.
        // pages_count is already persisted in LiveJobService.saveEvent().
        if (event.eventType === 'page_crawled' && event.payload?.pages_crawled !== undefined) {
          const pagesCrawled = Number(event.payload.pages_crawled);
          try {
            const io = getIo();
            io.to(`job:${event.jobId}`).emit('crawl:progress', {
              jobId: event.jobId,
              pages_crawled: pagesCrawled,
              url: event.payload?.url,
              title: event.payload?.title,
              crawled_at: event.payload?.crawled_at,
            });
          } catch (e) { logger.error('Socket emit error (crawl:progress):', e); }
        }

        // 2c. Crawl status live update — emit immediately so the UI reflects
        //     the crawl_status change without waiting for the batch flush.
        if (event.eventType === 'CRAWL_STATUS_UPDATED') {
          try {
            const io = getIo();
            io.to(`job:${event.jobId}`).emit('crawl:status', {
              jobId: event.jobId,
              crawl_status: event.payload?.crawl_status,
              updatedAt: event.payload?.updatedAt,
            });
          } catch (e) { logger.error('Socket emit error (crawl:status):', e); }
        }

        // 2d. CRAWL_PAUSED — spider hit page limit, emit socket status immediately.
        if (event.eventType === 'CRAWL_PAUSED') {
          try {
            const io = getIo();
            io.to(`job:${event.jobId}`).emit('crawl:status', {
              jobId: event.jobId,
              crawl_status: 'paused',
              updatedAt: new Date().toISOString(),
            });
          } catch (e) { logger.error('Socket emit error (crawl:paused):', e); }
        }

        // 2e. Content audit metric completed — push immediately so frontend
        //     can invalidate RTK Query cache and stop loading spinners.
        if (event.eventType === 'CONTENT_AUDIT_COMPLETED' || event.eventType === 'CONTENT_AUDIT_FAILED') {
          try {
            const io = getIo();
            io.to(`job:${event.jobId}`).emit('content-audit:completed', {
              jobId: event.jobId,
              metric: event.payload?.metric,
              status: event.eventType === 'CONTENT_AUDIT_COMPLETED' ? 'completed' : 'failed',
              run_at: event.payload?.run_at,
              urls_processed: event.payload?.urls_processed,
              updated_count: event.payload?.updated_count,
              error: event.payload?.error,
            });
          } catch (e) { logger.error('Socket emit error (content-audit:completed):', e); }
        }

        // 3. Buffer for WebSocket Broadcast (for non-terminal events)
        const jobId = event.jobId;
        
        // Skip adding terminal events here as they are handled above
        const isTerminal = ['JOB_COMPLETED', 'JOB_FAILED'].includes(event.eventType) || 
                          (event.payload && ['completed', 'failed'].includes(event.payload.status));
        const isNonBatched = NON_BATCHED_EVENT_TYPES.has(event.eventType);
                          
        if (!isTerminal && !isNonBatched) {
            if (!eventBuffers.has(jobId)) {
              eventBuffers.set(jobId, []);
              // Schedule flush
              const timer = setTimeout(() => flushBuffer(jobId), BATCH_INTERVAL_MS);
              flushTimers.set(jobId, timer);
            }
            
            eventBuffers.get(jobId)?.push(event);
        }

        channel.ack(msg);
      } catch (error) {
        logger.error('Error processing job event:', error);
        channel.nack(msg, false, false); 
      }
    });

    // Handle connection close
    connection.on('close', () => {
      logger.error('Job Events RabbitMQ connection closed. Reconnecting...');
      setTimeout(startJobEventsConsumer, 5000);
    });

    connection.on('error', (err: any) => {
      logger.error('Job Events RabbitMQ connection error:', err);
    });

  } catch (error) {
    logger.error('Failed to start Job Events Consumer:', error);
    setTimeout(startJobEventsConsumer, 5000);
  }
};
