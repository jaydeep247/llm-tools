export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum JobType {
  CRAWL = 'CRAWL',
  AEO_ANALYSIS = 'AEO_ANALYSIS',
}

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
}

