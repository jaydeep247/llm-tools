import { prisma } from '../../config/prismaClient.js';
import { CrawlSession, CrawlSchedule, ScheduleExecution } from '../types.js';

export class CrawlRepository {
    constructor() { }

    async createCrawlSession(data: Omit<CrawlSession, 'id'>): Promise<number> {
        const session = await prisma.crawlSession.create({
            data: {
                projectId: data.projectId,
                startUrl: data.startUrl,
                allowSubdomains: data.allowSubdomains,
                maxConcurrency: data.maxConcurrency,
                mode: data.mode,
                scheduleId: data.scheduleId ?? null,
                userId: data.userId ?? null,
                startedAt: data.startedAt,
                completedAt: data.completedAt ?? null,
                totalPages: data.totalPages,
                totalResources: data.totalResources,
                duration: data.duration,
                status: data.status,
                maxDepth: (data as any).maxDepth ?? null,
                maxPages: (data as any).maxPages ?? null,
                respectRobotsTxt: (data as any).respectRobotsTxt ?? null,
                userAgent: (data as any).userAgent ?? null,
                errorMessage: (data as any).errorMessage ?? null,
                pagesCrawled: (data as any).pagesCrawled ?? null,
            },
        });
        return session.id;
    }

    async updateCrawlSession(id: number, updates: Partial<CrawlSession>): Promise<void> {
        const updateData: any = {};
        
        if (updates.startUrl !== undefined) updateData.startUrl = updates.startUrl;
        if (updates.allowSubdomains !== undefined) updateData.allowSubdomains = updates.allowSubdomains;
        if (updates.maxConcurrency !== undefined) updateData.maxConcurrency = updates.maxConcurrency;
        if (updates.mode !== undefined) updateData.mode = updates.mode;
        if (updates.scheduleId !== undefined) updateData.scheduleId = updates.scheduleId;
        if (updates.startedAt !== undefined) updateData.startedAt = updates.startedAt;
        if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt;
        if (updates.totalPages !== undefined) updateData.totalPages = updates.totalPages;
        if (updates.totalResources !== undefined) updateData.totalResources = updates.totalResources;
        if (updates.duration !== undefined) updateData.duration = updates.duration;
        if (updates.status !== undefined) updateData.status = updates.status;
        
        // Handle new fields from old schema
        const extendedUpdates = updates as any;
        if (extendedUpdates.maxDepth !== undefined) updateData.maxDepth = extendedUpdates.maxDepth;
        if (extendedUpdates.maxPages !== undefined) updateData.maxPages = extendedUpdates.maxPages;
        if (extendedUpdates.respectRobotsTxt !== undefined) updateData.respectRobotsTxt = extendedUpdates.respectRobotsTxt;
        if (extendedUpdates.userAgent !== undefined) updateData.userAgent = extendedUpdates.userAgent;
        if (extendedUpdates.errorMessage !== undefined) updateData.errorMessage = extendedUpdates.errorMessage;
        if (extendedUpdates.pagesCrawled !== undefined) updateData.pagesCrawled = extendedUpdates.pagesCrawled;

        if (Object.keys(updateData).length === 0) return;

        await prisma.crawlSession.update({
            where: { id },
            data: updateData,
        });
    }

    async getCrawlSession(id: number): Promise<CrawlSession | null> {
        const session = await prisma.crawlSession.findUnique({
            where: { id },
        });
        if (!session) return null;
        return this.mapSession(session);
    }

    async getLatestCrawlSession(): Promise<CrawlSession | null> {
        const session = await prisma.crawlSession.findFirst({
            orderBy: { startedAt: 'desc' },
        });
        if (!session) return null;
        return this.mapSession(session);
    }

    async getCrawlSessions(limit: number = 50, offset: number = 0, scheduleId?: number, userId?: number): Promise<CrawlSession[]> {
        const where: any = {};
        if (typeof scheduleId === 'number') {
            where.scheduleId = scheduleId;
        }
        if (typeof userId === 'number') {
            where.userId = userId;
        }

        const sessions = await prisma.crawlSession.findMany({
            where,
            orderBy: { startedAt: 'desc' },
            take: limit,
            skip: offset,
        });

        return sessions.map((session: any) => this.mapSession(session));
    }

    /** Get running or auditing sessions that started before the given date (for timeout cleanup). */
    async getRunningSessionsStartedBefore(cutoffDate: Date): Promise<CrawlSession[]> {
        const sessions = await prisma.crawlSession.findMany({
            where: {
                status: { in: ['running', 'auditing'] },
                startedAt: { lt: cutoffDate },
            },
        });
        return sessions.map((session: any) => this.mapSession(session));
    }

