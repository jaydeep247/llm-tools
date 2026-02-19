export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum JobType {
  CRAWL = 'CRAWL',
  SCHEMA = 'SCHEMA',
  CONTENT_METRICS = 'CONTENT_METRICS',
}

export interface Job {
  id: string;
  sessionId: string;
  projectId: string;
  url: string;
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
  allowSubdomains?: boolean;
  runAudits?: boolean;
  auditDevice?: string;
  captureLinkDetails?: boolean;
  type?: JobType;
  schemaType?: string;
}
