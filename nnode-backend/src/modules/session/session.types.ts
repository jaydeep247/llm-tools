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
  startedAt?: Date | null;
  completedAt?: Date | null;
  startUrl?: string;
  allowSubdomains?: boolean;
  maxConcurrency?: number;
  totalPages?: number;
  totalLinks?: number;
  totalSitemaps?: number;
  totalResources?: number;
  /** Set when the user soft-deletes the session. Data is preserved for caching. */
  deletedAt?: Date | null;
}

export type SessionResponse = Session;

export interface CreateSessionDto {
  // No additional fields needed - projectId comes from route params
}

export interface SessionFilters {
  projectId?: string;
  status?: SessionStatus;
  limit?: number;
  offset?: number;
  includeTotal?: boolean;
}

export interface SessionListResponse {
  sessions: Session[];
  pagination: {
    limit: number;
    offset: number;
    total?: number;
    hasNext: boolean;
  };
}

export interface SessionWithProject extends Session {
  project?: {
    id: string;
    name: string;
    userId: string;
  };
}
