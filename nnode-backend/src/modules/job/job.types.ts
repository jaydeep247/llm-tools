import { Job, JobType, JobStatus } from '@prisma/client';

export type JobResponse = Job;

export interface CreateJobDto {
  jobType: JobType;
  priority?: number;
  config?: any;
}

export interface UpdateJobStatusDto {
  status: JobStatus;
  failureReason?: string;
}

export interface JobFilters {
  sessionId?: string;
  jobType?: JobType;
  status?: JobStatus;
}

export interface JobWithSession extends Job {
  session?: {
    id: string;
    projectId: string;
    project?: {
      userId: string;
    };
  };
}

/**
 * Job state machine transitions
 * PENDING → RUNNING → COMPLETED
 *                   → FAILED
 */
export const VALID_JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  PENDING: ['RUNNING'],
  RUNNING: ['COMPLETED', 'FAILED'],
  COMPLETED: [], // Immutable
  FAILED: [], // Immutable
};

export interface CrawlResultsResponse {
  session: Job & {
    allow_subdomains?: boolean;
    max_concurrency?: number;
    total_pages?: number;
    total_links?: number;
  };
  pages: any[];
  links: Record<string, any[]>;
  sitemaps: any[];
}
