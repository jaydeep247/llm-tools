'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Clock, Globe, CheckCircle, XCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CrawlLogger, DiscoveredPages, CrawlStatusHeader, CrawlStatusBanner } from '@/components/crawl'
import { SessionLayout } from '@/components/layout/SessionLayout'
import { CrawledDataTable, MainContentAudit, TextQualityTable, WordCountAnalysis, BrokenLinkChecker, LinkAnalysis, SchemaGeneratorTable, AuditChecker, SerpAnalyzer } from '@/components/module_A'
import { AIIntelligenceModule, ContentMetricsModule } from '@/components/module_C'
import { AICitationRanking, SentimentTracking, CompetitorMentionsSection, ShareOfVoiceSection, BrandAnalysisSection, TrendsByModelSection, DashboardOverview } from '@/components/module_E'
import { ExportsTab } from '@/components/session/exports'
// import { useGetDataListQuery, useCheckLinksMutation, useGetLinkStatsQuery, useLazyGetPageLinksQuery } from '@/store/api/module_A/dataApi'
import { useGetProjectQuery } from '@/store/api/projectApi'
import { useGetSessionQuery } from '@/store/api/sessionApi'
import { useGetSessionJobsQuery, useGetJobPagesQuery, useGetJobLinksQuery, useGetJobSitemapsQuery, useGetJobFieldsQuery, useGetJobSiteStructureQuery, useRetryJobMutation, useGetJobSummaryQuery, useGetJobSnapshotQuery } from '@/store/api/jobApi'
import { useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'
import { useGetQuickStartResultQuery, useResumeCrawlMutation } from '@/store/api/quick_start/quickStartApi'
import { formatDurationHHMMSSMS, formatDurationReadable } from '@/utils/formatDuration'

interface LogEntry {
  message: string
  timestamp: string
}

export default function SessionDetailClient() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.projectId as string
  const sessionId = params.sessionId as string
  
  // Fetch session and project data using RTK Query
  const { data: sessionData, isLoading: isLoadingSession, error: sessionError } = useGetSessionQuery(sessionId)
  const { data: projectData, isLoading: isLoadingProject } = useGetProjectQuery(projectId)
  
  const session = sessionData?.session
  const project = projectData?.project

  // Fetch jobs for this session to get the latest job ID
  // Poll jobs list so latestJob.status reflects live job state (RUNNING → COMPLETED, etc.)
  const { data: jobsData, isLoading: isLoadingJobs } = useGetSessionJobsQuery(sessionId, {
    skip: !sessionId,
  })

  // Get the latest job (assuming sorted by creation or just taking the last one for now)
  // The backend might return them in a specific order, but let's be safe.
  // Sort jobs by createdAt descending to ensure we get the latest one
  const jobs = jobsData?.data ? [...jobsData.data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : []
  const latestJob = jobs.length > 0 ? jobs[0] : null
  const jobId = latestJob?.id

  // Find the Quick Start job — check BOTH type AND jobType fields so that
  // sessions created before the type-mirror fix (which had type:'CRAWL' but
  // jobType:'MODULE_E_QUICK_START') are still detected correctly.
  const quickStartJob = jobs.find((j: any) => {
    const type    = (j.type    || '').toUpperCase()
    const jobType = (j.jobType || '').toUpperCase()
    return (
      type    === 'MODULE_E_QUICK_START' || type.includes('QUICK_START') ||
      jobType === 'MODULE_E_QUICK_START' || jobType.includes('QUICK_START')
    )
  }) ?? null

  // Find the CRAWL-type job specifically — crawl status and crawl-page data
  // are independent of other job types (MODULE_C, MODULE_E, etc.).
  // Explicitly exclude Quick Start jobs even if they carry type:'CRAWL' in old data.
  const crawlJob = jobs.find((j: any) => {
    const type    = (j.type    || '').toUpperCase()
    const jobType = (j.jobType || '').toUpperCase()
    const isQS    = type.includes('QUICK_START') || jobType.includes('QUICK_START')
    return !isQS && (type === 'CRAWL' || jobType === 'CRAWL')
  }) ?? (quickStartJob ? null : latestJob)
  const crawlJobId = crawlJob?.id
  const quickStartJobId = quickStartJob?.id ?? null

  // Check job status and redirect to progress page if job is running
  // Note: Initial redirect is handled by Server Component to prevent flash.
  // This hook handles subsequent status changes while on the page.
  /* useJobRedirect({
    jobId,
    sessionId,
    projectId,
    enabled: !!jobId && !!sessionId && !!projectId
  }) */

  // Prevent loading results if we are still checking status
  // We removed the 'shouldRedirect' logic that was causing issues
  const skipResults = !jobId

  // Determine if the job itself is actively running — use the job's own status (RUNNING/PENDING)
  // NOT the session status, as they are independent entities
  const isJobRunning =
    latestJob?.status === 'RUNNING' ||
    latestJob?.status === 'PENDING' ||
    latestJob?.status === 'running' ||
    latestJob?.status === 'pending'

  // Separate crawl-job running state — used for snapshot polling rate and ticker
  // crawlJob.status comes from MongoDB (RUNNING/PENDING uppercase)
  const isCrawlJobRunning =
    crawlJob?.status === 'RUNNING' ||
    crawlJob?.status === 'PENDING' ||
    crawlJob?.status === 'running' ||
    crawlJob?.status === 'pending'

  // Quick-start job running state (needed for snapshot polling when crawlJob is null)
  const isQsJobRunning =
    quickStartJob?.status === 'RUNNING' ||
    quickStartJob?.status === 'PENDING' ||
    quickStartJob?.status === 'running' ||
    quickStartJob?.status === 'pending'

  // For polling of results: also re-poll while the session says it's active
  const isSessionRunning = session?.status === 'running' || session?.status === 'auditing'
  const shouldPollResults = isJobRunning || isCrawlJobRunning || isSessionRunning

  // Fetch results for the job using granular endpoints
  const { data: pagesResult, isLoading: isLoadingPagesRaw, refetch: refetchPagesRaw } = useGetJobPagesQuery(
    { jobId: jobId!, limit: 200, includeTotal: false },
    { skip: skipResults }
  )
  const { data: linksResult, isLoading: isLoadingLinksRaw, refetch: refetchLinksRaw } = useGetJobLinksQuery(
    { jobId: jobId!, limit: 200, includeTotal: false },
    { skip: skipResults }
  )
  const { data: fieldsResult, isLoading: isLoadingFieldsRaw, refetch: refetchFieldsRaw } = useGetJobFieldsQuery(
    { jobId: jobId!, limit: 200, includeTotal: false },
    { skip: skipResults }
  )
  const { data: sitemapsResult, isLoading: isLoadingSitemapsRaw, refetch: refetchSitemapsRaw } = useGetJobSitemapsQuery(
    { jobId: jobId!, limit: 100, includeTotal: false },
    { skip: skipResults }
  )
  const { data: jobSummary } = useGetJobSummaryQuery(jobId!, { skip: skipResults })
  
  // Real-time snapshot — poll the CRAWL job's snapshot specifically.
  // For quick-start sessions crawlJobId is null; fall back to quickStartJobId
  // so the banner still receives live pagesCrawled data.
  const snapshotJobId = crawlJobId || quickStartJobId
  const isSnapshotJobRunning = isCrawlJobRunning || isQsJobRunning
  const { data: jobSnapshot } = useGetJobSnapshotQuery(
    { jobId: snapshotJobId!, limit: 120 },
    {
      skip: !snapshotJobId,
      pollingInterval: isSnapshotJobRunning ? 8000 : 0,
    }
  )

  const isLoadingResults = isLoadingPagesRaw || isLoadingLinksRaw || isLoadingFieldsRaw || isLoadingSitemapsRaw
  const refetchJobResults = () => {
    refetchPagesRaw()
    refetchLinksRaw()
    refetchFieldsRaw()
    refetchSitemapsRaw()
  }

  const isLoading = isLoadingSession || isLoadingProject || isLoadingJobs || (!!jobId && !skipResults && isLoadingResults)
  const error = sessionError ? 'Failed to load session' : null
  
  // Ensure URL always has tab parameter with default 'dashboard'
  useEffect(() => {
    if (!searchParams.get('tab')) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', 'dashboard')
      router.replace(`/dashboard/projects/${projectId}/sessions/${sessionId}?${params.toString()}`, { scroll: false })
    }
  }, [searchParams, projectId, sessionId, router])

  const tab = searchParams.get('tab') || 'dashboard'
  
  const activeSection = tab

  // Polling refresh only while jobs are active to avoid tab-switch burst traffic.
  useEffect(() => {
    if (!jobId || !shouldPollResults) return
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }
      refetchPagesRaw()
      refetchFieldsRaw()
      refetchLinksRaw()
      refetchSitemapsRaw()
    }, 12000)

    return () => clearInterval(timer)
  }, [jobId, shouldPollResults, refetchPagesRaw, refetchFieldsRaw, refetchLinksRaw, refetchSitemapsRaw])

  // Auto-poll module E result while on the brand-intelligence tab so all
  // 4 sections update automatically when the background job completes.
  // RTK Query shares the cache key, so CompetitorMentionsSection,
  // BrandAnalysisSection, ShareOfVoiceSection, and TrendsByModelSection
  // all receive live data without any user interaction.
  const { data: moduleEPolled } = useGetModuleEResultQuery(jobId ?? '', {
    skip: !jobId || activeSection !== 'module-e',
  })

  // ── Quick-start session detection ─────────────────────────────────────
  // Fetch Module E data on the DASHBOARD tab to reliably detect whether
  // this is a quick-start session.  DashboardOverview already shows this
  // data, so it proves a module_e document exists for this job.
  // Using /module-e/jobs/:jobId (NOT /quick-start/jobs) because that
  // endpoint does NOT require crawl_status to exist — it just checks if
  // any brand/competitor/sov data was written by the quick-start runner.
  const { data: dashboardModuleEData } = useGetModuleEResultQuery(jobId ?? '', {
    skip: !jobId || activeSection !== 'dashboard',
  })

  // Mutation for resuming a paused crawl.
  const [resumeCrawl] = useResumeCrawlMutation()

  // Poll crawl_status from /quick-start/jobs — reads job_summaries in addition
  // to module_e.  Always fetch when there is a jobId so that crawl_status is
  // available for both isQuickStartSession detection and the banner.
  const [qsPollingActive, setQsPollingActive] = useState(true)
  // Use quickStartJob.id if found (guarantees correct jobId); fall back to latestJob.
  const qsQueryJobId = quickStartJob?.id ?? jobId ?? ''
  const { data: quickStartResult } = useGetQuickStartResultQuery(qsQueryJobId, {
    skip: !qsQueryJobId || activeSection !== 'dashboard',
    // Poll every 5 s while the crawl status is non-terminal (e.g. paused → running
    // after resume, or running → completed). qsPollingActive is set to false once
    // a terminal status (completed/failed/cancelled) is received from the API.
    pollingInterval: qsPollingActive ? 8000 : 0,
  })

  // A session is a quick-start session when module_e has data for this jobId,
  // OR when we can identify the job type from the jobs list,
  // OR when the quick-start API already returns a crawl_status record (the
  // repository now returns data as soon as job_summaries is written — before
  // the module_e analysis document exists).
  const isQuickStartSession =
    !!(dashboardModuleEData?.data?.brand_analysis ||
       dashboardModuleEData?.data?.competitor_mentions ||
       dashboardModuleEData?.data?.ai_share_of_voice) ||
    !!quickStartJob ||
    !!quickStartResult?.data

  // Derive crawl status: prefer explicit field from job_summaries;
  // fall back to inferred state from job status so the banner always shows.
  const rawCrawlStatus = quickStartResult?.data?.crawl_status ?? null
  const inferredCrawlStatus: string | null =
    rawCrawlStatus ??
    // Infer 'running' while the analysis job is still in progress — the
    // background crawl is always launched first so it will always be running.
    (quickStartJob?.status === 'RUNNING' || quickStartJob?.status === 'PENDING' ||
     quickStartJob?.status === 'running' || quickStartJob?.status === 'pending'
      ? 'running'
      : quickStartJob?.status === 'COMPLETED' || quickStartJob?.status === 'completed'
      ? 'completed'
      : quickStartJob?.status === 'FAILED' || quickStartJob?.status === 'failed'
      ? 'failed'
      : latestJob?.status === 'COMPLETED' || latestJob?.status === 'completed'
      ? 'completed'
      : latestJob?.status === 'FAILED' || latestJob?.status === 'failed'
      ? 'failed'
      : null)
  const bgCrawlStatus = inferredCrawlStatus

  // Stop polling ONLY when the explicit crawl_status from the API (rawCrawlStatus)
  // reaches a truly terminal value.  'paused' is NOT terminal — the user can
  // resume, and we must keep polling to detect the transition back to 'running'.
  useEffect(() => {
    const terminalStatuses = ['completed', 'failed', 'cancelled']
    if (rawCrawlStatus && terminalStatuses.includes(rawCrawlStatus)) {
      setQsPollingActive(false)
    }
  }, [rawCrawlStatus])

  // Unified data transformation
  const rawPages = pagesResult?.data || []
  
  // Dedup rawPages by URL to handle potential backend duplicates
  const uniquePagesMap = new Map();
  rawPages.forEach((page: any) => {
    if (page.url) {
        // Use the latest entry if duplicates exist (assuming sorted by creation, but simple overwrite works)
        // Or keep first? Let's overwrite to ensure we have data. 
        // Actually, if we want to match the count, just ensuring uniqueness is key.
        if (!uniquePagesMap.has(page.url)) {
            uniquePagesMap.set(page.url, page);
        }
    }
  });
  const uniqueRawPages = Array.from(uniquePagesMap.values());

  const rawFields = fieldsResult?.data || []
  
  // Create a map of fields by URL for efficient lookup
  const fieldsMap = new Map();
  rawFields.forEach((field: any) => {
    if (field.url) {
        fieldsMap.set(field.url, field);
    }
  });
  
  const transformedPages = uniqueRawPages.map((page: any) => {
    // Find associated fields data
    const fieldData = fieldsMap.get(page.url) || {};
    const crawlerData = fieldData.website_crawler || {};
    const textQualityData = fieldData['Text Quality Analyzer'] || {};
    const wordCountData = fieldData.Wordcount_analysis || {};

    const pageMatrix = fieldData.page_matrix || {};

    // Extract nested page_matrix sub-objects
    const pmTables = pageMatrix.tables || {};
    const pmFaqs = pageMatrix.faqs || {};
    const pmMixed = pageMatrix.mixedContent || {};
    const pmViewport = pageMatrix.viewport || {};
    const pmStructured = pageMatrix.structuredDataDetection || {};

    const statusCode = page.status_code || page.statusCode || 0;

    return {
    ...page,
    id: page._id || page.id || page.url || Math.random(),
    wordCount: page.word_count || page.wordCount || 0,
    titleLength: page.title_length || page.titleLength || pageMatrix.titleLength || 0,
    titlePixelWidth: crawlerData.title_pixel_width || pageMatrix.titlePixelWidth || 0,
    description: page.meta_description || page.metaDescription || '',
    descriptionLength: page.description_length || page.descriptionLength || 0,
    descriptionPixelWidth: crawlerData.meta_description_pixel_width || 0,
    statusCode,
    responseTime: page.response_time || page.responseTime || 0,
    contentType: page.content_type || page.contentType || '',
    sentenceCount: page.sentence_count || page.sentenceCount || wordCountData.sentenceCount || 0,
    paragraphCount: page.paragraph_count || page.paragraphCount || wordCountData.paragraphCount || 0,
    textToHtmlRatio: page.text_to_html_ratio || page.textToHtmlRatio || wordCountData.textToHtmlRatio || 0,
    metaKeywords: Array.isArray(page.meta_keywords) ? page.meta_keywords.join(', ') : (page.meta_keywords || ''),
    metaKeywordsLength: page.meta_keywords_length || page.metaKeywordsLength || 0,
    crawlDepth: page.crawl_depth || page.crawlDepth || 0,
    folderDepth: page.folder_depth || page.folderDepth || 0,
    uniqueOutlinks: crawlerData.unique_outlinks || 0,
    uniqueJsOutlinks: crawlerData.unique_js_outlinks || 0,
    uniqueExternalOutlinks: crawlerData.unique_external_outlinks || 0,
    uniqueExternalJsOutlinks: crawlerData.unique_external_js_outlinks || 0,
    metaDescription: page.meta_description || page.metaDescription || '',
    canonicalUrl: page.canonical_url || page.canonicalUrl || '',
    httpRelNext: page.http_rel_next || page.httpRelNext || '',
    httpRelPrev: page.http_rel_prev || page.httpRelPrev || '',
    relNext: page.rel_next ?? '',
    relPrev: page.rel_prev ?? '',
    metaRobots: page.meta_robots || page.metaRobots || '',
    xRobotsTag: page.x_robots_tag || page.xRobotsTag || '',
    metaRefresh: page.meta_refresh || page.metaRefresh || '',
    lastModified: page.last_modified || page.lastModified || '',
    httpVersion: page.http_version || page.httpVersion || '',
    success: statusCode >= 200 && statusCode < 400,

    redirectUrl: page.redirect_url || page.redirectUrl || '',
    redirectType: page.redirect_type || page.redirectType || '',
    errorMessage: page.error_message || page.errorMessage || '',

    sizeBytes: page.page_size_bytes || 0,
    transferredBytes: crawlerData.transferred_bytes || 0,
    totalTransferredBytes: crawlerData.total_transferred_bytes || crawlerData.transferred_bytes || 0,
    co2Mg: crawlerData.co2_mg || 0,
    carbonRating: crawlerData.carbon_rating || 'Unknown',

    contentHash: page.content_hash || crawlerData.hash || '',
    nearDuplicateCount: crawlerData.no_near_duplicates || 0,
    closestDuplicateSimilarity: crawlerData.closest_near_duplicate_similarity || crawlerData.closest_near_duplicate_match || 0,
    closestDuplicateUrl: crawlerData.closest_near_duplicate_url || '',

    linkScore: 0,
    semanticSimilarityScore: crawlerData.semantic_similarity_score || 0,
    semanticRelevanceScore: crawlerData.semantic_relevance_score || 0,
    closestSemanticallySimilarAddress: crawlerData.closest_semantically_similar_address || '',
    semanticallySimilarCount: crawlerData.no_semantically_similar || 0,

    resourceType: 'HTML',

    hasTables: pmTables.hasTables || (page.table_count > 0) || false,
    tableCount: pmTables.tableCount ?? page.table_count ?? 0,
    tableData: Array.isArray(pmTables.tables) && pmTables.tables.length > 0 ? JSON.stringify(pmTables.tables) : '',

    hasFaqs: pmFaqs.hasFaqs || page.has_faq || false,
    faqCount: pmFaqs.faqCount ?? page.faq_count ?? 0,
    faqDetectionMethod: pmFaqs.detectionMethod || '',
    faqData: Array.isArray(pmFaqs.faqPairs) && pmFaqs.faqPairs.length > 0 ? JSON.stringify(pmFaqs.faqPairs) : '',

    hasMixedContent: pmMixed.hasMixedContent || page.has_mixed_content || false,
    mixedContentSeverity: (pmMixed.hasMixedContent || page.has_mixed_content) ? 'warning' : 'none',
    totalInsecureResources: Array.isArray(pmMixed.mixedContentResources) ? pmMixed.mixedContentResources.length : (Array.isArray(page.mixed_content_urls) ? page.mixed_content_urls.length : 0),
    mixedContentData: (() => {
      const resources = pmMixed.mixedContentResources || page.mixed_content_urls || [];
      return Array.isArray(resources) && resources.length > 0 ? JSON.stringify(resources) : '';
    })(),

    duplicateTitleCount: 0,
    duplicateMetaDescriptionCount: 0,

    viewportPresent: pmViewport.hasViewport ?? !!page.viewport,
    viewportContent: pmViewport.viewportContent || page.viewport || '',
    viewportStatus: pmViewport.hasViewport ? (pmViewport.isMobileOptimized ? 'ok' : 'warning') : (page.viewport ? 'ok' : 'missing'),

    structuredDataPresent: pmStructured.hasStructuredData || page.has_structured_data || false,
    structuredDataFormat: (() => {
      const items = pmStructured.items || [];
      if (!Array.isArray(items) || items.length === 0) return '';
      const formats = [...new Set(items.map((i: any) => i.type).filter(Boolean))];
      return formats.join(', ');
    })(),
    structuredDataTypes: (() => {
      if (Array.isArray(page.structured_data_types) && page.structured_data_types.length > 0) return page.structured_data_types.join(', ');
      const items = pmStructured.items || [];
      if (!Array.isArray(items) || items.length === 0) return '';
      return [...new Set(items.map((i: any) => i.schemaType).filter(Boolean))].join(', ');
    })(),
    canonicalValidationStatus: (() => {
      const canonicalUrl = page.canonical_url || page.canonicalUrl || '';
      if (!canonicalUrl) return 'Missing';
      try {
        new URL(canonicalUrl);
        return 'Valid';
      } catch {
        return 'Invalid';
      }
    })(),
    canonicalValidationMessage: '',

    pageCategory: pageMatrix.page_category ?? null,
    postCategoryType: pageMatrix.post_category_type ?? null,
    pageType: pageMatrix.page_type ?? null,
    postType: pageMatrix.post_type ?? null,
    intent: pageMatrix.intent ?? null,
    indexability: pageMatrix.indexability ?? null,
    isSelfCanonical: pageMatrix.is_self_canonical ?? null,
    redirectTarget: pageMatrix.redirect_target ?? null,

    totalWordCount: page.word_count || page.wordCount || wordCountData.totalWordCount || 0,
    visibleWordCount: wordCountData.visibleWordCount || page.word_count || 0,
    uniqueWordCount: wordCountData.uniqueWordCount || 0,
    averageSentenceLength: wordCountData.averageSentenceLength || crawlerData.average_words_per_sentence || 0,
    averageParagraphLength: wordCountData.averageParagraphLength || 0,
    keywordDensity: wordCountData.keywordDensity || 0,

    fleschReadingEase: crawlerData.flesch_reading_ease_score || 0,
    readabilityLevel: crawlerData.readability || 'Unknown',
    averageWordsPerSentence: crawlerData.average_words_per_sentence || 0,

    indexabilityStatus: page.indexability_status || '',
    indexable: page.indexable ?? !(page.meta_robots?.includes('noindex') || page.x_robots_tag?.includes('noindex')),

    status: (() => {
      const code = statusCode;
      const reasons: Record<number, string> = { 200: 'OK', 201: 'Created', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };
      return reasons[code] || (code ? String(code) : '');
    })(),

    titleStatus: (() => {
      const tv = pageMatrix.titleValidation;
      if (tv && !tv.isValid) return 'Missing';
      if (pageMatrix.hasMissingTitle) return 'Missing';
      return (page.title_length === 0 || page.title_length === undefined) ? 'Missing' : 'OK';
    })(),
    metaDescriptionStatus: (() => {
      return (page.description_length === 0 || page.description_length === undefined) ? 'Missing' : 'OK';
    })(),

    grammarErrors: crawlerData.grammar_errors || 0,
    spellingErrors: crawlerData.spelling_errors || 0,

    thinContent: wordCountData.thinContent || false,
    duplicateContent: wordCountData.duplicateContent || false,

    headingTags: (() => {
      const hs = crawlerData.heading_structure;
      if (Array.isArray(hs) && hs.length > 0) return JSON.stringify(hs);
      const tags: any[] = [];
      for (let i = 1; i <= 6; i++) {
        const arr = page[`h${i}_tags`] || [];
        arr.forEach((t: string) => tags.push({ level: i, tag: `h${i}`, text: t }));
      }
      return tags.length > 0 ? JSON.stringify(tags) : '';
    })(),

    ogTitle: page.og_title || crawlerData.og_title || '',
    ogDescription: page.og_description || crawlerData.og_description || '',
    ogImage: page.og_image || crawlerData.og_image || '',

    cookies: page.cookies || '',
    amphtmlUrl: page.amphtml_link || '',
    mobileAlternateUrl: page.mobile_alternate_link || '',
    urlEncodedAddress: page.url ? encodeURI(page.url) : '',
    outlinks: crawlerData.outlinks || 0,
    externalOutlinks: crawlerData.external_outlinks || 0,
    language: page.language || '',

    sectionWordCountMapping: wordCountData.sectionWordCountMapping || null,
    sectionWordCountBreakdown: wordCountData.sectionWordCountBreakdown || null,
    headingWordCountMapping: wordCountData.headingWordCountMapping || null,
    thinContentReason: wordCountData.thinContentReason || null,
    duplicateWithUrls: wordCountData.duplicateWithUrls || [],
    wordCountDistribution: wordCountData.wordCountDistribution || null,

    timestamp: page.timestamp || new Date().toISOString(),
    fields: fieldData
  }})

  const totalPagesCount =
    jobSnapshot?.pagesCrawled ??
    (uniqueRawPages.length > 0 ? uniqueRawPages.length : (pagesResult?.pagination?.total ?? session?.totalPages ?? jobSummary?.session?.total_pages ?? 0))

  // Transform data for Crawled Data Table
  const pagesData = { 
    data: transformedPages
  }
  const isLoadingPages = isLoadingResults
  const refetchPages = refetchJobResults

  const pageMetricsData = { data: transformedPages }
  const isLoadingMetrics = isLoadingResults
  const refetchMetrics = refetchJobResults

  // Transform data for Text Quality Table
  const textQualityData = {
    data: transformedPages
  }
  const isLoadingTextQuality = isLoadingResults
  const refetchTextQuality = refetchJobResults

  // Transform data for Word Count Analysis
  const wordCountData = {
    data: transformedPages
  }
  const isLoadingWordCount = isLoadingResults
  const refetchWordCount = refetchJobResults

  // Transform data for Link Analysis
  // Group links by source_url to match previous structure expected by components
  const rawLinks = linksResult?.data || []
  const linksMap: Record<string, any[]> = {}
  rawLinks.forEach((link: any) => {
    const sourceUrl = link.source_url || 'unknown'
    if (!linksMap[sourceUrl]) {
        linksMap[sourceUrl] = []
    }
    linksMap[sourceUrl].push(link)
  })

  // We also need a total links count. 
  // With granular API, we get pagination info which has total.
  const totalLinksCount = linksResult?.pagination?.total || 0

  const linkStatsData = { 
    pageStats: transformedPages.map((page: any) => {
        // Calculate link stats using snake_case fields from backend
        // Use linksMap if available, otherwise try to use fields data
        const pageLinks = linksMap[page.url] || [];
        
        // Fallback to fields data if linksMap is empty (e.g. if links weren't fetched/mapped yet)
        // But links are separate now.
        
        const internalOut = pageLinks.filter((l: any) => l.is_internal).length;
        const externalOut = pageLinks.filter((l: any) => !l.is_internal).length;
        
        return {
            pageId: page.id,
            url: page.url,
            title: page.title,
            outlinks: pageLinks.length,
            inlinks: 0, 
            uniqueInlinks: 0,
            uniqueJsInlinks: 0,
            percentOfTotal: 0,
            externalOutlinks: externalOut,
            internalOutlinks: internalOut,
            linkScore: page.linkScore // If available
        };
    }), 
    stats: {
      totalLinks: totalLinksCount,
      internalLinks: 0, // Placeholder
      externalLinks: 0, // Placeholder
      brokenLinks: 0, // Placeholder
      linksByPosition: { header: 0, footer: 0, sidebar: 0, content: 0 }
    } 
  }
  const isLoadingLinkStats = isLoadingResults
  const refetchLinkStats = refetchJobResults

  // Mock hooks to satisfy TS and runtime usage (returning object with unwrap)
  const getPageLinks = (arg: any) => ({ unwrap: async () => ({ links: linksMap[arg.pageId] || [] }) })
  
  // Calculate Broken Links
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const derivedBrokenLinks: any = {
    brokenInternalLinks: { count: 0, links: [] },
    brokenExternalLinks: { count: 0, links: [] },
    missingPages: { count: 0, links: [] },
    serverErrors: { count: 0, links: [] },
    timeoutUnreachable: { count: 0, links: [] }
  }

  if (Object.keys(linksMap).length > 0) {
    Object.entries(linksMap).forEach(([sourceUrl, links]) => {
        links.forEach((link: any) => {
            // Check for status_code (snake_case) or statusCode (camelCase)
            const sc = link.status_code || link.statusCode;
            if (sc >= 400) {
                const brokenLink = {
                    url: link.target_url || link.targetUrl,
                    sourceUrl: link.source_url || link.sourceUrl || sourceUrl,
                    statusCode: sc,
                    errorType: link.status_text || link.statusText || 'Error',
                    error: link.error_message || link.errorMessage
                };

                const isInternal = link.is_internal !== undefined ? link.is_internal : link.isInternal;

                if (sc === 404) {
                    if (isInternal) {
                        derivedBrokenLinks.missingPages.count++;
                        derivedBrokenLinks.missingPages.links.push(brokenLink);
                    } else {
                         derivedBrokenLinks.brokenExternalLinks.count++;
                         derivedBrokenLinks.brokenExternalLinks.links.push(brokenLink);
                    }
                } else if (sc >= 500) {
                     derivedBrokenLinks.serverErrors.count++;
                     derivedBrokenLinks.serverErrors.links.push(brokenLink);
                } else if (sc === 0 || sc === 408) {
                     derivedBrokenLinks.timeoutUnreachable.count++;
                     derivedBrokenLinks.timeoutUnreachable.links.push(brokenLink);
                } else {
                    if (isInternal) {
                        derivedBrokenLinks.brokenInternalLinks.count++;
                        derivedBrokenLinks.brokenInternalLinks.links.push(brokenLink);
                    } else {
                        derivedBrokenLinks.brokenExternalLinks.count++;
                        derivedBrokenLinks.brokenExternalLinks.links.push(brokenLink);
                    }
                }
            }
        });
    });
  }

  const checkLinks = (arg: any) => ({ unwrap: async () => ({ results: derivedBrokenLinks }) })
  const linkCheckData = { results: derivedBrokenLinks }
  const isCheckingLinks = false
  
  // Live crawl state - initialize from session data
  const [isCrawling, setIsCrawling] = useState(false)
  const [crawlStatus, setCrawlStatus] = useState<'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'>('idle')
  const [pageCount, setPageCount] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [discoveredPages, setDiscoveredPages] = useState<string[]>([])
  const [crawlStartTime, setCrawlStartTime] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [crawlStats, setCrawlStats] = useState<{
    count: number
    duration: number
    pagesPerSecond: number
  } | null>(null)

  // Initialize crawl state from session data and job summary
  useEffect(() => {
    // Determine the actual status from session or jobSummary
    const actualStatus = session?.status || jobSnapshot?.status || jobSummary?.session?.status || 'idle'
    
    if (session) {
      if (actualStatus === 'running' || actualStatus === 'auditing') {
        setIsCrawling(true)
        setCrawlStatus(actualStatus as 'running' | 'auditing')
        if (session.startedAt) {
          setCrawlStartTime(new Date(session.startedAt).getTime())
        }
      } else {
        setIsCrawling(false)
        // Map status properly - handle completed/cancelled/failed
        const mappedStatus = actualStatus.toLowerCase() as 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'
        setCrawlStatus(mappedStatus === 'idle' && jobSummary?.session?.status ? 
          jobSummary.session.status as 'completed' | 'cancelled' : mappedStatus)
      }
      
      // PRIORITY: Use accurate DB/deduped count if available (via polling)
      // This fixes the issue where Redis counter is inflated (70) vs actual DB count (35)
      const dbTotal = pagesResult?.pagination?.total;
      
      if (typeof dbTotal === 'number' && dbTotal > 0) {
        setPageCount(dbTotal);
      } else if (jobSnapshot?.pagesCrawled !== undefined && (actualStatus === 'running' || actualStatus === 'auditing')) {
        // Only fallback to Redis if DB count is not yet available
        setPageCount(jobSnapshot.pagesCrawled)
      } else {
        setPageCount(session.totalPages || jobSummary?.session?.total_pages || 0)
      }

    } else if (jobSummary?.session) {
      // No session but we have jobSummary
      const summaryStatus = jobSummary.session.status?.toLowerCase() as 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'
      setCrawlStatus(summaryStatus || 'completed')
      
      const dbTotal = pagesResult?.pagination?.total;
      if (typeof dbTotal === 'number' && dbTotal > 0) {
        setPageCount(dbTotal);
      } else if (jobSnapshot?.pagesCrawled !== undefined && (summaryStatus === 'running' || summaryStatus === 'auditing')) {
        setPageCount(jobSnapshot.pagesCrawled)
      } else {
        const uniqueCount = uniqueRawPages.length
        const realTimeCount = uniqueCount > 0 ? uniqueCount : pagesResult?.pagination?.total
        setPageCount(typeof realTimeCount === 'number' ? realTimeCount : (jobSummary.session.total_pages || 0))
      }
    }
    
    // Use jobSummary for more accurate data when available
    if (jobSummary?.session) {
      const summarySession = jobSummary.session
      // Set page count from job summary if session doesn't have it and snapshot is missing
      if (!session?.totalPages && summarySession.total_pages && pagesResult?.pagination?.total === undefined && jobSnapshot?.pagesCrawled === undefined) {
        setPageCount(summarySession.total_pages)
      }
      // Set crawl start time from job summary if not already set
      if (!crawlStartTime && summarySession.started_at) {
        setCrawlStartTime(new Date(summarySession.started_at).getTime())
      }
      // Calculate crawl stats if we have completed_at
      if (summarySession.completed_at && summarySession.started_at) {
        const started = new Date(summarySession.started_at).getTime()
        const completed = new Date(summarySession.completed_at).getTime()
        const durationMs = completed - started
        const durationSec = durationMs / 1000
        // Use snapshot count if available for pps calculation, but respect completion status
        let total = summarySession.total_pages || 0
        const dbTotal = pagesResult?.pagination?.total;
        
        if (typeof dbTotal === 'number' && dbTotal > 0) {
             total = dbTotal;
        } else if (jobSnapshot?.pagesCrawled !== undefined && (actualStatus === 'running' || actualStatus === 'auditing')) {
            total = jobSnapshot.pagesCrawled
        } else if (uniqueRawPages.length > 0) {
            total = uniqueRawPages.length
        }
        
        const pps = durationSec > 0 ? total / durationSec : 0
        setCrawlStats({
          count: total,
          duration: durationMs,
          pagesPerSecond: pps
        })
      }
    }
  }, [session, jobSummary, pagesResult, jobSnapshot])

  // Timer for elapsed time display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    
    return () => clearInterval(timer)
  }, [])


  // Handle broken link checking
  const handleCheckLinks = async (sessionId: string | number) => {
    try {
      const result = await checkLinks(sessionId).unwrap()
      return result.results
    } catch (error) {
      console.error('Error checking links:', error)
      throw error
    }
  }

  // Handle page link selection for link analysis
  const handlePageLinkSelect = async (pageId: number, linkType: 'out' | 'in') => {
    try {
      // Find the page URL using pageId
      const page = rawPages.find((p: any) => (p._id || p.id) === pageId);
      if (!page) return [];

      const mapLink = (link: any, sourceUrl?: string) => ({
          ...link,
          // Map snake_case to camelCase
          sourceUrl: link.source_url || link.sourceUrl || sourceUrl,
          targetUrl: link.target_url || link.targetUrl,
          isInternal: link.is_internal !== undefined ? link.is_internal : link.isInternal,
          anchorText: link.anchor_text || link.anchorText,
          // Include other potential fields
          nofollow: link.nofollow,
          rel: link.rel,
          position: link.position || 'Main', // Default position if missing
          id: Math.random() // Temp ID for list key
      });

      // If outlinks, we can look up in our links map
      if (linkType === 'out') {
          const rawLinks = linksMap[page.url] || [];
          return rawLinks.map((l: any) => mapLink(l, page.url));
      }
      
      // If inlinks, we would need to search all links for this targetUrl
      if (linkType === 'in') {
          const inlinks: any[] = [];
          if (Object.keys(linksMap).length > 0) {
              Object.entries(linksMap).forEach(([sourceUrl, links]) => {
                  links.forEach((link: any) => {
                      if ((link.target_url || link.targetUrl) === page.url) {
                          inlinks.push(mapLink(link, sourceUrl));
                      }
                  });
              });
          }
          return inlinks;
      }
      
      return []

    } catch (error) {
      console.error('Error fetching page links:', error)
      return []
    }
  }

  const handleSectionChange = (section: string) => {
    router.push(`/dashboard/projects/${projectId}/sessions/${sessionId}?tab=${section}`)
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-400/50 shadow-[0_0_10px_rgba(52,211,153,0.3)]'
      case 'running':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-400/50 shadow-[0_0_10px_rgba(34,211,238,0.3)] animate-pulse'
      case 'auditing':
        return 'bg-amber-500/20 text-amber-400 border-amber-400/50 shadow-[0_0_10px_rgba(251,191,36,0.3)]'
      case 'failed':
      case 'cancelled':
        return 'bg-rose-500/20 text-rose-400 border-rose-400/50 shadow-[0_0_10px_rgba(251,113,133,0.3)]'
      case 'pending':
        return 'bg-zinc-500/20 text-zinc-400 border-zinc-400/50 shadow-[0_0_10px_rgba(161,161,170,0.3)]'
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-400/50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
      case 'running':
      case 'auditing':
        return <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
      case 'failed':
        return <XCircle className="h-4 w-4 sm:h-5 sm:w-5" />
      default:
        return null
    }
  }

  // Helper function to format duration
  const formatDuration = (seconds: number, milliseconds: number = 0, isRunning: boolean = false): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    const pad = (n: number) => n.toString().padStart(2, '0')
    
    if (isRunning && milliseconds > 0) {
      if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(secs)}`
      }
      return `${minutes}:${pad(secs)}`
    }
    
    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(secs)}`
    }
    return `${minutes}:${pad(secs)}`
  }

  // Calculate elapsed time in milliseconds
  const calculateElapsedTimeMs = (): number => {
    const isActive = isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing'
    
    if (isActive && crawlStartTime) {
      return currentTime - crawlStartTime
    }
    
    if (crawlStats?.duration) {
      // crawlStats.duration is in milliseconds
      return crawlStats.duration
    }
    
    if (session?.duration) {
      // session.duration is stored in milliseconds from the database
      return session.duration
    }
    
    return 0
  }

  // Get formatted duration string in HH:MM:SS:MS format
  const getFormattedDuration = (): string => {
    return formatDurationHHMMSSMS(calculateElapsedTimeMs())
  }

  // Calculate items per second
  const calculateItemsPerSecond = (): string => {
    const isActive = isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing'
    const elapsedMs = calculateElapsedTimeMs()
    const elapsedSec = elapsedMs / 1000
    
    if (isActive && pageCount >= 0 && elapsedSec > 0) {
      return (pageCount / elapsedSec).toFixed(1)
    }
    if (crawlStats?.pagesPerSecond != null) {
      return crawlStats.pagesPerSecond.toFixed(1)
    }
    return '0.0'
  }

  if (isLoading) {
    return (
      <SessionLayout
        projectId={projectId}
        projectName="Loading..."
        sessionId={sessionId}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      >
        <div className="p-6 space-y-6 sm:space-y-8 animate-fade-in-hero">
          <div className="space-y-2">
            <div className="h-8 sm:h-10 md:h-12 w-48 sm:w-64 bg-zinc-800/40 rounded-2xl animate-pulse"></div>
            <div className="h-4 sm:h-5 w-32 sm:w-48 bg-zinc-800/40 rounded-xl animate-pulse"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl p-3 sm:p-4 md:p-5 border border-zinc-800 bg-[#111113] animate-pulse">
                <div className="h-20 sm:h-24 bg-zinc-800/40 rounded-xl"></div>
              </div>
            ))}
          </div>
        </div>
      </SessionLayout>
    )
  }

  if (error || !session) {
    return (
      <SessionLayout
        projectId={projectId}
        projectName={project?.name || "Unknown Project"}
        sessionId={sessionId}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      >
        <div className="p-6 space-y-8 animate-fade-in-hero">
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-rose-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Session not found</h2>
            <p className="text-zinc-500 mb-6">{error || 'The session you\'re looking for doesn\'t exist'}</p>
            <Button 
              onClick={() => router.push(`/dashboard/projects/${projectId}`)} 
              className="bg-white text-black hover:bg-zinc-200 rounded-xl px-6 cursor-pointer"
            >
              Back to Project
            </Button>
          </div>
        </div>
      </SessionLayout>
    )
  }

  return (
    <SessionLayout
      projectId={projectId}
      projectName={project?.name || "Unknown Project"}
      sessionId={sessionId}
      sessionUrl={session?.startUrl}
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
    >
      <div className="p-6 space-y-6 sm:space-y-8 animate-fade-in-hero">
        {/* Dashboard Overview — top-level summary of quick_start_runner fields */}
        {activeSection === 'dashboard' && (
          <>
            {/* ── Live Crawl Activity Ticker ────────────────────────────────────── */}
            {/* Show whenever there is a crawlJobId — crawl status is read from  */}
            {/* the Redis snapshot independently of other job types.              */}
            {(() => {
              // Derive crawl-active state from BOTH Redis snapshot (real-time) AND MongoDB crawlJob.status
              const snapStatus = jobSnapshot?.status ?? 'pending'
              const crawlActive =
                isCrawlJobRunning ||
                snapStatus === 'JOB_STARTED' ||
                snapStatus === 'running'
              const crawlDone =
                crawlJob?.status === 'COMPLETED' || crawlJob?.status === 'completed' ||
                crawlJob?.status === 'FAILED' || crawlJob?.status === 'failed' ||
                jobSnapshot?.completed === true ||
                snapStatus === 'JOB_COMPLETED' || snapStatus === 'completed' ||
                snapStatus === 'JOB_FAILED' || snapStatus === 'failed'
              const crawledPages = jobSnapshot?.links ?? []
              // For running: prefer snapshot counter; for done: always use DB-sourced pageCount
              const displayPageCount = crawlDone
                ? (pageCount || pagesResult?.pagination?.total || jobSummary?.session?.total_pages || jobSnapshot?.pagesCrawled || 0)
                : (jobSnapshot?.pagesCrawled ?? crawledPages.length)

              // ── Completed state ────────────────────────────────────────────
              if (crawlDone) {
                return (
                  <div className="rounded-2xl border border-emerald-500/20 bg-[#0D0D10] overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/60">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="text-sm font-semibold text-white">Crawl completed</span>
                        <span className="text-[10px] text-zinc-400 bg-zinc-700/40 px-2 py-0.5 rounded-full">done</span>
                      </div>
                      <button
                        onClick={() => handleSectionChange('crawler')}
                        className="text-[11px] text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        Full view <Globe className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Stats + CTA */}
                    <div className="px-5 py-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                          <Globe className="h-5 w-5 text-emerald-400 shrink-0" />
                          <div>
                            <p className="text-2xl font-bold text-white leading-none">
                              {displayPageCount > 0 ? displayPageCount.toLocaleString() : '—'}
                            </p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">pages found</p>
                          </div>
                        </div>
                        {crawlStats && crawlStats.duration > 0 && (
                          <div className="hidden sm:flex flex-col">
                            <p className="text-xs font-semibold text-white">{formatDurationReadable(crawlStats.duration)}</p>
                            <p className="text-[10px] text-zinc-500">crawl duration</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleSectionChange('crawled-data')}
                        className="flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer shrink-0"
                      >
                        View results
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              }

              // Live / queued state — handled by CrawlStatusBanner under Brand Analysis
              return null
            })()}

            <DashboardOverview
              jobId={jobId}
              url={session?.startUrl || ''}
              onNavigate={handleSectionChange}
              crawlStatusSlot={
                (snapshotJobId) ? (
                  <CrawlStatusBanner
                    jobId={snapshotJobId}
                    initialStatus={
                      isSnapshotJobRunning ? 'running'
                        : (crawlJob?.status === 'COMPLETED' || crawlJob?.status === 'completed' ||
                           quickStartJob?.status === 'COMPLETED' || quickStartJob?.status === 'completed')
                          ? 'completed'
                          : (crawlJob?.status === 'FAILED' || crawlJob?.status === 'failed' ||
                             quickStartJob?.status === 'FAILED' || quickStartJob?.status === 'failed')
                            ? 'failed'
                            : (bgCrawlStatus as any) ?? null
                    }
                    onViewPages={() => handleSectionChange('crawler')}
                    onResume={() => {
                      if (snapshotJobId) {
                        setQsPollingActive(true)
                        resumeCrawl(snapshotJobId)
                      }
                    }}
                    pagesCrawled={jobSnapshot?.pagesCrawled ?? 0}
                    totalPages={100}
                    currentUrl={
                      jobSnapshot?.links && jobSnapshot.links.length > 0
                        ? [...jobSnapshot.links].sort((a, b) => b.timestamp - a.timestamp)[0]?.url
                        : session?.startUrl
                    }
                  />
                ) : undefined
              }
            />
          </>
        )}

        {/* Show Crawler Status only on crawler tab */}
        {activeSection === 'crawler' && (
          <>
            {/* Crawling Status Header */}
            <CrawlStatusHeader
              crawlStatus={crawlStatus}
              isCrawling={isCrawling}
              pageCount={pageCount}
              duration={getFormattedDuration()}
              itemsPerSecond={calculateItemsPerSecond()}
            />

            {/* Session Info */}
            <div className="rounded-2xl p-4 sm:p-5 border border-zinc-800 bg-[#111113]">
              <h2 className="text-base sm:text-lg font-semibold text-white mb-4">Session Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                <div className="space-y-1">
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Session ID</p>
                  <p className="text-sm text-white font-medium font-mono">#{session.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Project ID</p>
                  <p className="text-sm text-white font-medium">{session.projectId}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Start URL</p>
                  <p className="text-sm text-white font-medium truncate">{session.startUrl}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Status</p>
                  <Badge className={`${getStatusColor(session.status)} text-[10px] inline-flex items-center gap-1`}>
                    {getStatusIcon(session.status)}
                    {session.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Total Pages</p>
                  <p className="text-sm text-blue-400 font-semibold">{totalPagesCount}</p>
                </div>
                {(session.completedAt || jobSummary?.session?.completed_at) && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Completed</p>
                    <p className="text-sm text-emerald-400 font-semibold">
                      {new Date(session.completedAt || jobSummary?.session?.completed_at || '').toLocaleString()}
                    </p>
                  </div>
                )}

              </div>
            </div>

            {/* Crawled Pages Summary Table */}
            <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-800/60 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">📄 Crawled Pages ({transformedPages.length})</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => refetchJobResults()}
                  className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 rounded-xl"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <div className="overflow-x-auto">
                {isLoadingResults ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
                    <span className="ml-2 text-zinc-500">Loading crawled pages...</span>
                  </div>
                ) : transformedPages.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-zinc-600">
                    No pages crawled yet
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">URL</th>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Title</th>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Words</th>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Response</th>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Depth</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {transformedPages.slice(0, 6).map((page: any, idx: number) => {
                        const responseTime = page.responseTime || page.response_time || 0;
                        const wordCount = page.wordCount || page.word_count || 0;
                        const crawlDepth = page.crawlDepth || page.crawl_depth || 0;
                        
                        return (
                          <tr key={page.id || idx} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <a 
                                href={page.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-sm truncate max-w-75 block"
                                title={page.url}
                              >
                                {page.url?.length > 50 ? page.url.substring(0, 50) + '...' : page.url}
                              </a>
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={`text-xs ${
                                page.statusCode >= 200 && page.statusCode < 300 
                                  ? 'bg-green-500/20 text-green-300 border-green-500/30' 
                                  : page.statusCode >= 300 && page.statusCode < 400
                                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                                  : 'bg-red-500/20 text-red-300 border-red-500/30'
                              }`}>
                                {page.statusCode || 'N/A'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-400 truncate max-w-50" title={page.title}>
                              {page.title?.length > 40 ? page.title.substring(0, 40) + '...' : page.title || '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-sm px-2 py-0.5 rounded ${
                                wordCount > 1000 
                                  ? 'bg-green-500/15 text-green-300' 
                                  : wordCount > 300 
                                  ? 'bg-blue-500/15 text-blue-300'
                                  : 'bg-orange-500/15 text-orange-300'
                              }`}>
                                {wordCount.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-sm px-2 py-0.5 rounded ${
                                responseTime > 0 && responseTime < 500 
                                  ? 'bg-green-500/15 text-green-300' 
                                  : responseTime >= 500 && responseTime < 1000 
                                  ? 'bg-yellow-500/15 text-yellow-300'
                                  : responseTime >= 1000
                                  ? 'bg-red-500/15 text-red-300'
                                  : 'text-zinc-600'
                              }`}>
                                {responseTime > 0 ? `${responseTime}ms` : '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-sm px-2 py-0.5 rounded ${
                                crawlDepth === 0 
                                  ? 'bg-purple-500/15 text-purple-300' 
                                  : crawlDepth <= 2 
                                  ? 'bg-blue-500/15 text-blue-300'
                                  : 'bg-zinc-800/40 text-zinc-400'
                              }`}>
                                {crawlDepth}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {transformedPages.length > 6 && (
                  <div className="px-4 py-3 border-t border-zinc-800/60 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSectionChange('crawled-data')}
                      className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-xl"
                    >
                      View all {transformedPages.length} pages →
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Show Crawled Data Table on crawled-data / technical-audit tab */}
        {(activeSection === 'crawled-data' || activeSection === 'technical-audit') && (
          <div>

            <CrawledDataTable 
              data={pagesData?.data || []}
              isLoading={isLoadingPages}
              onRefresh={() => refetchPages()}
            />
          </div>
        )}

        {/* Show Page Metrics Table on page-metrics / content-audit tab */}
        {(activeSection === 'page-metrics' || activeSection === 'content-audit') && (
          <div className="h-[calc(100vh-140px)] -mt-2">
            <MainContentAudit 
              pageMetricsData={pageMetricsData?.data || []}
              isLoadingMetrics={isLoadingMetrics}
              onRefreshMetrics={() => refetchMetrics()}
              sessionId={sessionId}
              jobId={jobId || null}
              sessionStatus={crawlStatus}
            />
          </div>
        )}

        {/* Show Text Quality Table on text-quality tab */}
        {activeSection === 'text-quality' && (
          <div>
            <TextQualityTable 
              data={textQualityData?.data || []}
              isLoading={isLoadingTextQuality}
              onRefresh={() => refetchTextQuality()}
            />
          </div>
        )}

        {/* Show Word Count Analysis on wordcount tab */}
        {activeSection === 'wordcount' && (
          <div>
            <WordCountAnalysis 
              data={wordCountData?.data || []}
              isLoading={isLoadingWordCount}
              onRefresh={() => refetchWordCount()}
            />
          </div>
        )}

        {/* Show Broken Link Checker on broken-links tab */}
        {activeSection === 'broken-links' && (
          <div>
            <BrokenLinkChecker 
              sessionId={parseInt(sessionId)}
              onCheck={handleCheckLinks}
              checkResults={linkCheckData?.results || null}
              isChecking={isCheckingLinks}
            />
          </div>
        )}

        {/* Show Audit Checker on audit-checker tab */}
        {activeSection === 'audit-checker' && (
          <div>
            <AuditChecker 
              sessionId={parseInt(sessionId)}
              pages={transformedPages}
            />
          </div>
        )}

        {/* Show Link Analysis on link-analysis tab */}
        {activeSection === 'link-analysis' && (
          <div>
            <LinkAnalysis 
              pageStats={(linkStatsData?.pageStats as any) || []}
              linkStats={linkStatsData?.stats || null}
              isLoading={isLoadingLinkStats}
              onPageSelect={handlePageLinkSelect}
              onRefresh={() => refetchLinkStats()}
            />
          </div>
        )}

        {/* Show Performance Audits on performance tab (now handled in Content Audit) */}
        {activeSection === 'performance' && (
          <div>
            <div className="p-8 text-center text-zinc-400">
              Performance Metrics have been moved to the Content Audit section.
            </div>
          </div>
        )}

        {/* SERP Analyzer */}
        {activeSection === 'serp-analyzer' && (
          <div>
            <SerpAnalyzer jobId={jobId} sessionId={sessionId} />
          </div>
        )}

        {/* Show Recommendations panel on recommendations tab (now handled in Content Audit) */}
        {activeSection === 'recommendations' && (
          <div>
            <div className="p-8 text-center text-zinc-400">
              Recommendations have been moved to the Content Audit section.
            </div>
          </div>
        )}

        {/* Show Schema Generator on schema-generator / structured-data tab */}
        {(activeSection === 'schema-generator' || activeSection === 'structured-data') && (
          <div>
            <SchemaGeneratorTable 
              sessionId={sessionId}
              jobId={jobId ?? null}
              sessionStatus={crawlStatus}
            />
          </div>
        )}

        {/* Show AI Intelligence Module on ai-intelligence tab */}
        {activeSection === 'ai-intelligence' && (
          <AIIntelligenceModule 
            url={session?.startUrl || ''}
            sessionId={sessionId}
            jobId={jobId}
          />
        )}

        {/* Show Module E on module-e tab */}
        {activeSection === 'module-e' && (
          <div className="space-y-6">
            {/* Competitor Mentions */}
            <div className="rounded-2xl p-6 border border-zinc-800 bg-[#111113]">
              <CompetitorMentionsSection jobId={jobId} />
            </div>

            {/* Brand Analysis */}
            <div className="rounded-2xl p-6 border border-zinc-800 bg-[#111113]">
              <BrandAnalysisSection jobId={jobId} />
            </div>

            {/* Live Crawl Progress — shown only while the crawl job is running */}
            {snapshotJobId && (
              <CrawlStatusBanner
                jobId={snapshotJobId}
                initialStatus={
                  isSnapshotJobRunning ? 'running'
                    : (crawlJob?.status === 'COMPLETED' || crawlJob?.status === 'completed' ||
                       quickStartJob?.status === 'COMPLETED' || quickStartJob?.status === 'completed')
                      ? 'completed'
                      : (crawlJob?.status === 'FAILED' || crawlJob?.status === 'failed' ||
                         quickStartJob?.status === 'FAILED' || quickStartJob?.status === 'failed')
                        ? 'failed'
                        : (bgCrawlStatus as any) ?? null
                }
                onViewPages={() => handleSectionChange('crawler')}
                onResume={() => {
                  if (snapshotJobId) {
                    setQsPollingActive(true)
                    resumeCrawl(snapshotJobId)
                  }
                }}
                pagesCrawled={jobSnapshot?.pagesCrawled ?? 0}
                totalPages={100}
                currentUrl={
                  jobSnapshot?.links && jobSnapshot.links.length > 0
                    ? [...jobSnapshot.links].sort((a, b) => b.timestamp - a.timestamp)[0]?.url
                    : session?.startUrl
                }
              />
            )}

            {/* AI Share of Voice */}
            <div className="rounded-2xl p-6 border border-zinc-800 bg-[#111113]">
              <ShareOfVoiceSection jobId={jobId} />
            </div>

            {/* Trends by Model */}
            <div className="rounded-2xl p-6 border border-zinc-800 bg-[#111113]">
              <TrendsByModelSection jobId={jobId} />
            </div>
          </div>
        )}

        {activeSection === 'keyword-intelligence' && (
          <div className="space-y-6">
            <div className="rounded-2xl p-6 border border-zinc-800 bg-[#111113]">
              <AICitationRanking url={session?.startUrl || ''} />
            </div>
          </div>
        )}

        {activeSection === 'content-metrics' && (
          <ContentMetricsModule 
            url={session?.startUrl || ''}
            sessionId={sessionId}
          />
        )}

        {activeSection === 'discover-prompts' && (
          <ContentMetricsModule 
            url={session?.startUrl || ''}
            sessionId={sessionId}
            section="content-analysis"
          />
        )}

        {activeSection === 'topic-clusters' && (
          <ContentMetricsModule 
            url={session?.startUrl || ''}
            sessionId={sessionId}
            section="intent-clusters"
          />
        )}

        {activeSection === 'content-matrix' && (
          <ContentMetricsModule 
            url={session?.startUrl || ''}
            sessionId={sessionId}
            section="entity-detection"
          />
        )}

        {/* Exports tab */}
        {activeSection === 'exports' && (
          <ExportsTab
            pages={transformedPages}
            linksMap={linksMap}
            brokenLinks={derivedBrokenLinks}
            jobId={jobId}
            sessionName={session?.startUrl
              ? new URL(session.startUrl.startsWith('http') ? session.startUrl : `https://${session.startUrl}`).hostname
              : sessionId}
            isLoading={isLoadingResults}
          />
        )}

        {/* Placeholder for other tabs */}
        {activeSection !== 'crawler' && activeSection !== 'crawled-data' && activeSection !== 'page-metrics' && activeSection !== 'text-quality' && activeSection !== 'wordcount' && activeSection !== 'broken-links' && activeSection !== 'audit-checker' && activeSection !== 'link-analysis' && activeSection !== 'performance' && activeSection !== 'recommendations' && activeSection !== 'schema-generator' && activeSection !== 'ai-intelligence' && activeSection !== 'module-e' && activeSection !== 'content-metrics' && activeSection !== 'discover-prompts' && activeSection !== 'topic-clusters' && activeSection !== 'content-matrix' && activeSection !== 'keyword-intelligence' && activeSection !== 'exports' && activeSection !== 'serp-analyzer' && (
          <div className="rounded-2xl p-8 border border-zinc-800 bg-[#111113] text-center">
            <h2 className="text-xl font-semibold text-white mb-2">
              {activeSection.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            </h2>
            <p className="text-zinc-500">This section is under development.</p>
          </div>
        )}
      </div>
    </SessionLayout>
  )
}
