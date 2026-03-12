export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Granular Job Types for isolated queue processing
 * Each job type runs independently without affecting others
 */
export enum JobType {
  // Crawler Module
  CRAWL = 'CRAWL',
  CRAWL_RESUME = 'CRAWL_RESUME',
  
  // Schema Module (Module B)
  SCHEMA = 'SCHEMA',
  
  // Content Metrics (Module D)
  CONTENT_METRICS = 'CONTENT_METRICS',
  MODULE_D = 'MODULE_D',
  MODULE_D_ENTITY_ANALYSIS = 'MODULE_D_ENTITY_ANALYSIS',
  MODULE_D_PROMPT_TRACKING = 'MODULE_D_PROMPT_TRACKING',
  
  // AEO Analysis (Module C)
  AEO_ANALYSIS = 'AEO_ANALYSIS',
  MODULE_C_AI_PRESENCE = 'MODULE_C_AI_PRESENCE',
  MODULE_C_ANSWERABILITY = 'MODULE_C_ANSWERABILITY',
  MODULE_C_KNOWLEDGE_BASE = 'MODULE_C_KNOWLEDGE_BASE',
  MODULE_C_COMPETITOR = 'MODULE_C_COMPETITOR',
  MODULE_C_LLM_SIMULATOR = 'MODULE_C_LLM_SIMULATOR',
  MODULE_C_BULK_AUDIT = 'MODULE_C_BULK_AUDIT',
  
  // Brand Intelligence (Module E)
  MODULE_E_FULL = 'MODULE_E_FULL',
  MODULE_E_QUICK_START = 'MODULE_E_QUICK_START',   // Brand + Competitors + AI SOV in one shot
  MODULE_E_CONSISTENCY = 'MODULE_E_CONSISTENCY',
  MODULE_E_SENTIMENT = 'MODULE_E_SENTIMENT',
  MODULE_E_COMPETITORS = 'MODULE_E_COMPETITORS',
  MODULE_E_AI_SOV = 'MODULE_E_AI_SOV',
  MODULE_E_RANKING = 'MODULE_E_RANKING',
  MODULE_E_BRAND = 'MODULE_E_BRAND',
  MODULE_E_AI_CITATION_RANKING = 'MODULE_E_AI_CITATION_RANKING',

  MODULE_F_COMPETITOR_AI_INTELLIGENCE = 'MODULE_F_COMPETITOR_AI_INTELLIGENCE',

  // SERP Analyzer (Module A)
  MODULE_A_SERP = 'MODULE_A_SERP',
}

/**
 * Job Category for queue routing
 */
export enum JobCategory {
  CRAWLER = 'CRAWLER',
  SCHEMA = 'SCHEMA',
  MODULE_A = 'MODULE_A',
  MODULE_C = 'MODULE_C',
  MODULE_D = 'MODULE_D',
  MODULE_E = 'MODULE_E',
  MODULE_F = 'MODULE_F',
}

/**
 * Map job types to their categories for queue routing
 */
export const JOB_TYPE_TO_CATEGORY: Record<JobType, JobCategory> = {
  [JobType.CRAWL]: JobCategory.CRAWLER,
  [JobType.CRAWL_RESUME]: JobCategory.CRAWLER,
  [JobType.SCHEMA]: JobCategory.SCHEMA,
  [JobType.CONTENT_METRICS]: JobCategory.MODULE_D,
  [JobType.MODULE_D]: JobCategory.MODULE_D,
  [JobType.MODULE_D_ENTITY_ANALYSIS]: JobCategory.MODULE_D,
  [JobType.MODULE_D_PROMPT_TRACKING]: JobCategory.MODULE_D,
  [JobType.AEO_ANALYSIS]: JobCategory.MODULE_C,
  [JobType.MODULE_C_AI_PRESENCE]: JobCategory.MODULE_C,
  [JobType.MODULE_C_ANSWERABILITY]: JobCategory.MODULE_C,
  [JobType.MODULE_C_KNOWLEDGE_BASE]: JobCategory.MODULE_C,
  [JobType.MODULE_C_COMPETITOR]: JobCategory.MODULE_C,
  [JobType.MODULE_C_LLM_SIMULATOR]: JobCategory.MODULE_C,
  [JobType.MODULE_C_BULK_AUDIT]: JobCategory.MODULE_C,
  [JobType.MODULE_E_FULL]: JobCategory.MODULE_E,
  [JobType.MODULE_E_QUICK_START]: JobCategory.MODULE_E,
  [JobType.MODULE_E_CONSISTENCY]: JobCategory.MODULE_E,
  [JobType.MODULE_E_SENTIMENT]: JobCategory.MODULE_E,
  [JobType.MODULE_E_COMPETITORS]: JobCategory.MODULE_E,
  [JobType.MODULE_E_AI_SOV]: JobCategory.MODULE_E,
  [JobType.MODULE_E_RANKING]: JobCategory.MODULE_E,
  [JobType.MODULE_E_BRAND]: JobCategory.MODULE_E,
  [JobType.MODULE_E_AI_CITATION_RANKING]: JobCategory.MODULE_E,
  [JobType.MODULE_F_COMPETITOR_AI_INTELLIGENCE]: JobCategory.MODULE_F,
  [JobType.MODULE_A_SERP]: JobCategory.MODULE_A,
};

export interface Job {
  id: string;
  sessionId: string;
  projectId: string;
  url: string;
  jobType: JobType;
  config?: Record<string, any>;
  allowSubdomains?: boolean;
  runAudits?: boolean;
  auditDevice?: string;
  captureLinkDetails?: boolean;
  type: JobType;
  schemaType?: string | null;
  status: JobStatus;
  createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  errorMessage?: string | null;
}

export interface CreateJobDto {
  url: string;
  jobType: JobType;
  config?: Record<string, any>;
  allowSubdomains?: boolean;
  runAudits?: boolean;
  auditDevice?: string;
  captureLinkDetails?: boolean;
  type?: JobType;
  schemaType?: string;
}

/**
 * Thrown by JobService.createJob when a job of the same type is already
 * PENDING or RUNNING for the session.  Controllers should map this to 409.
 */
export class JobConflictError extends Error {
  readonly existingJobId: string;
  constructor(message: string, existingJobId: string) {
    super(message);
    this.name = 'JobConflictError';
    this.existingJobId = existingJobId;
  }
}
