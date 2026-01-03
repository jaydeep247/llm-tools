export interface CrawlSession {
    id: number;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: string;
    scheduleId?: number;
    userId?: number;
    startedAt: string;
    completedAt?: string;
    totalPages: number;
    totalResources: number;
    duration: number;
    status: 'running' | 'completed' | 'failed' | 'auditing';
}

export interface Page {
    id: number;
    sessionId: number;
    url: string;
    title: string;
    titleLength: number;
    titlePixelWidth?: number;
    description: string;
    descriptionLength: number;
    descriptionPixelWidth?: number;
    contentType: string;
    lastModified: string | null;
    statusCode: number;
    responseTime: number;
    wordCount: number;
    sizeBytes?: number;
    timestamp: string;
    success: boolean;
    errorMessage: string | null;
    indexable?: boolean;
    indexabilityStatus?: string;
    metaKeywords?: string;
    metaKeywordsLength?: number;
    metaRobots?: string;
    xRobotsTag?: string;
    metaRefresh?: string;
    canonicalUrl?: string;
    relNext?: string;
    relPrev?: string;
    httpRelNext?: string;
    httpRelPrev?: string;
    headingTags?: string; // JSON string with heading counts
}

export interface Resource {
    id: number;
    sessionId: number;
    pageId: number | null;
    url: string;
    resourceType: 'css' | 'js' | 'image' | 'external';
    title: string;
    description: string;
    contentType: string;
    statusCode?: number | null;
    responseTime?: number | null;
    timestamp: string;
}

export interface SitemapDiscovery {
    id: number;
    sessionId: number;
    sitemapUrl: string;
    discoveredUrls: number;
    lastModified: string;
    success: boolean;
    errorMessage: string | null;
}

export interface SitemapUrl {
    id: number;
    sessionId: number;
    url: string;
    lastModified: string | null;
    changeFrequency: string | null;
    priority: string | null;
    discoveredAt: string;
}

export interface CrawlSchedule {
    id: number;
    name: string;
    description: string;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: 'html' | 'js' | 'auto';
    cronExpression: string;
    enabled: boolean;
    userId?: number;
    createdAt: string;
    lastRun?: string;
    nextRun?: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
}

export interface ScheduleExecution {
    id: number;
    scheduleId: number;
    sessionId: number;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed' | 'auditing';
    errorMessage?: string;
    pagesCrawled: number;
    resourcesFound: number;
    duration: number;
}

export interface AuditSchedule {
    id: number;
    name: string;
    description: string;
    urls: string; // JSON string of URLs array
    device: 'mobile' | 'desktop';
    cronExpression: string;
    enabled: boolean;
    userId?: number;
    createdAt: string;
    lastRun?: string;
    nextRun?: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
}

export interface AuditExecution {
    id: number;
    scheduleId: number;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed' | 'auditing';
    errorMessage?: string;
    urlsProcessed: number;
    urlsSuccessful: number;
    urlsFailed: number;
    duration: number;
}

export interface AEOSchedule {
    id: number;
    name: string;
    description: string;
    startUrl: string;
    allowSubdomains: boolean;
    runAudits: boolean;
    auditDevice: 'mobile' | 'desktop';
    captureLinkDetails: boolean;
    cronExpression: string;
    enabled: boolean;
    createdAt: string;
    lastRun?: string;
    nextRun?: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastAeoScore?: number;
    averageAeoScore?: number;
}

export interface AEOExecution {
    id: number;
    scheduleId: number;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed' | 'auditing';
    pagesAnalyzed: number;
    averageAeoScore?: number;
    duration?: number;
    errorMessage?: string;
}

export interface User {
    id: number;
    email: string;
    passwordHash: string;
    name: string | null;
    createdAt: string;
    lastLogin: string | null;
    isActive: boolean;
    role: 'user' | 'admin' | 'premium';
}

export interface UserSettings {
    userId: number;
    openaiApiKey: string | null;
    psiApiKey: string | null;
    maxCrawlsPerDay: number;
    emailNotifications: boolean;
}

export interface UserUsage {
    id: number;
    userId: number;
    actionType: string; // 'crawl' | 'audit' | 'aeo_analysis'
    timestamp: string;
    creditsUsed: number;
}

export interface Link {
    id: number;
    sessionId: number;
    sourcePageId: number;
    targetPageId: number | null;
    url: string;
    text: string;
    type: 'internal' | 'external' | 'resource';
    status: 'valid' | 'broken' | 'redirect';
    statusCode: number | null;
    timestamp: string;
}

export interface AuditResult {
    id: number;
    executionId: number;
    url: string;
    performanceScore: number;
    accessibilityScore: number;
    bestPracticesScore: number;
    seoScore: number;
    pwaScore: number | null;
    timestamp: string;
    fullReport?: string; // JSON string
}

export interface CrawlLog {
    id: number;
    sessionId: number;
    message: string;
    level: string;
    timestamp: string;
}
