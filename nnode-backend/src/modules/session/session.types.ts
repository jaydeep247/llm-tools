import { Session, SessionStatus } from '@prisma/client';

export type SessionResponse = Session;

export interface CreateSessionDto {
  // No additional fields needed - projectId comes from route params
}

export interface SessionFilters {
  projectId?: string;
  status?: SessionStatus;
}

export interface SessionWithProject extends Session {
  project?: {
    id: string;
    name: string;
    userId: string;
  };
}
