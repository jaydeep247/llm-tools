import { z } from 'zod';

export const brandDescriptionSchema = z.object({
  url: z.string().url('Invalid URL'),
  jobId: z.string().optional(),
});

export const brandTopicsSchema = z.object({
  url: z.string().url('Invalid URL'),
  brandName: z.string().min(1, 'Brand name is required'),
  brandDescription: z.string().min(1, 'Brand description is required'),
  jobId: z.string().optional(),
});

export const saveBrandTopicsSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  selectedTopics: z.array(z.string().min(1)).min(1, 'At least one topic is required'),
});

export const brandPromptsSchema = z.object({
  brandName: z.string().min(1, 'Brand name is required'),
  brandDescription: z.string().min(1, 'Brand description is required'),
  selectedTopics: z.array(z.string().min(1)).min(1, 'At least one topic is required'),
  jobId: z.string().optional(),
});

export const saveBrandPromptsSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  selectedPrompts: z.array(z.string().min(1)).min(1, 'At least one prompt is required'),
});

export const executeBrandPromptsSchema = z.object({
  brandName: z.string().min(1, 'Brand name is required'),
  prompts: z.array(z.object({
    prompt: z.string().min(1),
    type: z.string().min(1),
  })).min(1, 'At least one prompt is required'),
  jobId: z.string().optional(),
});
