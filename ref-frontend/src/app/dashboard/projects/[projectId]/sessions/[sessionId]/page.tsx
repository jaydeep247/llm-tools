'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Clock, Globe, CheckCircle, XCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CrawlLogger, DiscoveredPages, CrawlStatusHeader } from '@/components/crawl'
import { SessionLayout } from '@/components/layout/SessionLayout'
import { CrawledDataTable, PageMetricsTable, TextQualityTable, WordCountAnalysis, BrokenLinkChecker, LinkAnalysis, PerformanceAuditsTable, SchemaGeneratorTable } from '@/components/module_A'
import { AIIntelligenceModule, ContentMetricsModule, AIVisibilityScorecards, EntityGapAnalysis, AIAnswerPreview, ImprovementActions, ModelComparison } from '@/components/module_C'
import { SiteStructure } from '@/components/module_D/site-structure'
import { AICitationRanking, ContentConsistencyEntityCoverage, BrandAnalysisSection, SentimentTrackingSection, CompetitorMentionsSection, SentimentTracking, ShareOfVoiceSection, TrendsByModelSection } from '@/components/module_E'
import { useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'
// import { useGetDataListQuery, useCheckLinksMutation, useGetLinkStatsQuery, useLazyGetPageLinksQuery } from '@/store/api/module_A/dataApi'
import { useGetProjectQuery } from '@/store/api/projectApi'
import { useGetSessionQuery } from '@/store/api/sessionApi'
import { useGetSessionJobsQuery, useGetJobPagesQuery, useGetJobLinksQuery, useGetJobSitemapsQuery, useGetJobFieldsQuery, useGetJobSiteStructureQuery, useRetryJobMutation, useGetJobSummaryQuery } from '@/store/api/jobApi'
import { formatDurationHHMMSSMS, formatDurationReadable } from '@/utils/formatDuration'

interface LogEntry {
  message: string
  timestamp: string
}

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.projectId as string
  const sessionId = params.sessionId as string

  // Fetch session and project data using RTK Query
  const { data: sessionData, isLoading: isLoadingSession, error: sessionError } = useGetSessionQuery(sessionId, { refetchOnMountOrArgChange: true })
  const { data: projectData, isLoading: isLoadingProject } = useGetProjectQuery(projectId, { refetchOnMountOrArgChange: true })

  const session = sessionData?.session
  const project = projectData?.project

  // Fetch jobs for this session to get the latest job ID
  const { data: jobsData, isLoading: isLoadingJobs } = useGetSessionJobsQuery(sessionId, {
    skip: !sessionId,
    refetchOnMountOrArgChange: true
  })

  // Get the latest job (assuming sorted by creation or just taking the last one for now)
  // The backend might return them in a specific order, but let's be safe.
  // Actually, let's just take the last created job for now.
  const jobs = jobsData?.data || []
  const sortedJobs = [...jobs].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime()
    const bTime = new Date(b.createdAt).getTime()
    return bTime - aTime
  })
  const latestCrawlJob = sortedJobs.find((job) => job.type === 'CRAWL') || null
  const jobId = latestCrawlJob?.id

  // Redirect to progress page if session is running
  useEffect(() => {
    if (session && jobs.length > 0 && (session.status === 'running' || session.status === 'auditing')) {
      // Find active job
      const activeJob = jobs.find(j => j.status === 'running' || j.status === 'pending' || j.status === 'RUNNING' || j.status === 'PENDING') || jobs[jobs.length - 1]
      if (activeJob?.id) {
        router.replace(`/dashboard/jobs/${activeJob.id}/progress`)
      }
    }
  }, [session, jobs, router])

  const { data: moduleEQueryData } = useGetModuleEResultQuery(jobId || '', {
    skip: !jobId,
  })

  // Fetch results for the job using granular endpoints
  // We can use the same limit/page logic or default to fetch all (or a large page) for now 
  // until we implement full server-side pagination in the UI. 
  // For now, let's fetch a reasonable amount to show the concept working.
  const { data: pagesResult, isLoading: isLoadingPagesRaw, refetch: refetchPagesRaw } = useGetJobPagesQuery({ jobId: jobId!, limit: 1000 }, { skip: !jobId, refetchOnMountOrArgChange: true })
  const { data: linksResult, isLoading: isLoadingLinksRaw, refetch: refetchLinksRaw } = useGetJobLinksQuery({ jobId: jobId!, limit: 1000 }, { skip: !jobId, refetchOnMountOrArgChange: true })
  const { data: fieldsResult, isLoading: isLoadingFieldsRaw, refetch: refetchFieldsRaw } = useGetJobFieldsQuery(jobId!, { skip: !jobId, refetchOnMountOrArgChange: true })
  const { data: sitemapsResult, isLoading: isLoadingSitemapsRaw, refetch: refetchSitemapsRaw } = useGetJobSitemapsQuery(jobId!, { skip: !jobId, refetchOnMountOrArgChange: true })
  const { data: jobSummary } = useGetJobSummaryQuery(jobId!, { skip: !jobId, refetchOnMountOrArgChange: true })


  const { data: siteStructureResult } = useGetJobSiteStructureQuery(jobId!, { skip: !jobId })

  // Retry job mutation for failed jobs
  const [retryJob, { isLoading: isRetrying }] = useRetryJobMutation()
  
  const handleRetry = async () => {
    if (!jobId) return
    try {
      const result = await retryJob(jobId).unwrap()
      // Redirect to progress page for the retried job
      router.push(`/dashboard/jobs/${result.job.id}/progress`)
    } catch (error) {
      console.error('Failed to retry job:', error)
    }
  }

  const isLoadingResults = isLoadingPagesRaw || isLoadingLinksRaw || isLoadingFieldsRaw || isLoadingSitemapsRaw
  const refetchJobResults = () => {
    refetchPagesRaw()
    refetchLinksRaw()
    refetchFieldsRaw()
    refetchSitemapsRaw()
  }

  const isLoading = isLoadingSession || isLoadingProject || isLoadingJobs || (!!jobId && isLoadingResults)
  const error = sessionError ? 'Failed to load session' : null

  // Ensure URL always has tab parameter with default 'crawler'
  // Ensure URL always has tab parameter with default 'crawler'
  useEffect(() => {
    if (!searchParams.get('tab')) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', 'crawler')
      router.replace(`/dashboard/projects/${projectId}/sessions/${sessionId}?${params.toString()}`, { scroll: false })
    }
  }, [searchParams, projectId, sessionId, router])

  const tab = searchParams.get('tab') || 'crawler'

  const activeSection = tab

  // Unified data transformation
  const rawPages = pagesResult?.data || []
  const rawFields = fieldsResult?.data || []
  
  const siteStructurePages = siteStructureResult?.pages ?? []
  const siteStructureStartUrl = siteStructureResult?.startUrl ?? null
  
  // Create a map of fields by URL for efficient lookup
  const fieldsMap = new Map();
  rawFields.forEach((field: any) => {
    if (field.url) {
      fieldsMap.set(field.url, field);
    }
  });

  const transformedPages = rawPages.map((page: any) => {
    // Find associated fields data
    const fieldData = fieldsMap.get(page.url) || {};
    const crawlerData = fieldData.website_crawler || {};
    const textQualityData = fieldData['Text Quality Analyzer'] || {};
    const wordCountData = fieldData.Wordcount_analysis || {};

    const pageMatrix = fieldData.page_matrix || {};

    return {
      ...page,
      id: page._id || page.id || page.url || Math.random(),
      // CrawledDataTable props
      wordCount: page.word_count || page.wordCount || 0,
      titleLength: page.title_length || page.titleLength || 0,
      titlePixelWidth: page.title_pixel_width || crawlerData.title_pixel_width || 0,
      description: page.description || page.meta_description || page.metaDescription || '',
      descriptionLength: page.description_length || page.descriptionLength || 0,
      descriptionPixelWidth: page.meta_description_pixel_width || crawlerData.meta_description_pixel_width || 0,
      statusCode: page.status_code || page.statusCode || 0,
      responseTime: page.response_time || page.responseTime || 0,
      contentType: page.content_type || page.contentType || '',
      sentenceCount: page.sentence_count || page.sentenceCount || 0,
      paragraphCount: page.paragraph_count || page.paragraphCount || 0,
      textToHtmlRatio: page.text_to_html_ratio || page.textToHtmlRatio || 0,
      metaKeywords: Array.isArray(page.meta_keywords) ? page.meta_keywords.join(', ') : (page.meta_keywords || ''),
      metaKeywordsLength: page.meta_keywords_length || page.metaKeywordsLength || 0,
      crawlDepth: page.crawl_depth || page.crawlDepth || 0,
      folderDepth: page.folder_depth || page.folderDepth || 0,
      uniqueOutlinks: page.unique_outlinks || page.uniqueOutlinks || crawlerData.unique_outlinks || 0,
      uniqueJsOutlinks: page.unique_js_outlinks || page.uniqueJsOutlinks || crawlerData.unique_js_outlinks || 0,
      uniqueExternalOutlinks: page.unique_external_outlinks || page.uniqueExternalOutlinks || crawlerData.unique_external_outlinks || 0,
      uniqueExternalJsOutlinks: page.unique_external_js_outlinks || page.uniqueExternalJsOutlinks || crawlerData.unique_external_js_outlinks || 0,
      metaDescription: page.meta_description || page.metaDescription || '',
      canonicalUrl: page.canonical_url || page.canonicalUrl || '',
      httpRelNext: page.http_rel_next || page.httpRelNext || crawlerData.http_rel_next || '',
      httpRelPrev: page.http_rel_prev || page.httpRelPrev || crawlerData.http_rel_prev || '',
      relNext: page.rel_next || page.relNext || crawlerData.rel_next || '',
      relPrev: page.rel_prev || page.relPrev || crawlerData.rel_prev || '',
      metaRobots: page.meta_robots || page.metaRobots || '',
      xRobotsTag: page.x_robots_tag || page.xRobotsTag || '',
      metaRefresh: page.meta_refresh || page.metaRefresh || '',
      lastModified: page.last_modified || page.lastModified || pageMatrix.last_modified || '',
      httpVersion: page.http_version || page.httpVersion || '',

      // Redirects (Check both page and fields as backup)
      redirectUrl: page.redirect_url || page.redirectUrl || crawlerData.redirect_url || '',
      redirectType: page.redirect_type || page.redirectType || crawlerData.redirect_type || '',

      // Error Message
      errorMessage: page.error_message || page.errorMessage || crawlerData.error_message || '',

      // Size / Carbon Attributes
      sizeBytes: page.page_size_bytes || crawlerData.transferred_bytes || 0,
      transferredBytes: crawlerData.transferred_bytes || 0,
      totalTransferredBytes: crawlerData.total_transferred_bytes || crawlerData.transferred_bytes || 0,
      co2Mg: crawlerData.co2_mg || 0,
      carbonRating: crawlerData.carbon_rating || 'Unknown',

      // Hashes / Duplicates
      contentHash: page.content_hash || crawlerData.hash || '',
      nearDuplicateCount: crawlerData.no_near_duplicates || 0,
      closestDuplicateSimilarity: crawlerData.closest_near_duplicate_match || 0,
      closestDuplicateUrl: crawlerData.closest_duplicate_url || '',

      // Scores
      linkScore: page.link_score || page.linkScore || pageMatrix.link_score || 0,
      semanticSimilarityScore: page.semantic_similarity_score || page.semanticSimilarityScore || pageMatrix.semantic_similarity_score || 0,
      semanticRelevanceScore: page.semantic_relevance_score || page.semanticRelevanceScore || pageMatrix.semantic_relevance_score || 0,

      // Page Matrix Fields (Mapped from page_matrix in fields)
      resourceType: pageMatrix.resource_type || 'HTML',


      // Tables
      hasTables: pageMatrix.has_tables || false,
      tableCount: pageMatrix.table_count || 0,
      tableData: pageMatrix.table_data || '',

      // FAQs
      hasFaqs: pageMatrix.has_faqs || false,
      faqCount: pageMatrix.faq_count || 0,
      faqScore: pageMatrix.faq_score || 0,
      faqDetectionMethod: pageMatrix.faq_detection_method || '',
      faqSchemaPresent: pageMatrix.faq_schema_present || false,
      faqData: pageMatrix.faq_data || '',

      // Mixed Content
      hasMixedContent: pageMatrix.has_mixed_content || false,
      mixedContentSeverity: pageMatrix.mixed_content_severity || 'none',
      activeMixedContentCount: pageMatrix.active_mixed_content_count || 0,
      passiveMixedContentCount: pageMatrix.passive_mixed_content_count || 0,
      totalInsecureResources: pageMatrix.total_insecure_resources || 0,
      mixedContentData: pageMatrix.mixed_content_data || '',

      // Duplicate Content specifics
      duplicateTitleCount: pageMatrix.duplicate_title_count || 0,

      // PageMetrics / TextQuality / WordCount props
      // Map from crawlerData or other field modules if not in page
      totalWordCount: page.word_count || page.wordCount || 0,
      visibleWordCount: page.visible_word_count || page.visibleWordCount || (page.word_count || 0),
      uniqueWordCount: page.unique_word_count || page.uniqueWordCount || 0,
      averageSentenceLength: page.average_sentence_length || page.averageSentenceLength || crawlerData.average_words_per_sentence || 0,
      averageParagraphLength: page.average_paragraph_length || page.averageParagraphLength || 0,
      keywordDensity: page.keyword_density || page.keywordDensity || 0,

      // Fields from website_crawler -> Map to CrawledDataTable expected keys
      fleschReadingEase: crawlerData.flesch_reading_ease_score || 0,
      readabilityLevel: crawlerData.readability || 'Unknown',
      averageWordsPerSentence: crawlerData.average_words_per_sentence || 0,

      // Indexability Status (derived)
      indexabilityStatus: (page.meta_robots?.includes('noindex') || page.x_robots_tag?.includes('noindex')) ? 'Non-Indexable' : 'Indexable',
      indexable: !(page.meta_robots?.includes('noindex') || page.x_robots_tag?.includes('noindex')),

    // PageMetrics Specific Statuses (derived)
    titleStatus: (page.title_length === 0) ? 'Missing' : 'OK', // Simple derivation
    metaDescriptionStatus: (page.description_length === 0) ? 'Missing' : 'OK',
    
    // Text Quality Fields
    grammarErrors: crawlerData.grammar_errors || 0,
    spellingErrors: crawlerData.spelling_errors || 0,
    
    // Other status
    thinContent: page.thin_content || page.thinContent || false,
    duplicateContent: page.duplicate_content || page.duplicateContent || false,
    
    // Ensure timestamp matches
    timestamp: page.timestamp || new Date().toISOString(),
    
    // Attach full field data for components that might dig deeper
    fields: fieldData
  }})

  const totalPagesCount =
    pagesResult?.pagination?.total ??
    session?.totalPages ??
    jobSummary?.session?.total_pages ??
    transformedPages.length

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
    const actualStatus = session?.status || jobSummary?.session?.status || 'idle'
    
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
      // Use session.totalPages first, fallback to jobSummary
      setPageCount(session.totalPages || jobSummary?.session?.total_pages || 0)
    } else if (jobSummary?.session) {
      // No session but we have jobSummary
      const summaryStatus = jobSummary.session.status?.toLowerCase() as 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'
      setCrawlStatus(summaryStatus || 'completed')
      setPageCount(jobSummary.session.total_pages || 0)
    }
    
    // Use jobSummary for more accurate data when available
    if (jobSummary?.session) {
      const summarySession = jobSummary.session
      // Set page count from job summary if session doesn't have it
      if (!session?.totalPages && summarySession.total_pages) {
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
        const pps = durationSec > 0 ? summarySession.total_pages / durationSec : 0
        setCrawlStats({
          count: summarySession.total_pages,
          duration: durationMs,
          pagesPerSecond: pps
        })
      }
    }
  }, [session, jobSummary])

  // Timer for elapsed time display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 100) // Update every 100ms for smooth display

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
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-400/50'
      case 'running':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-400/50 shadow-[0_0_10px_rgba(34,211,238,0.3)] animate-pulse'
      case 'auditing':
        return 'bg-amber-500/20 text-amber-400 border-amber-400/50 shadow-[0_0_10px_rgba(251,191,36,0.3)]'
      case 'failed':
      case 'cancelled':
        return 'bg-rose-500/20 text-rose-400 border-rose-400/50 shadow-[0_0_10px_rgba(251,113,133,0.3)]'
      case 'pending':
        return 'bg-violet-500/20 text-violet-400 border-violet-400/50 shadow-[0_0_10px_rgba(167,139,250,0.3)]'
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
            <div className="h-8 sm:h-10 md:h-12 w-48 sm:w-64 bg-white/10 rounded animate-pulse"></div>
            <div className="h-4 sm:h-5 w-32 sm:w-48 bg-white/10 rounded animate-pulse"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg p-3 sm:p-4 md:p-5 border border-white/20 bg-white/10 backdrop-blur-xl animate-pulse">
                <div className="h-20 sm:h-24 bg-white/10 rounded"></div>
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
            <AlertCircle className="h-16 w-16 text-red-400 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Session not found</h2>
            <p className="text-white/60 mb-4">{error || 'The session you\'re looking for doesn\'t exist'}</p>
            <Button
              onClick={() => router.push(`/dashboard/projects/${projectId}`)}
              className="bg-white text-black hover:bg-slate-100 cursor-pointer"
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
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
    >
      <div className="p-6 space-y-6 sm:space-y-8 animate-fade-in-hero">
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
            <div className="rounded-lg p-3 sm:p-4 md:p-5 border border-white/20 bg-white/10 backdrop-blur-xl">
              <h2 className="text-base sm:text-lg md:text-xl font-bold text-white mb-3 sm:mb-4">Session Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-[10px] sm:text-xs text-white/60">Session ID</p>
                  <p className="text-xs sm:text-sm text-white font-medium">#{session.id}</p>
                </div>
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-[10px] sm:text-xs text-white/60">Project ID</p>
                  <p className="text-xs sm:text-sm text-white font-medium">{session.projectId}</p>
                </div>
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-[10px] sm:text-xs text-white/60">Start URL</p>
                  <p className="text-xs sm:text-sm text-white font-medium truncate">{session.startUrl}</p>
                </div>
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-[10px] sm:text-xs text-white/60">Status</p>
                  <div className="flex items-center gap-2">
                    <Badge className={`${getStatusColor(session.status)} text-[10px] inline-flex items-center gap-1`}>
                      {getStatusIcon(session.status)}
                      {session.status.toUpperCase()}
                    </Badge>
                    {session.status === 'failed' && jobId && (
                      <Button
                        onClick={handleRetry}
                        disabled={isRetrying}
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] bg-white/10 border-white/20 hover:bg-white/20"
                      >
                        {isRetrying ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <RefreshCw className="h-3 w-3 mr-1" />
                        )}
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-[10px] sm:text-xs text-white/60">Total Pages</p>
                  <p className="text-xs sm:text-sm font-semibold">{totalPagesCount}</p>
                </div>
                {(session.completedAt || jobSummary?.session?.completed_at) && (
                  <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-[10px] sm:text-xs text-white/60">Completed</p>
                    <p className="text-xs sm:text-sm font-semibold">
                      {new Date(session.completedAt || jobSummary?.session?.completed_at || '').toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Crawled Pages Summary Table */}
            <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl overflow-hidden">
              <div className="bg-white/5 px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-semibold text-white">📄 Crawled Pages ({transformedPages.length})</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => refetchJobResults()}
                  className="text-white/60 hover:text-white hover:bg-white/10"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <div className="overflow-x-auto">
                {isLoadingResults ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-white/60" />
                    <span className="ml-2 text-white/60">Loading crawled pages...</span>
                  </div>
                ) : transformedPages.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-white/40">
                    No pages crawled yet
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">URL</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">Title</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">Words</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">Response</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">Depth</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {transformedPages.slice(0, 6).map((page: any, idx: number) => {
                        const responseTime = page.responseTime || page.response_time || 0;
                        const wordCount = page.wordCount || page.word_count || 0;
                        const crawlDepth = page.crawlDepth || page.crawl_depth || 0;
                        
                        return (
                          <tr key={page.id || idx} className="hover:bg-white/5 transition-colors">
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
                            <td className="px-4 py-3 text-sm text-white/80 truncate max-w-50" title={page.title}>
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
                                  : 'text-white/40'
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
                                  : 'bg-white/10 text-white/60'
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
                  <div className="px-4 py-3 border-t border-white/10 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSectionChange('crawled-data')}
                      className="text-blue-400 hover:text-blue-300 hover:bg-white/5"
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
          <div>
            <PageMetricsTable
              data={pageMetricsData?.data || []}
              isLoading={isLoadingMetrics}
              onRefresh={() => refetchMetrics()}
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
              sessionId={sessionId}
              onCheck={handleCheckLinks}
              checkResults={linkCheckData?.results || null}
              isChecking={isCheckingLinks}
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

        {/* Show Site Structure on site-structure / content-brief-builder / add-to-Tracking tabs */}
        {(activeSection === 'site-structure' || activeSection === 'content-brief-builder' || activeSection === 'add-to-Tracking') && (
          <div className="rounded-lg p-4 sm:p-6 border border-white/20 bg-white/10 backdrop-blur-xl h-150">
            <SiteStructure
              sessionId={sessionId}
              pages={siteStructurePages}
              startUrl={siteStructureStartUrl}
              jobId={jobId || null}
            />
          </div>
        )}

        {/* Show Performance Audits on performance tab */}
        {activeSection === 'performance' && (
          <div>
            <PerformanceAuditsTable
              sessionId={sessionId}
              sessionStatus={crawlStatus}
            />
          </div>
        )}

        {/* Show Schema Generator on schema-generator / structured-data tab */}
        {(activeSection === 'schema-generator' || activeSection === 'structured-data') && (
          <div>
            <SchemaGeneratorTable 
              sessionId={sessionId}
              jobId={jobId || null}
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

        {/* Show AI Visibility Scorecards on ai-visibility-scorecards tab */}
        {activeSection === 'ai-visibility-scorecards' && (
          <AIVisibilityScorecards
            url={session?.startUrl || ''}
            sessionId={sessionId}
            jobId={jobId}
          />
        )}

        {/* Entity & Gap Analysis */}
        {activeSection === 'entity-and-gap-analysis' && (
          <EntityGapAnalysis jobId={jobId} url={session?.startUrl || ''} />
        )}

        {/* AI Answer Preview (answer-completeness in sidebar) */}
        {activeSection === 'answer-completeness' && (
          <AIAnswerPreview jobId={jobId} url={session?.startUrl || ''} />
        )}

        {/* Improvement Actions */}
        {activeSection === 'improvement-actions' && (
          <ImprovementActions jobId={jobId} url={session?.startUrl || ''} />
        )}

        {/* Model Comparison */}
        {activeSection === 'model-comparison' && (
          <ModelComparison jobId={jobId} url={session?.startUrl || ''} />
        )}

        {/* Show Module E on module-e tab */}
        {activeSection === 'module-e' && (
          <div className="space-y-6">
            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <AICitationRanking jobId={jobId} url={session?.startUrl || ''} />
            </div>

            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <ContentConsistencyEntityCoverage jobId={jobId} />
            </div>

            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <BrandAnalysisSection jobId={jobId} />
            </div>

            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <SentimentTrackingSection jobId={jobId} />
            </div>

            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <CompetitorMentionsSection jobId={jobId} />
            </div>
          </div>
        )}

        {activeSection === 'prompt-difficulty' && (
          <div className="space-y-6">
            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <BrandAnalysisSection jobId={jobId} />
            </div>
            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <CompetitorMentionsSection jobId={jobId} />
            </div>
          </div>
        )}

        {activeSection === 'share-of-voice' && (
          <div className="space-y-6">
            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <ShareOfVoiceSection jobId={jobId} />
            </div>
          </div>
        )}

        {activeSection === 'trends-by-model' && (
          <div className="space-y-6">
            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <TrendsByModelSection jobId={jobId} />
            </div>
          </div>
        )}

        {activeSection === 'keyword-intelligence' && (
          <div className="space-y-6">
            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <ContentConsistencyEntityCoverage jobId={jobId} />
            </div>
          </div>
        )}

        {activeSection === 'prompt-opportunities' && (
          <div className="space-y-6">
            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <AICitationRanking jobId={jobId} url={session?.startUrl || ''} />
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
            initialTab="content-analysis"
          />
        )}

        {activeSection === 'topic-clusters' && (
          <ContentMetricsModule
            url={session?.startUrl || ''}
            sessionId={sessionId}
            initialTab="intent-clusters"
          />
        )}

        {activeSection === 'content-matrix' && (
          <ContentMetricsModule
            url={session?.startUrl || ''}
            sessionId={sessionId}
            initialTab="content-analysis"
          />
        )}

      </div>
    </SessionLayout>
  )
}
