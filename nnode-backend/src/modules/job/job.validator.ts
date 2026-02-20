import { z } from 'zod';
import { JobType } from './job.types';

export const createJobSchema = z.object({
  url: z.string().url('Invalid URL'),
  jobType: z.nativeEnum(JobType).optional().default(JobType.CRAWL),
  config: z.record(z.any()).optional(),
  allowSubdomains: z.boolean().optional(),
  runAudits: z.boolean().optional(),
  auditDevice: z.enum(['mobile', 'desktop']).optional(),
  captureLinkDetails: z.boolean().optional(),
  type: z.nativeEnum(JobType).default(JobType.CRAWL),
  schemaType: z.string().optional(),
});
