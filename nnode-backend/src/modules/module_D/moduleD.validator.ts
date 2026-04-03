import { z } from 'zod';

export const moduleDAskAIBodySchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  question: z.string().min(1, 'Question is required').max(8000),
  job_id: z.string().min(1).optional(),
  conversation_history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .max(20)
    .optional(),
});

export const moduleDSuggestedQuestionsBodySchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
});
