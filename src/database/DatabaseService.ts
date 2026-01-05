import { Logger } from '../logging/Logger.js';
import { getPool } from './dbConnection.js';
import { UserRepository } from './repositories/userRepository.js';
import { CrawlRepository } from './repositories/crawlRepository.js';
import { PageRepository } from './repositories/pageRepository.js';
import { AuditRepository } from './repositories/auditRepository.js';
import type {
    User, UserSettings, UserUsage,
    CrawlSession, CrawlSchedule, ScheduleExecution,
    Page, Resource, Link, AuditSchedule, AuditResult, AuditExecution,
    CrawlLog
} from './types.js';

export type {
    User, UserSettings, UserUsage,
    CrawlSession, CrawlSchedule, ScheduleExecution,
    Page, Resource, Link, AuditSchedule, AuditResult, AuditExecution,
    CrawlLog
};

export class DatabaseService {
    private static instance: DatabaseService;
    private logger: Logger;

    // Repositories
    public users: UserRepository;
    public crawls: CrawlRepository;
    public pages: PageRepository;
    public audits: AuditRepository;

    private constructor() {
        this.logger = Logger.getInstance();
        const pool = getPool();

        this.users = new UserRepository(pool);
        this.crawls = new CrawlRepository(pool);
        this.pages = new PageRepository(pool);
        this.audits = new AuditRepository(pool);
    }

    public static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    // ==================== Crawl Session Methods ====================
    async createCrawlSession(data: Omit<CrawlSession, 'id'>): Promise<number> {
        return this.crawls.createCrawlSession(data);
    }

    async updateCrawlSession(id: number, updates: Partial<CrawlSession>): Promise<void> {
        return this.crawls.updateCrawlSession(id, updates);
    }

    async getCrawlSession(id: number): Promise<CrawlSession | null> {
        return this.crawls.getCrawlSession(id);
    }

    async getLatestCrawlSession(): Promise<CrawlSession | null> {
        return this.crawls.getLatestCrawlSession();
    }

    async getCrawlSessions(limit: number = 50, offset: number = 0, scheduleId?: number, userId?: number): Promise<CrawlSession[]> {
        return this.crawls.getCrawlSessions(limit, offset, scheduleId, userId);
    }

    async getUserCrawlSessionsWithResults(userId: number, limit: number = 50, offset: number = 0): Promise<any[]> {
        return this.crawls.getUserCrawlSessionsWithResults(userId, limit, offset);
    }

    async shareSessionWithUser(sessionId: number, userId: number): Promise<void> {
        return this.crawls.shareSessionWithUser(sessionId, userId);
    }

    async getCrawlLogs(sessionId: number): Promise<any[]> {
        return this.crawls.getCrawlLogs(sessionId);
    }

    async getLatestSessionByUrl(url: string, userId: number): Promise<CrawlSession | null> {
        return this.crawls.getLatestSessionByUrl(url, userId);
    }

    async getSessionByUrl(url: string, userId: number): Promise<CrawlSession | null> {
        return this.getLatestSessionByUrl(url, userId);
    }

    async getRunningSessionByUrl(url: string, userId?: number): Promise<CrawlSession | null> {
        return this.crawls.getRunningSessionByUrl(url, userId);
    }

    async getUserSessionsWithShares(userId: number, limit: number = 100, offset: number = 0): Promise<any[]> {
        return this.crawls.getUserSessionsWithShares(userId, limit, offset);
    }

    async getAverageDurationForUrl(url: string, userId?: number): Promise<number> {
        return this.crawls.getAverageDurationForUrl(url, userId);
    }

    async clearAllData(): Promise<void> {
        return this.crawls.clearAllData();
    }

    async logCrawlMessage(sessionId: number, message: string, level: string = 'info'): Promise<void> {
        return this.crawls.logCrawlMessage(sessionId, message, level);
    }

