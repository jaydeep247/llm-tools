import amqp from 'amqplib';
import { env } from './env';
import { logger } from '../shared/logger/logger';

let connection: any | null = null;
let channel: any | null = null;

const EXCHANGE_NAME = 'crawl.exchange';
const QUEUE_NAME = 'crawl.queue';
const ROUTING_KEY_CRAWL_START = 'crawl.start';
const DLX_NAME = 'crawl.dlx';
const DLQ_NAME = 'crawl.dlq';
const ROUTING_KEY_CRAWL_FAILED = 'crawl.failed';

export const getRabbitChannel = async (): Promise<any> => {
  if (channel) return channel;

  try {
    connection = await amqp.connect(env.RABBITMQ_URL);
    channel = await connection.createChannel();

    channel.on('error', (err: any) => {
      logger.error(`RabbitMQ channel error: ${err?.message || String(err)}`);
      channel = null;
    });

    await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      deadLetterExchange: DLX_NAME,
    });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY_CRAWL_START);

    await channel.assertExchange(DLX_NAME, 'direct', { durable: true });
    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.bindQueue(DLQ_NAME, DLX_NAME, ROUTING_KEY_CRAWL_FAILED);

    logger.info('✅ Connected to RabbitMQ and ensured crawl.exchange / crawl.queue (with DLQ)');

    connection.on('error', (err: any) => {
      logger.error(`RabbitMQ connection error: ${err?.message || String(err)}`);
      connection = null;
      channel = null;
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      connection = null;
      channel = null;
    });

    return channel;
  } catch (error: any) {
    logger.error(`❌ Failed to connect to RabbitMQ: ${error.message}`);
    throw error;
  }
};

export const RABBITMQ_CONSTANTS = {
  EXCHANGE_NAME,
  QUEUE_NAME,
  ROUTING_KEY_CRAWL_START,
  DLX_NAME,
  DLQ_NAME,
  ROUTING_KEY_CRAWL_FAILED,
};
