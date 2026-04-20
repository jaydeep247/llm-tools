import { z } from 'zod';

export const jobIdParamSchema = z.object({
  jobId: z.string().uuid('Invalid job ID'),
});

export const moduleEAskAIBodySchema = z.object({
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

export const moduleESuggestedQuestionsBodySchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
});

export const moduleEPerceptionSourcesQuerySchema = z.object({
  job_id: z.string().min(1, 'job_id is required'),
  customer_root_domain: z.string().min(1, 'customer_root_domain is required'),
  search: z.string().optional(),
  llm: z.string().optional(),
  property: z.string().optional(),
  type: z.enum(['all', 'owned', 'third-party']).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit_domains: z.coerce.number().int().min(1).max(1000).optional(),
});

export const moduleEPerceptionSourceResponsesQuerySchema = z.object({
  job_id: z.string().min(1, 'job_id is required'),
  domain: z.string().min(1, 'domain is required'),
  customer_root_domain: z.string().min(1, 'customer_root_domain is required'),
  llm: z.string().optional(),
  property: z.string().optional(),
  type: z.enum(['all', 'owned', 'third-party']).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

export const moduleEPerceptionRunBodySchema = z.object({
  job_id: z.string().min(1, 'job_id is required'),
  brand_name: z.string().min(1, 'brand_name is required'),
  domain: z.string().min(1, 'domain is required'),
  market: z.string().optional(),
  language: z.string().optional(),
  properties: z.array(z.string().min(1)).optional(),
  models: z.array(z.string().min(1)).optional(),
});

export const moduleEPerceptionGetQuerySchema = z.object({
  job_id: z.string().min(1, 'job_id is required'),
});

export const moduleEPerceptionSourcesOverviewQuerySchema = z.object({
  job_id: z.string().min(1, 'job_id is required'),
  customer_root_domain: z.string().min(1, 'customer_root_domain is required'),
  llm: z.string().optional(),
  property: z.string().optional(),
  type: z.enum(['all', 'owned', 'third-party']).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  top_n_domains: z.coerce.number().int().min(1).max(20).optional(),
});
