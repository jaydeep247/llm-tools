/**
 * Module A - SEO Analysis Modules
 * 
 * This module provides comprehensive SEO analysis functionality organized into
 * logical categories for better maintainability and extensibility.
 */

// Page Metrics - Title, meta tags, headers, status codes
export * from './pageMetrics/index.js';

// Content Analysis - Word count, readability, text structure
export * from './contentAnalysis/index.js';

// Link Checker - Broken links detection
export * from './linkChecker/index.js';

// Redirects Audit - Redirect detection and validation
export * from './redirectsAudit/index.js';

// Exporter - Data export functionality
export * from './exporter/index.js';

// Link Extractor - Link extraction and validation
export * from './linkExtractor/index.js';

// Resource Collector - CSS, JS, images, external links
export * from './resourceCollector/index.js';

// Link Analysis - Detailed link metadata
export * from './linkAnalysis/index.js';
