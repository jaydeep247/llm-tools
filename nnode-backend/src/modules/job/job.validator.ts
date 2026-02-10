import { z } from 'zod';

export const createJobSchema = z.object({
  jobType: z.enum(['CRAWL', 'SEO_ANALYSIS', 'AEO_ANALYSIS', 'SERP_FETCH', 'ENTITY_ANALYSIS'], {
    errorMap: () => ({ message: 'Invalid job type' }),
  }),
  priority: z.number().int().min(0).max(100).optional().default(0),
});

export const updateJobStatusSchema = z.object({
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED'], {
    errorMap: () => ({ message: 'Status must be RUNNING, COMPLETED, or FAILED' }),
  }),
  failureReason: z.string().optional(),
});

export const jobIdSchema = z.object({
  id: z.string().uuid('Invalid job ID'),
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
});
