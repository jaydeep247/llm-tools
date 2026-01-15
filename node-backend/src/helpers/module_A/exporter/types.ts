/**
 * Export data format
 */
export interface ExportData {
    url: string;
    title: string;
    metaDescription: string;
    statusCode: number;
    contentType: string;
    wordCount: number;
    issues: string[];
    timestamp: string;
}

/**
 * Export format type
 */
export type ExportFormat = 'csv' | 'json' | 'xlsx';

/**
 * Export options
 */
export interface ExportOptions {
    format: ExportFormat;
    includeIssues: boolean;
    includeMetrics: boolean;
    includeLinks: boolean;
}