    async saveCrawlLog(sessionId: number, message: string, level: string = 'info'): Promise<void> {
        return this.crawls.logCrawlMessage(sessionId, message, level);
    }

    // ==================== Crawl Schedule Methods ====================
    async insertCrawlSchedule(data: Omit<CrawlSchedule, 'id'>): Promise<number> {
        return this.crawls.insertCrawlSchedule(data);
    }

    async updateCrawlSchedule(id: number, updates: Partial<CrawlSchedule>): Promise<void> {
        return this.crawls.updateCrawlSchedule(id, updates);
    }

    async deleteCrawlSchedule(id: number): Promise<void> {
        return this.crawls.deleteCrawlSchedule(id);
    }

    async getCrawlSchedule(id: number): Promise<CrawlSchedule | null> {
        return this.crawls.getCrawlSchedule(id);
    }

    async getAllCrawlSchedules(): Promise<CrawlSchedule[]> {
        return this.crawls.getAllCrawlSchedules();
    }

    async getEnabledCrawlSchedules(): Promise<CrawlSchedule[]> {
        return this.crawls.getEnabledCrawlSchedules();
    }

    async insertScheduleExecution(data: any): Promise<number> {
        return this.crawls.insertScheduleExecution(data);
    }

    async updateScheduleExecution(id: number, updates: any): Promise<void> {
        return this.crawls.updateScheduleExecution(id, updates);
    }

    async getScheduleExecutions(scheduleId: number, limit: number = 50): Promise<ScheduleExecution[]> {
        return this.crawls.getScheduleExecutions(scheduleId, limit);
    }

    async getScheduleExecutionsWithDetails(filters: any, limit: number = 100, offset: number = 0): Promise<any> {
        return this.crawls.getScheduleExecutionsWithDetails(filters, limit, offset);
    }

    async getExecutionWithSession(executionId: number): Promise<any> {
        return this.crawls.getExecutionWithSession(executionId);
    }

    async getScheduleStats(scheduleId?: number): Promise<any> {
        return this.crawls.getScheduleStats(scheduleId);
    }

    async getRecentExecutions(limit: number = 10, scheduleId?: number): Promise<any[]> {
        return this.crawls.getRecentExecutions(limit, scheduleId);
    }

    async getSchedulePerformance(): Promise<any[]> {
        return this.crawls.getSchedulePerformance();
    }

    async exportCronHistory(filters: any): Promise<any[]> {
        return this.crawls.exportCronHistory(filters);
    }

    async getAllScheduleExecutions(limit: number = 100): Promise<any[]> {
        return this.crawls.getAllScheduleExecutions(limit);
    }

    // ==================== Page & Resource Methods ====================
    async insertPage(data: Omit<Page, 'id'>): Promise<number> {
        return this.pages.insertPage(data);
    }

    async insertResource(data: Omit<Resource, 'id'>): Promise<number> {
        return this.pages.insertResource(data);
    }

    async upsertResource(data: Omit<Resource, 'id'>): Promise<number> {
        return this.pages.insertResource(data);
    }

    async getPages(sessionId?: number, limit: number = 1000, offset: number = 0): Promise<Page[]> {
        return this.pages.getPages(sessionId, limit, offset);
    }

    async getResources(sessionId?: number, resourceType?: string, limit: number = 1000, offset: number = 0): Promise<Resource[]> {
        return this.pages.getResources(sessionId, resourceType, limit, offset);
    }

    async insertLinks(links: any[]): Promise<void> {
        return this.pages.insertLinks(links);
    }

    async getPageCount(sessionId?: number): Promise<number> {
        return this.pages.getPageCount(sessionId);
    }

    async getResourceCount(sessionId?: number): Promise<number> {
        return this.pages.getResourceCount(sessionId);
    }

    async getResourceTypeStats(sessionId?: number): Promise<any[]> {
        return this.pages.getResourceTypeStats(sessionId);
    }

    async getLinkAnalysis(sessionId?: number): Promise<any[]> {
        return this.pages.getLinkAnalysis(sessionId);
    }

