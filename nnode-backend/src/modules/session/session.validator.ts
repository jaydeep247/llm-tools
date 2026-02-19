import { z } from 'zod';

export const createSessionSchema = z.object({
  // No body fields required - projectId comes from route params
});

export const updateSessionStatusSchema = z.object({
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED'], {
    errorMap: () => ({ message: 'Status must be RUNNING, COMPLETED, or FAILED' }),
  }),
});

export const startCrawlSchema = z.object({
  url: z.string().url('Invalid URL'),
  projectId: z.string().optional(), // In body it might be redundant if in params but harmless
  allowSubdomains: z.boolean().optional(),
  runAudits: z.boolean().optional(),
  auditDevice: z.enum(['mobile', 'desktop']).optional(),
  captureLinkDetails: z.boolean().optional(),
});

export const sessionIdSchema = z.object({
  id: z.string().uuid('Invalid session ID'),
  // id: z.string().min('Invalid session ID'),
});

export const projectIdParamSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});
