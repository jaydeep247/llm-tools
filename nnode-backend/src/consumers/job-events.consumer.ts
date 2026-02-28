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
             const job = await jobService.markRunning(event.jobId);
             if (!job) logger.error(`❌ Failed to mark job ${event.jobId} as RUNNING - Job not found`);
             
             // Emit direct socket event for start
             try {
                 const io = getIo();
                 io.to(`job:${event.jobId}`).emit('job:started', event);
             } catch (e) { logger.error('Socket emit error:', e); }

          } else if (event.eventType === 'JOB_COMPLETED' || (event.payload && event.payload.status === 'completed')) {
             // Update Job Status
             try {
                 const job = await jobService.markCompleted(event.jobId);
                 if (!job) logger.error(`❌ DB Update Failed: Job ${event.jobId} not found`);
             } catch (e) {
                 logger.error(`❌ DB Update Exception for ${event.jobId}:`, e);
             }

             // Update Session Status
             if (event.payload && event.payload.sessionId) {
                 try {
                     await sessionService.markSessionCompleted(event.payload.sessionId);
                 } catch (e) {
                     logger.error(`❌ Session Update Exception:`, e);
                 }
             }
             
             // Emit Direct Socket Event (Critical for UI)
             try {
                 const io = getIo();
                 io.to(`job:${event.jobId}`).emit('job:completed', {
                     jobId: event.jobId,
                     status: 'completed',
                     completedAt: new Date().toISOString(),
                     payload: event.payload
                 });
             } catch (e) {
                 logger.error(`❌ Socket emit error:`, e);
             }

             // Flush Buffer immediately
             const existingTimer = flushTimers.get(event.jobId);
             if (existingTimer) clearTimeout(existingTimer);
             
             // Add to buffer for batch consistency
             if (!eventBuffers.has(event.jobId)) eventBuffers.set(event.jobId, []);
             eventBuffers.get(event.jobId)?.push(event);
             
             flushBuffer(event.jobId);
             
          } else if (event.eventType === 'JOB_FAILED' || (event.payload && event.payload.status === 'failed')) {
              const reason = event.payload?.reason || event.payload?.message || 'Unknown error';
              await jobService.markFailed(event.jobId, reason);

              if (event.payload && event.payload.sessionId) {
                  await sessionService.markSessionFailed(event.payload.sessionId);
              }
              
              // Emit Direct Socket Event
              try {
                 const io = getIo();
                 io.to(`job:${event.jobId}`).emit('job:failed', {
                     jobId: event.jobId,
                     status: 'failed',
                     error: reason,
                     payload: event.payload
                 });
              } catch (e) { logger.error('Socket emit error:', e); }

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

        // 3. Buffer for WebSocket Broadcast (for non-terminal events)
        const jobId = event.jobId;
        
        // Skip adding terminal events here as they are handled above
        const isTerminal = ['JOB_COMPLETED', 'JOB_FAILED'].includes(event.eventType) || 
                          (event.payload && ['completed', 'failed'].includes(event.payload.status));
                          
        if (!isTerminal) {
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
