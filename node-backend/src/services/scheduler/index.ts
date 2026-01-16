import { SchedulerService, SchedulerConfig } from './SchedulerService.js';

// Create singleton instance
let schedulerServiceInstance: SchedulerService | null = null;

export function initializeSchedulerService(config: SchedulerConfig): SchedulerService {
    if (!schedulerServiceInstance) {
        schedulerServiceInstance = new SchedulerService(config);
    }
    return schedulerServiceInstance;
}

export function getSchedulerService(): SchedulerService {
    if (!schedulerServiceInstance) {
        // Create with default config if not initialized
        schedulerServiceInstance = new SchedulerService({
            checkIntervalMs: 60000,
            maxConcurrentRuns: 3,
            retryFailedSchedules: true,
            retryDelayMs: 300000
        });
    }
    return schedulerServiceInstance;
}
