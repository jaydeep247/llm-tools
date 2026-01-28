import { Logger } from '../../../helpers/logging/Logger.js';
import { AuditScheduler } from './AuditScheduler.js';
import { getDatabase } from '../../DatabaseService.js';

export class AuditIntegration {
    private auditScheduler: AuditScheduler;
    private logger: Logger;
    private db = getDatabase();

    constructor() {
        this.auditScheduler = new AuditScheduler();
        this.logger = Logger.getInstance();
    }

    /**
     * Start the audit scheduler
     */
    start(): void {
        this.auditScheduler.start();
        this.logger.info('Audit integration started');
    }

    /**
     * Stop the audit scheduler
     */
    stop(): void {
        this.auditScheduler.stop();
        this.logger.info('Audit integration stopped');
    }

    /**
     * Create audit schedules for URLs found during a crawl session
     */
    async createAuditSchedulesForSession(sessionId: number, options: {
        device?: 'mobile' | 'desktop';
        cronExpression?: string;
        scheduleName?: string;
        maxUrls?: number;
    } = {}): Promise<number[]> {
        try {
            // Get URLs from the crawl session
            // Filter by statusCode === 200 to match audit progress calculation logic
            const pages = await this.db.getPages(sessionId);
            const urls = pages
                .filter((page: any) => page.statusCode === 200)
                .map((page: any) => page.url)
                .slice(0, options.maxUrls || 50); // Limit to prevent too many audits

            if (urls.length === 0) {
                this.logger.warn('No valid URLs found for audit scheduling', { sessionId });
                return [];
            }

            // Create audit schedule
            const scheduleName = options.scheduleName || `Auto-generated from crawl session ${sessionId}`;
            const scheduleId = await this.auditScheduler.createSchedule({
                name: scheduleName,
                description: `Automatically generated audit schedule for ${urls.length} URLs from crawl session ${sessionId}`,
                urls,
                device: options.device || 'desktop',
                cronExpression: options.cronExpression || '0 2 * * *', // Daily at 2 AM
                enabled: true
            });

            this.logger.info('Created audit schedule for crawl session', {
                sessionId,
                scheduleId,
                urlCount: urls.length,
                device: options.device || 'desktop'
            });

            return [scheduleId];
        } catch (error) {
            this.logger.error('Failed to create audit schedules for session', error as Error, { sessionId });
            return [];
        }
    }

    /**
     * Create audit schedules for specific URLs
     */
    async createAuditScheduleForUrls(urls: string[], options: {
        name: string;
        description?: string;
        device?: 'mobile' | 'desktop';
        cronExpression?: string;
        enabled?: boolean;
    }): Promise<number> {
        const scheduleId = await this.auditScheduler.createSchedule({
            name: options.name,
            description: options.description || `Audit schedule for ${urls.length} URLs`,
            urls,
            device: options.device || 'desktop',
            cronExpression: options.cronExpression || '0 2 * * *',
            enabled: options.enabled !== false
        });

        this.logger.info('Created audit schedule for URLs', {
            scheduleId,
            urlCount: urls.length,
            device: options.device || 'desktop'
        });

        return scheduleId;
    }

    /**
     * Get audit scheduler instance
     */
    getAuditScheduler(): AuditScheduler {
        return this.auditScheduler;
    }

    /**
     * Get all audit schedules
     */
    async getAllSchedules() {
        return await this.auditScheduler.getAllSchedules();
    }

    /**
     * Get audit schedule by ID
     */
    async getSchedule(id: number) {
        return await this.auditScheduler.getSchedule(id);
    }

    /**
     * Update audit schedule
     */
    async updateSchedule(id: number, updates: any) {
        return await this.auditScheduler.updateSchedule(id, updates);
    }

    /**
     * Delete audit schedule
     */
    async deleteSchedule(id: number) {
        return await this.auditScheduler.deleteSchedule(id);
    }

    /**
     * Toggle audit schedule
     */
    async toggleSchedule(id: number) {
        return await this.auditScheduler.toggleSchedule(id);
    }

    /**
     * Trigger audit schedule manually
     */
    async triggerSchedule(id: number) {
        return await this.auditScheduler.triggerSchedule(id);
    }

    /**
     * Get audit executions
     */
    async getExecutions(limit: number = 100) {
        return await this.auditScheduler.getAllExecutions(limit);
    }

    /**
     * Get audit scheduler status
     */
    getStatus() {
        return this.auditScheduler.getStatus();
    }
}