    async insertCrawlSchedule(data: Omit<CrawlSchedule, 'id'>): Promise<number> {
        const schedule = await prisma.crawlSchedule.create({
            data: {
                name: data.name,
                description: data.description,
                startUrl: data.startUrl,
                allowSubdomains: data.allowSubdomains,
                maxConcurrency: data.maxConcurrency,
                mode: data.mode,
                cronExpression: data.cronExpression,
                enabled: data.enabled,
                userId: data.userId ?? null,
                createdAt: data.createdAt,
                lastRun: data.lastRun || null,
                nextRun: data.nextRun || null,
                totalRuns: data.totalRuns,
                successfulRuns: data.successfulRuns,
                failedRuns: data.failedRuns,
            },
        });
        return schedule.id;
    }

    async updateCrawlSchedule(id: number, updates: Partial<CrawlSchedule>): Promise<void> {
        const updateData: any = {};

        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.description !== undefined) updateData.description = updates.description;
        if (updates.startUrl !== undefined) updateData.startUrl = updates.startUrl;
        if (updates.allowSubdomains !== undefined) updateData.allowSubdomains = updates.allowSubdomains;
        if (updates.maxConcurrency !== undefined) updateData.maxConcurrency = updates.maxConcurrency;
        if (updates.mode !== undefined) updateData.mode = updates.mode;
        if (updates.cronExpression !== undefined) updateData.cronExpression = updates.cronExpression;
        if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
        if (updates.userId !== undefined) updateData.userId = updates.userId;
        if (updates.createdAt !== undefined) updateData.createdAt = updates.createdAt;
        if (updates.lastRun !== undefined) updateData.lastRun = updates.lastRun;
        if (updates.nextRun !== undefined) updateData.nextRun = updates.nextRun;
        if (updates.totalRuns !== undefined) updateData.totalRuns = updates.totalRuns;
        if (updates.successfulRuns !== undefined) updateData.successfulRuns = updates.successfulRuns;
        if (updates.failedRuns !== undefined) updateData.failedRuns = updates.failedRuns;

        if (Object.keys(updateData).length === 0) return;

