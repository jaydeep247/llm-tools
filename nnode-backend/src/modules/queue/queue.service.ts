import { getRabbitChannel } from '../../config/rabbitmq';
import { QUEUE_EXCHANGE_CRAWL, ROUTING_KEY_CRAWL_START } from './queue.constants';
import { CrawlJobPayload } from './queue.types';
import { logger } from '../../shared/logger/logger';

export class QueueService {
  async publishCrawlJob(payload: CrawlJobPayload): Promise<void> {
    const channel = await getRabbitChannel();
    const body = Buffer.from(JSON.stringify(payload));

    channel.publish(QUEUE_EXCHANGE_CRAWL, ROUTING_KEY_CRAWL_START, body, {
      persistent: true,
      contentType: 'application/json',
    });

    logger.info(
      `Enqueued crawl job ${payload.jobId} for session ${payload.sessionId} url=${payload.url}`
    );
  }
}
