import { z } from 'zod';

export const jobIdParamSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
});

export const moduleFAskAIBodySchema = z.object({
  question: z.string().min(1, 'Question is required').max(8000),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .max(20)
    .optional(),
});

