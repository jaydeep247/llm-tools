import { z } from 'zod';

export const jobIdParamSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
});

export const sessionParamSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

export const runModuleCSchema = z.object({
  url: z.string().url().optional(),
  query: z.string().optional(),
});

export type JobIdParam = z.infer<typeof jobIdParamSchema>;
export type SessionParam = z.infer<typeof sessionParamSchema>;
export type RunModuleCBody = z.infer<typeof runModuleCSchema>;
