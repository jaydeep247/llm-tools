export enum SessionStatus {
  CREATED = 'CREATED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface Session {
  id: string;
  projectId: string;
  status: SessionStatus;
  createdAt: Date;
  endedAt?: Date | null;
}

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
