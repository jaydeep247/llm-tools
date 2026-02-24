import amqp from 'amqplib';
import { env } from './env';
import { logger } from '../shared/logger/logger';

let connection: any | null = null;
let channel: any | null = null;

// Legacy constants (backward compatibility)
const EXCHANGE_NAME = 'crawl.exchange';
const QUEUE_NAME = 'crawl.queue';
const ROUTING_KEY_CRAWL_START = 'crawl.start';
const DLX_NAME = 'crawl.dlx';
const DLQ_NAME = 'crawl.dlq';
const ROUTING_KEY_CRAWL_FAILED = 'crawl.failed';

/**
 * Queue configuration for isolated job processing
 */
interface QueueSetup {
  exchange: string;
  queue: string;
  routingKey: string;
  dlx: string;
  dlq: string;
}

const QUEUE_CONFIGS: QueueSetup[] = [
  // Crawler Module
  {
    exchange: 'crawler.exchange',
    queue: 'crawler.queue',
    routingKey: 'crawler.job',
    dlx: 'crawler.dlx',
    dlq: 'crawler.dlq',
  },
  // Schema Module (Module B)
  {
    exchange: 'schema.exchange',
    queue: 'schema.queue',
    routingKey: 'schema.job',
    dlx: 'schema.dlx',
    dlq: 'schema.dlq',
  },
  // Module C (AEO Analysis)
  {
    exchange: 'module_c.exchange',
    queue: 'module_c.queue',
    routingKey: 'module_c.job',
    dlx: 'module_c.dlx',
    dlq: 'module_c.dlq',
  },
  // Module D (Content Analysis)
  {
    exchange: 'module_d.exchange',
    queue: 'module_d.queue',
    routingKey: 'module_d.job',
    dlx: 'module_d.dlx',
    dlq: 'module_d.dlq',
  },
  // Module E (Brand Intelligence)
  {
    exchange: 'module_e.exchange',
    queue: 'module_e.queue',
    routingKey: 'module_e.job',
    dlx: 'module_e.dlx',
    dlq: 'module_e.dlq',
  },
];

export const getRabbitChannel = async (): Promise<any> => {
  if (channel) return channel;

  try {
    connection = await amqp.connect(env.RABBITMQ_URL);
    channel = await connection.createChannel();

    channel.on('error', (err: any) => {
      logger.error(`RabbitMQ channel error: ${err?.message || String(err)}`);
      channel = null;
    });

    // Setup all isolated queues
    for (const config of QUEUE_CONFIGS) {
      // Main exchange and queue
      await channel.assertExchange(config.exchange, 'direct', { durable: true });
      await channel.assertQueue(config.queue, {
        durable: true,
        deadLetterExchange: config.dlx,
      });
      await channel.bindQueue(config.queue, config.exchange, config.routingKey);

      // DLX and DLQ
      await channel.assertExchange(config.dlx, 'direct', { durable: true });
      await channel.assertQueue(config.dlq, { durable: true });
      await channel.bindQueue(config.dlq, config.dlx, `${config.routingKey}.failed`);

      logger.info(`✅ Setup queue: ${config.queue} (exchange: ${config.exchange})`);
    }

    // Legacy queues (backward compatibility)
    await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      deadLetterExchange: DLX_NAME,
    });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY_CRAWL_START);

    await channel.assertExchange(DLX_NAME, 'direct', { durable: true });
    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.bindQueue(DLQ_NAME, DLX_NAME, ROUTING_KEY_CRAWL_FAILED);

    // Legacy analysis queue
    await channel.assertExchange('analysis.exchange', 'direct', { durable: true });
    await channel.assertQueue('analysis.queue', { durable: true });
    await channel.bindQueue('analysis.queue', 'analysis.exchange', 'analysis.start');

    logger.info('✅ Connected to RabbitMQ - All isolated queues configured');

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
  QUEUE_CONFIGS,
};

