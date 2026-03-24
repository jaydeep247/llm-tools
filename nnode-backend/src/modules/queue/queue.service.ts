import { getRabbitChannel } from '../../config/rabbitmq';
import {
  QUEUE_CONFIG_BY_CATEGORY,
  QueueConfig,
} from './queue.constants';
import { 
  CrawlJobPayload, 
  CrawlResumeJobPayload,
  SchemaJobPayload, 
  ContentMetricsJobPayload, 
  AnalysisJobPayload,
  ModuleCJobPayload,
  ModuleDJobPayload,
  ModuleEJobPayload,
  ModuleFJobPayload,
  ModuleAJobPayload,
  AnyJobPayload,
} from './queue.types';
import { JobType, JobCategory, JOB_TYPE_TO_CATEGORY } from '../job/job.types';
import { logger } from '../../shared/logger/logger';

export class QueueService {
  /**
   * Generic job publisher - routes to correct queue based on job type
   */
  private async publishToQueue(payload: AnyJobPayload, category: JobCategory): Promise<void> {
    const channel = await getRabbitChannel();
    const config: QueueConfig = QUEUE_CONFIG_BY_CATEGORY[category];
    
    const body = Buffer.from(JSON.stringify(payload));

    channel.publish(config.exchange, config.routingKey, body, {
      persistent: true,
      contentType: 'application/json',
      headers: {
        'x-job-type': payload.jobType,
        'x-job-category': category,
      },
    });

    logger.info(
      `[${category}] Enqueued job ${payload.jobId} type=${payload.jobType} url=${payload.url}`
    );
  }

  /**
   * Publish job with automatic routing based on jobType
   */
  async publishJob(payload: AnyJobPayload): Promise<void> {
    const category = JOB_TYPE_TO_CATEGORY[payload.jobType];
    if (!category) {
      throw new Error(`Unknown job type: ${payload.jobType}`);
    }
    await this.publishToQueue(payload, category);
  }

  // ============ CRAWLER JOBS ============
  async publishCrawlJob(payload: CrawlJobPayload): Promise<void> {
    await this.publishToQueue(
      { ...payload, jobType: JobType.CRAWL },
      JobCategory.CRAWLER
    );
  }

  async publishCrawlResumeJob(payload: CrawlResumeJobPayload): Promise<void> {
    await this.publishToQueue(
      { ...payload, jobType: JobType.CRAWL_RESUME },
      JobCategory.CRAWLER
    );
  }

  // ============ SCHEMA JOBS (Module B) ============
  async publishSchemaJob(payload: SchemaJobPayload): Promise<void> {
    await this.publishToQueue(
      { ...payload, jobType: JobType.SCHEMA },
      JobCategory.SCHEMA
    );
  }

  // ============ MODULE D JOBS (Content Analysis) ============
  async publishContentMetricsJob(payload: ContentMetricsJobPayload): Promise<void> {
    await this.publishToQueue(
      { ...payload, jobType: JobType.MODULE_D },
      JobCategory.MODULE_D
    );
  }

  async publishModuleDJob(payload: ModuleDJobPayload): Promise<void> {
    await this.publishToQueue(payload, JobCategory.MODULE_D);
  }

  // ============ MODULE C JOBS (AEO Analysis) ============
  async publishModuleCJob(payload: ModuleCJobPayload): Promise<void> {
    await this.publishToQueue(payload, JobCategory.MODULE_C);
  }

  async publishAnalysisJob(payload: AnalysisJobPayload): Promise<void> {
    // Determine correct category based on modules requested
    const modules = payload.modules || [];
    let category = JobCategory.MODULE_C; // Default to Module C
    
    if (modules.some(m => m.startsWith('module_e'))) {
      category = JobCategory.MODULE_E;
    } else if (modules.some(m => m.startsWith('module_d'))) {
      category = JobCategory.MODULE_D;
    }

    await this.publishToQueue(
      { ...payload, jobType: payload.jobType || JobType.AEO_ANALYSIS },
      category
    );
  }

  // ============ MODULE E JOBS (Brand Intelligence) ============
  async publishModuleEJob(payload: ModuleEJobPayload): Promise<void> {
    await this.publishToQueue(payload, JobCategory.MODULE_E);
  }

  async publishModuleEConsistencyJob(payload: ModuleEJobPayload): Promise<void> {
    await this.publishToQueue(
      { ...payload, jobType: JobType.MODULE_E_CONSISTENCY, subModule: 'consistency' },
      JobCategory.MODULE_E
    );
  }

  async publishModuleESentimentJob(payload: ModuleEJobPayload): Promise<void> {
    await this.publishToQueue(
      { ...payload, jobType: JobType.MODULE_E_SENTIMENT, subModule: 'sentiment' },
      JobCategory.MODULE_E
    );
  }

  async publishModuleECompetitorsJob(payload: ModuleEJobPayload): Promise<void> {
    await this.publishToQueue(
      { ...payload, jobType: JobType.MODULE_E_COMPETITORS, subModule: 'competitors' },
      JobCategory.MODULE_E
    );
  }

  async publishModuleEAiSovJob(payload: ModuleEJobPayload): Promise<void> {
    await this.publishToQueue(
      { ...payload, jobType: JobType.MODULE_E_AI_SOV, subModule: 'ai_sov' },
      JobCategory.MODULE_E
    );
  }

  async publishModuleERankingJob(payload: ModuleEJobPayload): Promise<void> {
    await this.publishToQueue(
      { ...payload, jobType: JobType.MODULE_E_RANKING, subModule: 'ranking' },
      JobCategory.MODULE_E
    );
  }

  async publishModuleEBrandJob(payload: ModuleEJobPayload): Promise<void> {
    await this.publishToQueue(
      { ...payload, jobType: JobType.MODULE_E_BRAND, subModule: 'brand' },
      JobCategory.MODULE_E
    );
  }

  // ============ MODULE F JOBS (Competitor AI Intelligence) ============
  async publishModuleFJob(payload: ModuleFJobPayload): Promise<void> {
    await this.publishToQueue(payload, JobCategory.MODULE_F);
  }

  // ============ MODULE A JOBS (SERP Analyzer) ============
  async publishModuleAJob(payload: ModuleAJobPayload): Promise<void> {
    await this.publishToQueue(payload, JobCategory.MODULE_A);
  }
}

