/**
 * Account Limits - Plan-agnostic limit abstraction
 * These values can be hardcoded defaults or fetched from a subscription service
 */
export interface AccountLimits {
  maxProjects: number;
  maxSessionsPerProject: number;
  maxActiveSessions: number;
  maxConcurrentSessions: number;
  maxTotalSessions: number;
  
  // Job limits
  maxConcurrentJobs: number;
  maxConcurrentJobsPerSession: number;
  maxTotalJobsPerSession: number;
}

/**
 * Default limits for all users
 * In the future, these can be fetched from a subscription/billing service
 */
export const DEFAULT_ACCOUNT_LIMITS: AccountLimits = {
  maxProjects: 10,
  maxSessionsPerProject: 100,
  maxActiveSessions: 5,
  maxConcurrentSessions: 3,
  maxTotalSessions: 1000,
  
  // Job limits
  maxConcurrentJobs: 10,
  maxConcurrentJobsPerSession: 5,
  maxTotalJobsPerSession: 1000,
};