    async getAllLinksForSession(sessionId: number): Promise<any[]> {
        return this.pages.getAllLinksForSession(sessionId);
    }

    async getLinksByPage(pageId: number, type: 'in' | 'out' | 'all' = 'out', limit: number = 100): Promise<any[]> {
        return this.pages.getLinksByPage(pageId, type, limit);
    }

    async getLinkStats(sessionId: number): Promise<any> {
        return this.pages.getLinkStats(sessionId);
    }

    async getPageLinkStats(sessionId: number): Promise<any[]> {
        return this.pages.getPageLinkStats(sessionId);
    }

    async getLinkRelationships(sessionId: number, limit: number = 50): Promise<any[]> {
        return this.pages.getLinkRelationships(sessionId, limit);
    }

    async resolveTargetPageIds(sessionId: number): Promise<number> {
        return this.pages.resolveTargetPageIds(sessionId);
    }

    async updatePageCarbon(pageId: number, data: { transferredBytes: number, totalTransferredBytes: number, co2Mg: number, carbonRating: string }): Promise<void> {
        return this.pages.updatePageCarbon(pageId, data);
    }

    // ==================== SEO and Sitemap Methods ====================
    async getSeoData(url: string): Promise<any | null> {
        return this.pages.getSeoData(url);
    }

    async saveSeoData(data: { url: string, parentText?: string, keywords: string[], language?: string, expiresAt: string }): Promise<void> {
        return this.pages.saveSeoData(data);
    }

