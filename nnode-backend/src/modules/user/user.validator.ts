import { z } from 'zod';
import { UserRole } from '../../shared/constants/roles';

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum([UserRole.CXO, UserRole.CMO, UserRole.SEO_MANAGER, UserRole.CONTENT_MANAGER, UserRole.ANALYST, UserRole.ADMIN]).optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  role: z.enum([UserRole.CXO, UserRole.CMO, UserRole.SEO_MANAGER, UserRole.CONTENT_MANAGER, UserRole.ANALYST, UserRole.ADMIN]).optional(),
  hasNew: z.boolean().optional(),
  onboardingData: z.object({
    role: z.string().optional(),
    organizationType: z.string().optional(),
    focusArea: z.string().optional(),
  }).optional(),
});

export const userIdSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
});
