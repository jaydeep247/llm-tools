import amqp, { ConsumeMessage } from 'amqplib';
import { env } from '../config/env';
import { logger } from '../shared/logger/logger';
import { LiveJobService, JobEvent } from '../services/live-job.service';
import { getIo } from '../socket';

const EXCHANGE_NAME = 'job.events';
const QUEUE_NAME = 'job.events.queue';
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

    logger.info(`✅ Job Events Consumer connected to ${EXCHANGE_NAME}`);

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

        // 2. Buffer for WebSocket Broadcast
        const jobId = event.jobId;
        if (!eventBuffers.has(jobId)) {
          eventBuffers.set(jobId, []);
          // Schedule flush
          const timer = setTimeout(() => flushBuffer(jobId), BATCH_INTERVAL_MS);
          flushTimers.set(jobId, timer);
        }
        
        eventBuffers.get(jobId)?.push(event);

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