    async cacheSeoData(url: string, data: { parentText?: string, keywords: string[], language?: string }): Promise<void> {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6); // 6 months default
        return this.saveSeoData({
            url,
            ...data,
            expiresAt: expiresAt.toISOString()
        });
    }

    async insertSitemapDiscovery(data: { sessionId: number, sitemapUrl: string, discoveredUrls: number, lastModified: string, success: boolean, errorMessage?: string }): Promise<number> {
        return this.pages.insertSitemapDiscovery(data);
    }

    async insertSitemapUrl(data: { sessionId: number, url: string, lastModified?: string, changeFrequency?: string, priority?: string }): Promise<void> {
        return this.pages.insertSitemapUrl(data);
    }

    async getUncrawledSitemapUrls(sessionId: number): Promise<any[]> {
        return this.pages.getUncrawledSitemapUrls(sessionId);
    }

    async markSitemapUrlAsCrawled(sessionId: number, url: string): Promise<void> {
        return this.pages.markSitemapUrlAsCrawled(sessionId, url);
    }

    async getSitemapUrls(sessionId: number): Promise<any[]> {
        return this.pages.getSitemapUrls(sessionId);
    }

    async getSitemapDiscoveries(sessionId: number): Promise<any[]> {
        return this.pages.getSitemapDiscoveries(sessionId);
    }

    // ==================== User Management Methods ====================
    async createUser(data: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<number> {
        return this.users.createUser(data);
    }

    async getUserById(id: number): Promise<User | null> {
        return this.users.getUserById(id);
    }

    async getUserByEmail(email: string): Promise<User | null> {
        return this.users.getUserByEmail(email);
    }

    async updateUser(id: number, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<void> {
        return this.users.updateUser(id, updates);
    }

    async deleteUser(id: number): Promise<void> {
        return this.users.deleteUser(id);
    }

    async recordUserUsage(userId: number, actionType: string, creditsUsed: number = 1): Promise<void> {
        return this.users.recordUserUsage(userId, actionType, creditsUsed);
    }

    async getUserSettings(userId: number): Promise<UserSettings | null> {
        return this.users.getUserSettings(userId);
    }

    async updateUserSettings(userId: number, updates: Partial<Omit<UserSettings, 'userId'>>): Promise<void> {
        return this.users.updateUserSettings(userId, updates);
    }

    async getUserUsage(userId: number, actionType?: string, limit: number = 100): Promise<UserUsage[]> {
        return this.users.getUserUsage(userId, actionType, limit);
    }

    async getTodayUsageCount(userId: number, actionType: string): Promise<number> {
        return this.users.getTodayUsageCount(userId, actionType);
    }

    async getUserUsageStats(userId: number, since?: string): Promise<any> {
        return this.users.getUserUsageStats(userId, since);
    }

    async updateUserLastLogin(userId: number): Promise<void> {
        return this.users.updateUserLastLogin(userId);
    }

    // ==================== Audit Methods ====================
    async insertAuditSchedule(schedule: Omit<AuditSchedule, 'id'>): Promise<number> {
        return this.audits.insertAuditSchedule(schedule);
    }

    async insertAuditExecution(execution: Omit<AuditExecution, 'id'>): Promise<number> {
        return this.audits.insertAuditExecution(execution);
    }

    async updateAuditExecution(id: number, updates: Partial<AuditExecution>): Promise<void> {
        return this.audits.updateAuditExecution(id, updates);
    }

    async getAuditExecutions(scheduleId: number, limit: number = 50): Promise<AuditExecution[]> {
        return this.audits.getAuditExecutions(scheduleId, limit);
    }

    async getAllAuditExecutions(limit: number = 100): Promise<AuditExecution[]> {
        return this.audits.getAllAuditExecutions(limit);
    }

    async getAuditResultsByUrl(url: string, device: string, limit: number = 5): Promise<any[]> {
        return this.audits.getAuditResultsByUrl(url, device, limit);
    }

    async insertAuditResult(data: any): Promise<number> {
        return this.audits.insertAuditResult(data);
    }

    async updateAuditResult(id: number, updates: any): Promise<void> {
        return this.audits.updateAuditResult(id, updates);
    }

    async getAuditResult(url: string, device: string): Promise<any | null> {
        return this.audits.getAuditResult(url, device);
    }

    async getAuditResultById(id: number): Promise<any | null> {
        return this.audits.getAuditResultById(id);
    }

    async getAuditResults(device?: string, limit: number = 100): Promise<any[]> {
        return this.audits.getAuditResults(device, limit);
    }

    async getAuditResultsBySessionId(sessionId: number, device?: string, limit: number = 200): Promise<any[]> {
        return this.audits.getAuditResultsBySessionId(sessionId, device, limit);
    }

    async updateAuditSchedule(id: number, updates: Partial<AuditSchedule>): Promise<void> {
        return this.audits.updateAuditSchedule(id, updates);
    }

    async deleteAuditSchedule(id: number): Promise<void> {
        return this.audits.deleteAuditSchedule(id);
    }

    async getAuditSchedule(id: number): Promise<AuditSchedule | null> {
        return this.audits.getAuditSchedule(id);
    }

    async getAllAuditSchedules(limit: number = 100): Promise<AuditSchedule[]> {
        return this.audits.getAllAuditSchedules(limit);
    }

    async getEnabledAuditSchedules(): Promise<AuditSchedule[]> {
        return this.audits.getEnabledAuditSchedules();
    }

    async hasAuditsForSession(sessionId: number): Promise<boolean> {
        return this.audits.hasAuditsForSession(sessionId);
    }

    async getAuditProgressBySession(sessionId: number): Promise<{ total: number, completed: number }> {
        return this.audits.getAuditProgressBySession(sessionId);
    }

    async insertAEOAnalysisResult(result: any): Promise<number> {
        return this.audits.insertAEOAnalysisResult(result);
    }

    async saveAeoAnalysisResult(result: any): Promise<number> {
        return this.audits.saveAeoAnalysisResult(result);
    }

    async getAeoAnalysisResultBySessionId(sessionId: number): Promise<any | null> {
        return this.audits.getAeoAnalysisResultBySessionId(sessionId);
    }
}

// Export a getter for the singleton instance
export const getDatabase = () => DatabaseService.getInstance();
export default DatabaseService;
