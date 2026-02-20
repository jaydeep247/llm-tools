import { getRabbitChannel } from '../../config/rabbitmq';
import {
  QUEUE_EXCHANGE_CRAWL,
  ROUTING_KEY_CRAWL_START,
  QUEUE_EXCHANGE_ANALYSIS,
  ROUTING_KEY_ANALYSIS_START,
} from './queue.constants';
import { CrawlJobPayload, AnalysisJobPayload } from './queue.types';
import { logger } from '../../shared/logger/logger';

export class QueueService {
  async publishCrawlJob(payload: CrawlJobPayload): Promise<void> {
    const channel = await getRabbitChannel();
    const body = Buffer.from(JSON.stringify({ jobType: 'CRAWL', ...payload }));

    channel.publish(QUEUE_EXCHANGE_CRAWL, ROUTING_KEY_CRAWL_START, body, {
      persistent: true,
      contentType: 'application/json',
    });

    logger.info(
      `Enqueued crawl job ${payload.jobId} for session ${payload.sessionId} url=${payload.url}`
    );
  }

  async publishSchemaJob(payload: SchemaJobPayload): Promise<void> {
    const channel = await getRabbitChannel();
    const body = Buffer.from(JSON.stringify({ jobType: 'SCHEMA', ...payload }));

    channel.publish(QUEUE_EXCHANGE_CRAWL, ROUTING_KEY_CRAWL_START, body, {
      persistent: true,
      contentType: 'application/json',
    });

    logger.info(
      `Enqueued schema job ${payload.jobId} for session ${payload.sessionId} url=${payload.url}`
    );
  }

  async publishContentMetricsJob(payload: ContentMetricsJobPayload): Promise<void> {
    const channel = await getRabbitChannel();
    const body = Buffer.from(JSON.stringify({ jobType: 'CONTENT_METRICS', ...payload }));

    channel.publish(QUEUE_EXCHANGE_CRAWL, ROUTING_KEY_CRAWL_START, body, {
      persistent: true,
      contentType: 'application/json',
    });

    logger.info(
      `Enqueued content metrics job ${payload.jobId} for session ${payload.sessionId} url=${payload.url}`
    );
  }

  async publishAnalysisJob(payload: AnalysisJobPayload): Promise<void> {
    const channel = await getRabbitChannel();
    const body = Buffer.from(JSON.stringify(payload));

    channel.publish(QUEUE_EXCHANGE_ANALYSIS, ROUTING_KEY_ANALYSIS_START, body, {
      persistent: true,
      contentType: 'application/json',
    });

    logger.info(
      `Enqueued analysis job ${payload.jobId} for session ${payload.sessionId} url=${payload.url} modules=${payload.modules}`
    );
  }
}
