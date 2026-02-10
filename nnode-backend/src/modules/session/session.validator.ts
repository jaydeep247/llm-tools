import { z } from 'zod';

export const createSessionSchema = z.object({
  // No body fields required - projectId comes from route params
});

export const updateSessionStatusSchema = z.object({
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED'], {
    errorMap: () => ({ message: 'Status must be RUNNING, COMPLETED, or FAILED' }),
  }),
});

export const sessionIdSchema = z.object({
  id: z.string().uuid('Invalid session ID'),
});

export const projectIdParamSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});
