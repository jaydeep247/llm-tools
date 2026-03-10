import { z } from 'zod';

export const jobIdParamSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
});

export const sessionParamSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

export const runSerpAnalyzerSchema = z.object({
  keywords: z
    .array(z.string().min(1).max(200))
    .min(1, 'At least one keyword is required')
    .max(100, 'Maximum 100 keywords per job'),
  competitors: z.array(z.string()).optional().default([]),
  locationCode: z.number().int().positive().optional().default(2840),
  languageCode: z.string().min(2).max(5).optional().default('en'),
  device: z.enum(['desktop', 'mobile']).optional().default('desktop'),
});

export type JobIdParam = z.infer<typeof jobIdParamSchema>;
export type SessionParam = z.infer<typeof sessionParamSchema>;
export type RunSerpAnalyzerBody = z.infer<typeof runSerpAnalyzerSchema>;
