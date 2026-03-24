import { z } from 'zod';

export const brandDescriptionSchema = z.object({
  url: z.string().url('Invalid URL'),
  jobId: z.string().optional(),
});
