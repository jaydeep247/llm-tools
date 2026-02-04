export interface CrawlSession {
    id: number;
    projectId: string;
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
    status: 'running' | 'completed' | 'failed' | 'auditing' | 'cancelled';
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
    averageWordsPerSentence?: number;
    fleschReadingEase?: number;
    readabilityLevel?: string;
    crawlDepth?: number;
    folderDepth?: number;
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
    amphtmlUrl?: string;
    mobileAlternateUrl?: string;
    transferredBytes?: number;
    totalTransferredBytes?: number;
    co2Mg?: number;
    carbonRating?: string;
    headingTags?: string; // JSON string with heading counts
    linkScore?: number; // SEO Link Score (0-100)
    uniqueInlinks?: number; // Count of unique pages linking to this page
    uniqueJsInlinks?: number; // Count of unique pages linking via JS-rendered links
    percentOfTotal?: number; // Percentage of all internal links pointing to this page
    uniqueOutlinks?: number; // Count of unique distinct destination URLs this page links to
    uniqueJsOutlinks?: number; // Count of unique JS-rendered outbound links (not in raw HTML)
    uniqueExternalOutlinks?: number; // Count of unique external domain links on this page (from HTML)
    uniqueExternalJsOutlinks?: number; // Count of unique external links created/revealed via JavaScript
    closestDuplicateUrl?: string; // URL of the most similar page (closest near-duplicate match)
    closestDuplicateSimilarity?: number; // Similarity score (0.0-1.0) with the closest match
    nearDuplicateCount?: number; // Number of pages with similarity >= 0.75
    spellingErrors?: number; // Count of spelling mistakes detected in visible text
    grammarErrors?: number; // Count of grammatical mistakes found in page text
    redirectUrl?: string; // The destination URL where a user or search engine is sent
    redirectType?: string; // The method used to perform the redirect (301, 302, 307, meta-refresh, javascript)
    cookies?: string; // Cookies set by the server (JSON string)
    language?: string; // Language of the page from headers or HTML
    httpVersion?: string; // HTTP protocol version (HTTP/1.1, HTTP/2, HTTP/3)
    urlEncodedAddress?: string; // The percent-encoded (URL-safe) version of the URL
    contentHash?: string; // SHA-256 hash of normalized page content (visible text) for change detection and duplicate identification
    metaDescription?: string; // Meta description tag content (different from description field)
    ogTitle?: string; // Open Graph title
    ogDescription?: string; // Open Graph description
    ogImage?: string; // Open Graph image URL
    // Semantic Analysis Fields (Module A)
    closestSemanticallySimilarAddress?: string; // URL of the most semantically similar page
    semanticSimilarityScore?: number; // Similarity score (0.0-1.0) with closest semantically similar page
    noSemanticallySimilar?: number; // Count of pages with similarity >= 0.80
    semanticRelevanceScore?: number; // Relevance score (0.0-1.0) to the page's intended topic
    // Title Detection Fields (from page_metrics table)
    titleStatus?: 'OK' | 'Missing' | 'Duplicate'; // Status of the page title
    duplicateTitleCount?: number; // Number of pages with the same title
    duplicateWith?: string[]; // Array of URLs with duplicate titles
    // Meta Description Detection Fields (from page_metrics table)
    metaDescriptionStatus?: 'OK' | 'Missing' | 'Duplicate'; // Status of the meta description
    duplicateMetaDescriptionCount?: number; // Number of pages with the same meta description
    duplicateMetaDescriptionWith?: string[]; // Array of URLs with duplicate meta descriptions
    // Canonical Validation Fields (from page_metrics table)
    // Note: canonicalUrl already exists above in the Page interface, so we only add validation fields here
    canonicalValidationStatus?: 'Valid' | 'Invalid' | 'Missing' | 'Redirect' | 'Error' | 'Not Found' | 'Blocked'; // Validation status
    canonicalValidationMessage?: string; // Detailed validation message
    // Table Extraction Fields (from page_metrics table)
    tableCount?: number; // Number of HTML tables found on the page
    tableData?: string; // JSON string containing extracted table data
    hasTables?: boolean; // Whether the page contains any HTML tables
    // FAQ Extraction Fields (from page_metrics table)
    faqCount?: number; // Number of FAQs found on the page
    faqData?: string; // JSON string containing extracted FAQ data
    hasFaqs?: boolean; // Whether the page contains any FAQs
    faqScore?: number; // FAQ detection confidence score (0-10)
    faqDetectionMethod?: string; // Detection method used (schema, html, heuristic, accordion)
    faqSchemaPresent?: boolean; // Whether FAQ schema markup is present
    // Mixed Content Detection Fields (from page_metrics table)
    hasMixedContent?: boolean; // Whether the page has mixed content (HTTP resources on HTTPS page)
    mixedContentSeverity?: 'none' | 'warning' | 'critical'; // Severity level
    mixedContentData?: string; // JSON string containing mixed content resources
    activeMixedContentCount?: number; // Count of critical mixed content (script, CSS, iframe)
    passiveMixedContentCount?: number; // Count of warning mixed content (images, video, audio)
    totalInsecureResources?: number; // Total count of HTTP resources
    // Header Structure Mapping Fields (from page_metrics table)
    headerStructureData?: string; // JSON string containing header structure mapping
    headerStructureIssues?: string; // JSON string containing header structure issues
    // Viewport Meta Fields (from page_metrics table)
    viewportPresent?: boolean; // Whether viewport meta tag is present
    viewportContent?: string; // Viewport meta tag content
    viewportStatus?: 'ok' | 'warning' | 'error' | 'missing'; // Viewport validation status
    // Structured Data Fields (from page_metrics table)
    structuredDataPresent?: boolean; // Whether structured data is present
    structuredDataFormat?: string; // Format: json-ld, microdata, or combinations
    structuredDataTypes?: string; // JSON array of schema types
    structuredDataPriorityType?: string; // Primary/priority schema type
    // Page Size Measurement Fields (from page_metrics table)
    pageSizeBytes?: number; // Total page size in bytes (HTML + resources)
    pageSizeStatus?: 'Small' | 'Medium' | 'Large'; // Size status classification
    htmlSizeBytes?: number; // HTML document size in bytes only
    htmlSizeStatus?: 'Good' | 'Warning' | 'Large'; // HTML size status classification
    totalResourceSizeBytes?: number; // Total size of external resources in bytes
    resourceSizeBreakdown?: string; // JSON string containing individual resource sizes
    // Word Count Analysis Fields (from wordcount_analysis table)
    totalWordCount?: number; // Total number of words in the page HTML text (excluding script, style, noscript tags)
    visibleWordCount?: number; // Number of words actually visible to users (main content)
    uniqueWordCount?: number; // Number of distinct words used in visible content
    textToHtmlRatio?: number; // Percentage of text content compared to total HTML size
    sentenceCount?: number; // Number of sentences in visible text
    paragraphCount?: number; // Number of paragraph-level text blocks
    averageSentenceLength?: number; // Average number of words per sentence
    averageParagraphLength?: number; // Average number of words per paragraph
    keywordDensity?: number; // Keyword density percentage (optional, for target keyword)
    // Advanced Word Count Analysis fields (from wordcount_analysis table)
    thinContent?: boolean; // Whether page has thin content (low word count or low uniqueness)
    thinContentReason?: string | null; // Reason for thin content: 'Low word count' or 'Low uniqueness'
    duplicateContent?: boolean; // Whether page content is duplicate of another page
    duplicateWithUrls?: string[]; // Array of URLs that have duplicate content
    sectionWordCountMapping?: Record<string, number>; // Mapping of section headings to word counts
    sectionWordCountBreakdown?: Record<string, number>; // Percentage distribution of words across sections
    headingWordCountMapping?: Record<string, number>; // Mapping of headings (H1-H6) to word counts under each heading
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
    status: 'running' | 'completed' | 'failed' | 'auditing' | 'cancelled';
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
    status: 'running' | 'completed' | 'failed' | 'auditing' | 'cancelled';
    errorMessage?: string;
    urlsProcessed: number;
    urlsSuccessful: number;
    urlsFailed: number;
    duration: number;
}

export interface SerpSnapshot {
  id: number;
  keyword: string;
  targetDomain: string;
  normalizedDomain: string;
  searchEngine: string;
  location: string;
  device: string;
  maxResults: number;
  runAt: string;
  position: number | null;
  rankingUrl: string | null;
  rankStatus: 'ranked' | 'not_ranked' | 'lost';
  change: number | null;
  changeLabel: string | null;
  intent: string;
  topCompetitors: { domain: string; count: number }[];
  serpFeatures: {
    featured_snippet: boolean;
    paa: boolean;
    video: boolean;
    images: boolean;
  };
  serp: { position: number; url: string; title: string }[];
  sessionId?: number | null;
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
    status: 'running' | 'completed' | 'failed' | 'auditing' | 'cancelled';
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
