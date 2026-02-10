import { DEFAULT_ACCOUNT_LIMITS, AccountLimits } from './limits.types';

/**
 * Limits Service - Evaluates account limits without hardcoding plans
 */
export class LimitsService {
  /**
   * Get account limits for a user
   * Currently returns default limits
   * In the future, this will fetch from subscription/billing service
   */
  async getAccountLimits(_userId: string): Promise<AccountLimits> {
    // TODO: In the future, fetch from subscription service based on userId
    // Example: const subscription = await subscriptionService.getByUserId(userId);
    // return subscription.limits;
    
    return DEFAULT_ACCOUNT_LIMITS;
  }

  /**
   * Check if user can create a new project
   */
  canCreateProject(currentProjectCount: number, limits: AccountLimits): boolean {
    return currentProjectCount < limits.maxProjects;
  }

  /**
   * Check if user can create a new session in a project
   */
  canCreateSession(
    totalSessionsInProject: number,
    activeSessionsCount: number,
    limits: AccountLimits
  ): boolean {
    if (totalSessionsInProject >= limits.maxSessionsPerProject) {
      return false;
    }
    if (activeSessionsCount >= limits.maxActiveSessions) {
      return false;
    }
    return true;
  }

  /**
   * Check if user can create a new job
   */
  canCreateJob(
    totalJobsInSession: number,
    concurrentJobsInSession: number,
    concurrentJobsForUser: number,
    limits: AccountLimits
  ): boolean {
    if (totalJobsInSession >= limits.maxTotalJobsPerSession) {
      return false;
    }
    if (concurrentJobsInSession >= limits.maxConcurrentJobsPerSession) {
      return false;
    }
    if (concurrentJobsForUser >= limits.maxConcurrentJobs) {
      return false;
    }
    return true;
  }

  /**
   * Get limit violation message
   */
  getLimitViolationMessage(limitType: string, limit: number): string {
    return `Limit exceeded: ${limitType} (max: ${limit})`;
  }
}
