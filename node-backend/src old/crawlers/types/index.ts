/**
 * Crawler Types and Interfaces
 */

export type CrawlOptions = {
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    perHostDelayMs: number;
    denyParamPrefixes: string[];
    mode?: 'html';
    scheduleId?: number;
    userId?: number;
    runAudits?: boolean;
    auditDevice?: 'mobile' | 'desktop';
    captureLinkDetails?: boolean;
    sessionId?: number;
    clearSeoCache?: boolean;
};

export type CrawlEvents = {
    onLog?: (message: string) => void;
    onPage?: (url: string) => void;
    onDone?: (count: number) => void;
    onAuditStart?: (url: string) => void;
    onAuditComplete?: (url: string, success: boolean, lcp?: number, tbt?: number, cls?: number, performanceScore?: number) => void;
    onAuditResults?: (results: any) => void;
    onAuditsComplete?: () => void;
    onSessionStart?: (sessionId: number) => void;
};