        await prisma.crawlSchedule.update({
            where: { id },
            data: updateData,
        });
    }

    async deleteCrawlSchedule(id: number): Promise<void> {
        await prisma.crawlSchedule.delete({
            where: { id },
        });
    }

    async deleteCrawlSession(id: number): Promise<void> {
        // CASCADE will handle related tables automatically
        await prisma.crawlSession.delete({
            where: { id },
        });
    }

    async getCrawlSchedule(id: number): Promise<CrawlSchedule | null> {
        const schedule = await prisma.crawlSchedule.findUnique({
            where: { id },
        });
        if (!schedule) return null;
        return this.mapSchedule(schedule);
    }

    async getAllCrawlSchedules(): Promise<CrawlSchedule[]> {
        const schedules = await prisma.crawlSchedule.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return schedules.map((schedule: any) => this.mapSchedule(schedule));
    }

    async getEnabledCrawlSchedules(): Promise<CrawlSchedule[]> {
        const schedules = await prisma.crawlSchedule.findMany({
            where: { enabled: true },
        });
        return schedules.map((schedule: any) => this.mapSchedule(schedule));
    }

    async insertScheduleExecution(data: Omit<ScheduleExecution, 'id'>): Promise<number> {
        const execution = await prisma.scheduleExecution.create({
            data: {
                scheduleId: data.scheduleId,
                sessionId: data.sessionId,
                startedAt: data.startedAt,
                completedAt: data.completedAt || null,
                status: data.status,
                errorMessage: data.errorMessage || null,
                pagesCrawled: data.pagesCrawled,
                resourcesFound: data.resourcesFound,
                duration: data.duration,
            },
        });
        return execution.id;
    }

    async updateScheduleExecution(id: number, updates: Partial<ScheduleExecution>): Promise<void> {
        const updateData: any = {};

        if (updates.scheduleId !== undefined) updateData.scheduleId = updates.scheduleId;
        if (updates.sessionId !== undefined) updateData.sessionId = updates.sessionId;
        if (updates.startedAt !== undefined) updateData.startedAt = updates.startedAt;
        if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt;
        if (updates.status !== undefined) updateData.status = updates.status;
        if (updates.errorMessage !== undefined) updateData.errorMessage = updates.errorMessage;
        if (updates.pagesCrawled !== undefined) updateData.pagesCrawled = updates.pagesCrawled;
        if (updates.resourcesFound !== undefined) updateData.resourcesFound = updates.resourcesFound;
        if (updates.duration !== undefined) updateData.duration = updates.duration;

        if (Object.keys(updateData).length === 0) return;

        await prisma.scheduleExecution.update({
            where: { id },
            data: updateData,
        });
    }

    async getScheduleExecutions(scheduleId: number, limit: number = 50): Promise<ScheduleExecution[]> {
        const executions = await prisma.scheduleExecution.findMany({
            where: { scheduleId },
            orderBy: { startedAt: 'desc' },
            take: limit,
        });
        return executions.map((execution: any) => this.mapExecution(execution));
    }

    async getAllScheduleExecutions(limit: number = 100): Promise<ScheduleExecution[]> {
        const executions = await prisma.scheduleExecution.findMany({
            orderBy: { startedAt: 'desc' },
            take: limit,
        });
        return executions.map((execution: any) => this.mapExecution(execution));
    }

    // DEPRECATED: Removed in favor of project-based organization
    // Use project-based queries instead
    async getUserCrawlSessionsWithResults(userId: number, limit: number = 50, offset: number = 0): Promise<any[]> {
        // This method is deprecated and should not be used
        // Use getUserProjects() and getProjectSessions() from DatabaseService instead
        throw new Error('getUserCrawlSessionsWithResults is deprecated. Use project-based queries instead.');
    }

    async shareSessionWithUser(sessionId: number, userId: number): Promise<void> {
        await prisma.sessionShare.upsert({
            where: {
                sessionId_userId: {
                    sessionId,
                    userId,
                },
            },
            update: {
                accessedAt: new Date(),
            },
            create: {
                sessionId,
                userId,
            },
        });
    }

    async getCrawlLogs(sessionId: number): Promise<any[]> {
        const logs = await prisma.crawlLog.findMany({
            where: { sessionId },
            orderBy: { timestamp: 'asc' },
        });
        return logs;
    }

    async getLatestSessionByUrl(url: string, userId: number): Promise<CrawlSession | null> {
        const session = await prisma.crawlSession.findFirst({
            where: {
                startUrl: url,
                userId,
                status: {
                    not: 'cancelled',
                },
            },
            orderBy: { startedAt: 'desc' },
        });
        if (!session) return null;
        return this.mapSession(session);
    }

    async getRunningSessionByUrl(url: string, userId?: number): Promise<CrawlSession | null> {
        const where: any = {
            startUrl: url,
            status: 'running',
        };
        if (userId) {
            where.userId = userId;
        }

        const session = await prisma.crawlSession.findFirst({
            where,
        });
        return session ? this.mapSession(session) : null;
    }

    async getAnyRunningSessionByUserId(userId: number): Promise<CrawlSession | null> {
        const session = await prisma.crawlSession.findFirst({
            where: {
                userId,
                status: {
                    in: ['running', 'auditing'],
                },
            },
            orderBy: { startedAt: 'desc' },
        });
        return session ? this.mapSession(session) : null;
    }

    async getUserSessionsWithShares(userId: number, limit: number = 100, offset: number = 0): Promise<any[]> {
        // Get owned sessions
        const ownedSessions = await prisma.crawlSession.findMany({
            where: { userId },
            take: limit,
            skip: offset,
        });

        // Get shared sessions
        const sharedSessions = await prisma.sessionShare.findMany({
            where: { userId },
            include: { session: true },
            take: limit,
            skip: offset,
        });

        const allSessions = [
            ...ownedSessions,
            ...sharedSessions.map((share: any) => share.session),
        ];

        // Sort by completed_at or started_at
        allSessions.sort((a, b) => {
            const dateA = a.completedAt || a.startedAt;
            const dateB = b.completedAt || b.startedAt;
            return dateB.getTime() - dateA.getTime();
        });

        return allSessions.slice(0, limit).map(session => this.mapSession(session));
    }

    async getAverageDurationForUrl(url: string, userId?: number): Promise<number> {
        const where: any = {
            startUrl: url,
            status: 'completed',
        };
        if (userId) {
            where.userId = userId;
        }

        const result = await prisma.crawlSession.aggregate({
            where,
            _avg: {
                duration: true,
            },
        });

        return result._avg.duration ? Math.round(result._avg.duration) : 0;
    }

    async clearAllData(): Promise<void> {
        await prisma.$transaction([
            prisma.aeoAnalysisResult.deleteMany(),
            prisma.aeoExecution.deleteMany(),
            prisma.aeoSchedule.deleteMany(),
            prisma.auditResult.deleteMany(),
            prisma.auditExecution.deleteMany(),
            prisma.auditSchedule.deleteMany(),
            prisma.seoCache.deleteMany(),
            prisma.sitemapUrl.deleteMany(),
            prisma.sitemapDiscovery.deleteMany(),
            prisma.link.deleteMany(),
            prisma.resource.deleteMany(),
            prisma.page.deleteMany(),
            prisma.crawlLog.deleteMany(),
            prisma.scheduleExecution.deleteMany(),
            prisma.sessionShare.deleteMany(),
            prisma.crawlSession.deleteMany(),
        ]);
    }

    async getScheduleExecutionsWithDetails(filters: any, limit: number = 100, offset: number = 0): Promise<any> {
        const where: any = {};

        if (filters.scheduleId) {
            where.scheduleId = filters.scheduleId;
        }
        if (filters.status) {
            where.status = filters.status;
        }
        if (filters.startDate) {
            where.startedAt = { gte: new Date(filters.startDate) };
        }
        if (filters.endDate) {
            where.startedAt = { ...where.startedAt, lte: new Date(filters.endDate) };
        }

        const [executions, total] = await Promise.all([
            prisma.scheduleExecution.findMany({
                where,
                include: {
                    schedule: {
                        select: {
                            name: true,
                            startUrl: true,
                            mode: true,
                            allowSubdomains: true,
                            maxConcurrency: true,
                        },
                    },
                },
                orderBy: { startedAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.scheduleExecution.count({ where }),
        ]);

        return {
            executions: executions.map((exec: any) => ({
                ...exec,
                schedule_name: exec.schedule.name,
                start_url: exec.schedule.startUrl,
                mode: exec.schedule.mode,
                allow_subdomains: exec.schedule.allowSubdomains,
                max_concurrency: exec.schedule.maxConcurrency,
            })),
            total,
        };
    }

    async getExecutionWithSession(executionId: number): Promise<any> {
        const execution = await prisma.scheduleExecution.findUnique({
            where: { id: executionId },
            include: {
                schedule: {
                    select: {
                        name: true,
                        startUrl: true,
                        mode: true,
                        allowSubdomains: true,
                        maxConcurrency: true,
                    },
                },
            },
        });

        if (!execution) return null;

        return {
            ...execution,
            schedule_name: execution.schedule.name,
            start_url: execution.schedule.startUrl,
            mode: execution.schedule.mode,
            allow_subdomains: execution.schedule.allowSubdomains,
            max_concurrency: execution.schedule.maxConcurrency,
        };
    }

    async getScheduleStats(scheduleId?: number): Promise<any> {
        const where: any = {};
        if (scheduleId) {
            where.scheduleId = scheduleId;
        }

        const [total, successful, failed, running, avgDuration, totalPages, totalResources] = await Promise.all([
            prisma.scheduleExecution.count({ where }),
            prisma.scheduleExecution.count({ where: { ...where, status: 'completed' } }),
            prisma.scheduleExecution.count({ where: { ...where, status: 'failed' } }),
            prisma.scheduleExecution.count({ where: { ...where, status: 'running' } }),
            prisma.scheduleExecution.aggregate({
                where: { ...where, status: 'completed' },
                _avg: { duration: true },
            }),
            prisma.scheduleExecution.aggregate({
                where,
                _sum: { pagesCrawled: true },
            }),
            prisma.scheduleExecution.aggregate({
                where,
                _sum: { resourcesFound: true },
            }),
        ]);

        return {
            total_executions: total,
            successful_executions: successful,
            failed_executions: failed,
            running_executions: running,
            avg_duration: avgDuration._avg.duration ? Math.round(avgDuration._avg.duration) : null,
            total_pages_crawled: totalPages._sum.pagesCrawled || 0,
            total_resources_found: totalResources._sum.resourcesFound || 0,
        };
    }

    async getRecentExecutions(limit: number = 10, scheduleId?: number): Promise<any[]> {
        const where: any = {};
        if (scheduleId) {
            where.scheduleId = scheduleId;
        }

        const executions = await prisma.scheduleExecution.findMany({
            where,
            include: {
                schedule: {
                    select: {
                        name: true,
                    },
                },
            },
            orderBy: { startedAt: 'desc' },
            take: limit,
        });

        return executions.map((exec: any) => ({
            ...exec,
            schedule_name: exec.schedule.name,
        }));
    }

    async getSchedulePerformance(): Promise<any[]> {
        const schedules = await prisma.crawlSchedule.findMany({
            include: {
                scheduleExecutions: {
                    select: {
                        status: true,
                        duration: true,
                        startedAt: true,
                    },
                },
            },
        });

        return schedules.map((schedule: any) => {
            const executions = schedule.scheduleExecutions;
            const completed = executions.filter((e: any) => e.status === 'completed');
            const failed = executions.filter((e: any) => e.status === 'failed');
            const avgDuration = completed.length > 0
                ? Math.round(completed.reduce((sum: number, e: any) => sum + (e.duration || 0), 0) / completed.length)
                : null;
            const lastRun = executions.length > 0
                ? executions.reduce((latest: Date, e: any) => e.startedAt > latest ? e.startedAt : latest, executions[0].startedAt)
                : null;

            return {
                id: schedule.id,
                name: schedule.name,
                start_url: schedule.startUrl,
                total_runs: executions.length,
                successful_runs: completed.length,
                failed_runs: failed.length,
                avg_duration: avgDuration,
                last_run: lastRun,
            };
        }).sort((a: any, b: any) => {
            if (!a.last_run && !b.last_run) return 0;
            if (!a.last_run) return 1;
            if (!b.last_run) return -1;
            return b.last_run.getTime() - a.last_run.getTime();
        });
    }

    async exportCronHistory(filters: any): Promise<any[]> {
        const where: any = {};

        if (filters.scheduleId) {
            where.scheduleId = filters.scheduleId;
        }
        if (filters.startDate) {
            where.startedAt = { gte: new Date(filters.startDate) };
        }
        if (filters.endDate) {
            where.startedAt = { ...where.startedAt, lte: new Date(filters.endDate) };
        }

        const executions = await prisma.scheduleExecution.findMany({
            where,
            include: {
                schedule: {
                    select: {
                        name: true,
                        startUrl: true,
                        mode: true,
                        allowSubdomains: true,
                        maxConcurrency: true,
                    },
                },
            },
            orderBy: { startedAt: 'desc' },
        });

        return executions.map((exec: any) => ({
            ...exec,
            schedule_name: exec.schedule.name,
            start_url: exec.schedule.startUrl,
            mode: exec.schedule.mode,
            allow_subdomains: exec.schedule.allowSubdomains,
            max_concurrency: exec.schedule.maxConcurrency,
        }));
    }

    async logCrawlMessage(sessionId: number, message: string, level: string = 'info'): Promise<void> {
        await prisma.crawlLog.create({
            data: {
                sessionId,
                message,
                level,
            },
        });
    }

    private mapSession(session: any): CrawlSession {
        return {
            id: session.id,
            projectId: session.projectId,
            startUrl: session.startUrl,
            allowSubdomains: session.allowSubdomains,
            maxConcurrency: session.maxConcurrency,
            mode: session.mode,
            scheduleId: session.scheduleId,
            userId: session.userId,
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            totalPages: session.totalPages,
            totalResources: session.totalResources,
            duration: session.duration,
            status: session.status,
        };
    }

    private mapSchedule(schedule: any): CrawlSchedule {
        return {
            id: schedule.id,
            name: schedule.name,
            description: schedule.description,
            startUrl: schedule.startUrl,
            allowSubdomains: schedule.allowSubdomains,
            maxConcurrency: schedule.maxConcurrency,
            mode: schedule.mode,
            cronExpression: schedule.cronExpression,
            enabled: schedule.enabled,
            userId: schedule.userId,
            createdAt: schedule.createdAt,
            lastRun: schedule.lastRun,
            nextRun: schedule.nextRun,
            totalRuns: schedule.totalRuns,
            successfulRuns: schedule.successfulRuns,
            failedRuns: schedule.failedRuns,
        };
    }

    private mapExecution(execution: any): ScheduleExecution {
        return {
            id: execution.id,
            scheduleId: execution.scheduleId,
            sessionId: execution.sessionId,
            startedAt: execution.startedAt,
            completedAt: execution.completedAt,
            status: execution.status,
            errorMessage: execution.errorMessage,
            pagesCrawled: execution.pagesCrawled,
            resourcesFound: execution.resourcesFound,
            duration: execution.duration,
        };
    }
}
