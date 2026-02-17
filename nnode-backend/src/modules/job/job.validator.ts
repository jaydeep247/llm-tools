import { z } from 'zod';

export const createJobSchema = z.object({
  url: z.string().url('Invalid URL'),
  allowSubdomains: z.boolean().optional(),
  runAudits: z.boolean().optional(),
  auditDevice: z.enum(['mobile', 'desktop']).optional(),
  captureLinkDetails: z.boolean().optional(),
});

