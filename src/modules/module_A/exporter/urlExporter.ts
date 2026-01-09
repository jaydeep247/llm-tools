import type { ExportData } from './types.js';

/**
 * Format data for export
 * This function prepares crawl data for export in various formats
 */
export function formatExportData(pages: any[]): ExportData[] {
    return pages.map(page => {
        const issues: string[] = [];
        
        // Check for common SEO issues
        if (!page.title || page.title === 'No title') {
            issues.push('Missing title');
        } else if (page.titleLength < 30) {
            issues.push('Title too short');
        } else if (page.titleLength > 60) {
            issues.push('Title too long');
        }
        
        if (!page.description || page.description === 'No description') {
            issues.push('Missing meta description');
        } else if (page.descriptionLength < 120) {
            issues.push('Meta description too short');
        } else if (page.descriptionLength > 160) {
            issues.push('Meta description too long');
        }
        
        if (page.statusCode >= 400) {
            issues.push(`HTTP error: ${page.statusCode}`);
        }
        
        if (page.wordCount < 300) {
            issues.push('Thin content');
        }
        
        if (!page.success) {
            issues.push(`Crawl failed: ${page.errorMessage || 'Unknown error'}`);
        }
        
        return {
            url: page.url,
            title: page.title || '',
            metaDescription: page.description || '',
            statusCode: page.statusCode,
            contentType: page.contentType || '',
            wordCount: page.wordCount || 0,
            issues,
            timestamp: page.timestamp
        };
    });
}

/**
 * Convert data to CSV format
 */
export function convertToCSV(data: ExportData[]): string {
    if (data.length === 0) return '';
    
    // CSV headers
    const headers = ['URL', 'Title', 'Meta Description', 'Status Code', 'Content Type', 'Word Count', 'Issues', 'Timestamp'];
    
    // CSV rows
    const rows = data.map(item => [
        escapeCSV(item.url),
        escapeCSV(item.title),
        escapeCSV(item.metaDescription),
        item.statusCode.toString(),
        escapeCSV(item.contentType),
        item.wordCount.toString(),
        escapeCSV(item.issues.join('; ')),
        escapeCSV(item.timestamp)
    ]);
    
    // Combine headers and rows
    const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    return csv;
}

/**
 * Escape CSV field
 */
function escapeCSV(field: string): string {
    if (!field) return '""';
    
    // If field contains comma, quote, or newline, wrap in quotes and escape quotes
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
    }
    
    return `"${field}"`;
}

/**
 * Convert data to JSON format
 */
export function convertToJSON(data: ExportData[]): string {
    return JSON.stringify(data, null, 2);
}

/**
 * Export URLs with issues
 */
export function exportURLsWithIssues(data: ExportData[]): ExportData[] {
    return data.filter(item => item.issues.length > 0);
}

/**
 * Group issues by type
 */
export function groupIssuesByType(data: ExportData[]): Record<string, ExportData[]> {
    const grouped: Record<string, ExportData[]> = {};
    
    for (const item of data) {
        for (const issue of item.issues) {
            if (!grouped[issue]) {
                grouped[issue] = [];
            }
            grouped[issue].push(item);
        }
    }
    
    return grouped;
}

/**
 * Get export statistics
 */
export function getExportStats(data: ExportData[]): {
    totalPages: number;
    pagesWithIssues: number;
    totalIssues: number;
    issueTypes: Record<string, number>;
} {
    const pagesWithIssues = data.filter(item => item.issues.length > 0);
    const issueTypes: Record<string, number> = {};
    
    let totalIssues = 0;
    for (const item of data) {
        totalIssues += item.issues.length;
        for (const issue of item.issues) {
            issueTypes[issue] = (issueTypes[issue] || 0) + 1;
        }
    }
    
    return {
        totalPages: data.length,
        pagesWithIssues: pagesWithIssues.length,
        totalIssues,
        issueTypes
    };
}
