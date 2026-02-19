import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100, 'Project name too long'),
  description: z.string().max(500, 'Description too long').optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100, 'Project name too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

export const projectIdSchema = z.object({
  id: z.string().uuid('Invalid project ID'),
});
