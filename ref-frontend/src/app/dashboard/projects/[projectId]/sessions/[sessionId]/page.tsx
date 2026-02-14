'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Clock, Globe, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CrawlLogger, DiscoveredPages, CrawlStatusHeader } from '@/components/crawl'
import { SessionLayout } from '@/components/layout/SessionLayout'
import { CrawledDataTable, PageMetricsTable, TextQualityTable, WordCountAnalysis, BrokenLinkChecker, LinkAnalysis, PerformanceAuditsTable, SchemaGeneratorTable } from '@/components/module_A'
import { AIIntelligenceModule, ContentMetricsModule, AnswerCompletenessModule } from '@/components/module_C'
import { AICitationRanking, SentimentTracking } from '@/components/module_E'
// import { useGetDataListQuery, useCheckLinksMutation, useGetLinkStatsQuery, useLazyGetPageLinksQuery } from '@/store/api/module_A/dataApi'
import { useGetProjectQuery } from '@/store/api/projectApi'
import { useGetSessionQuery } from '@/store/api/sessionApi'
import { useGetSessionJobsQuery, useGetJobResultsQuery } from '@/store/api/jobApi'
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
  const { data: sessionData, isLoading: isLoadingSession, error: sessionError } = useGetSessionQuery(sessionId)
  const { data: projectData, isLoading: isLoadingProject } = useGetProjectQuery(projectId)
  
  const session = sessionData?.session
  const project = projectData?.project

  // Fetch jobs for this session to get the latest job ID
  const { data: jobsData, isLoading: isLoadingJobs } = useGetSessionJobsQuery(sessionId, {
    skip: !sessionId
  })

  // Get the latest job (assuming sorted by creation or just taking the last one for now)
  // The backend might return them in a specific order, but let's be safe.
  // Actually, let's just take the last created job for now.
  const jobs = jobsData?.data || []
  const latestJob = jobs.length > 0 ? jobs[0] : null // Assuming API returns newest first or we sort
  const jobId = latestJob?.id

  // Fetch results for the job
  const { data: jobResults, isLoading: isLoadingResults, refetch: refetchJobResults } = useGetJobResultsQuery(jobId!, {
    skip: !jobId
  })

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
  const transformedPages = jobResults?.pages?.map((page: any) => ({
    ...page,
    id: page._id || page.id || Math.random(),
    // CrawledDataTable props
    wordCount: page.word_count || page.wordCount || 0,
    titleLength: page.title_length || page.titleLength || 0,
    descriptionLength: page.description_length || page.descriptionLength || 0,
    statusCode: page.status_code || page.statusCode || 0,
    responseTime: page.response_time || page.responseTime || 0,
    contentType: page.content_type || page.contentType || '',
    sentenceCount: page.sentence_count || page.sentenceCount || 0,
    paragraphCount: page.paragraph_count || page.paragraphCount || 0,
    textToHtmlRatio: page.text_to_html_ratio || page.textToHtmlRatio || 0,
    metaKeywordsLength: page.meta_keywords_length || page.metaKeywordsLength || 0,
    crawlDepth: page.crawl_depth || page.crawlDepth || 0,
    folderDepth: page.folder_depth || page.folderDepth || 0,
    uniqueOutlinks: page.unique_outlinks || page.uniqueOutlinks || 0,
    uniqueJsOutlinks: page.unique_js_outlinks || page.uniqueJsOutlinks || 0,
    uniqueExternalOutlinks: page.unique_external_outlinks || page.uniqueExternalOutlinks || 0,
    uniqueExternalJsOutlinks: page.unique_external_js_outlinks || page.uniqueExternalJsOutlinks || 0,
    metaDescription: page.meta_description || page.metaDescription || '',
    canonicalUrl: page.canonical_url || page.canonicalUrl || '',
    httpRelNext: page.http_rel_next || page.httpRelNext || '',
    httpRelPrev: page.http_rel_prev || page.httpRelPrev || '',
    metaRobots: page.meta_robots || page.metaRobots || '',
    xRobotsTag: page.x_robots_tag || page.xRobotsTag || '',
    metaRefresh: page.meta_refresh || page.metaRefresh || '',
    lastModified: page.last_modified || page.lastModified || '',
    httpVersion: page.http_version || page.httpVersion || '',
    redirectUrl: page.redirect_url || page.redirectUrl || '',
    redirectType: page.redirect_type || page.redirectType || '',
    
    // PageMetrics / TextQuality / WordCount props
    totalWordCount: page.word_count || page.wordCount || 0,
    visibleWordCount: page.visible_word_count || page.visibleWordCount || (page.word_count || 0), // Fallback
    uniqueWordCount: page.unique_word_count || page.uniqueWordCount || 0,
    averageSentenceLength: page.average_sentence_length || page.averageSentenceLength || 0,
    averageParagraphLength: page.average_paragraph_length || page.averageParagraphLength || 0,
    keywordDensity: page.keyword_density || page.keywordDensity || 0,
    thinContent: page.thin_content || page.thinContent || false,
    duplicateContent: page.duplicate_content || page.duplicateContent || false,
    
    // Ensure timestamp matches
    timestamp: page.timestamp || new Date().toISOString(),
  })) || []

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
  const linkStatsData = { 
    pageStats: jobResults?.pages?.map(page => {
        // Calculate link stats using snake_case fields from backend
        // backend links are in jobResults.links[source_url]
        const pageLinks = jobResults?.links?.[page.url] || [];
        const internalOut = pageLinks.filter((l: any) => l.is_internal).length;
        const externalOut = pageLinks.filter((l: any) => !l.is_internal).length;
        
        return {
            pageId: page._id || page.id,
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
    }) || [], 
    stats: {
      totalLinks: jobResults?.session?.total_links || 0,
      internalLinks: 0, // Placeholder
      externalLinks: 0, // Placeholder
      brokenLinks: 0, // Placeholder
      linksByPosition: { header: 0, footer: 0, sidebar: 0, content: 0 }
    } 
  }
  const isLoadingLinkStats = isLoadingResults
  const refetchLinkStats = refetchJobResults

  // Mock hooks to satisfy TS and runtime usage (returning object with unwrap)
  const getPageLinks = (arg: any) => ({ unwrap: async () => ({ links: jobResults?.links?.[arg.pageId] || [] }) })
  
  // Calculate Broken Links
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const derivedBrokenLinks: any = {
    brokenInternalLinks: { count: 0, links: [] },
    brokenExternalLinks: { count: 0, links: [] },
    missingPages: { count: 0, links: [] },
    serverErrors: { count: 0, links: [] },
    timeoutUnreachable: { count: 0, links: [] }
  }

  if (jobResults?.links) {
    Object.entries(jobResults.links).forEach(([sourceUrl, links]) => {
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

  // Initialize crawl state from session data
  useEffect(() => {
    if (session) {
      if (session.status === 'running' || session.status === 'auditing') {
        setIsCrawling(true)
        setCrawlStatus(session.status)
        setCrawlStartTime(new Date(session.startedAt).getTime())
      } else {
        setIsCrawling(false)
        setCrawlStatus((session.status || 'completed') as 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled')
      }
      setPageCount(session.totalPages || 0)
    }
  }, [session])

  // Timer for elapsed time display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 100) // Update every 100ms for smooth display
    
    return () => clearInterval(timer)
  }, [])


  // Handle broken link checking
  const handleCheckLinks = async (sessionId: number) => {
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
      const page = jobResults?.pages?.find(p => (p._id || p.id) === pageId);
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
          const rawLinks = jobResults?.links?.[page.url] || [];
          return rawLinks.map((l: any) => mapLink(l, page.url));
      }
      
      // If inlinks, we would need to search all links for this targetUrl
      if (linkType === 'in') {
          const inlinks: any[] = [];
          if (jobResults?.links) {
              Object.entries(jobResults.links).forEach(([sourceUrl, links]) => {
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
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'running':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'auditing':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/30'
      default:
        return 'bg-white/10 text-white/60 border-white/20'
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
                  <Badge className={`${getStatusColor(session.status)} text-[10px] inline-flex items-center gap-1`}>
                    {getStatusIcon(session.status)}
                    {session.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-[10px] sm:text-xs text-white/60">Total Pages</p>
                  <p className="text-xs sm:text-sm text-white font-medium">{session.totalPages || 0}</p>
                </div>
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-[10px] sm:text-xs text-white/60">Total Resources</p>
                  <p className="text-xs sm:text-sm text-white font-medium">{session.totalResources || 0}</p>
                </div>
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-[10px] sm:text-xs text-white/60">Started</p>
                  <p className="text-xs sm:text-sm text-white font-medium">
                    {new Date(session.startedAt).toLocaleString()}
                  </p>
                </div>
                {session.completedAt && (
                  <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-[10px] sm:text-xs text-white/60">Completed</p>
                    <p className="text-xs sm:text-sm text-white font-medium">
                      {new Date(session.completedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {session.userId && (
                  <div className="space-y-0.5 sm:space-y-1">
                    <p className="text-[10px] sm:text-xs text-white/60">User ID</p>
                    <p className="text-xs sm:text-sm text-white font-medium">{session.userId}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Show Crawled Data Table on crawled-data tab */}
        {activeSection === 'crawled-data' && (
          <div>

            <CrawledDataTable 
              data={pagesData?.data || []}
              isLoading={isLoadingPages}
              onRefresh={() => refetchPages()}
            />
          </div>
        )}

        {/* Show Page Metrics Table on page-metrics tab */}
        {activeSection === 'page-metrics' && (
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
              sessionId={parseInt(sessionId)}
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

        {/* Show Performance Audits on performance tab */}
        {activeSection === 'performance' && (
          <div>
            <PerformanceAuditsTable 
              sessionId={parseInt(sessionId)}
              sessionStatus={crawlStatus}
            />
          </div>
        )}

        {/* Show Schema Generator on schema-generator tab */}
        {activeSection === 'schema-generator' && (
          <div>
            <SchemaGeneratorTable 
              sessionId={parseInt(sessionId)}
              sessionStatus={crawlStatus}
            />
          </div>
        )}

        {/* Show AI Intelligence Module on ai-intelligence tab */}
        {activeSection === 'ai-intelligence' && (
          <AIIntelligenceModule 
            url={session?.startUrl || ''}
            sessionId={parseInt(sessionId)}
          />
        )}

        {/* Show Module E on module-e tab */}
        {activeSection === 'module-e' && (
          <div className="space-y-6">
            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <AICitationRanking url={session?.startUrl || ''} />
            </div>
            <div className="rounded-lg p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
              <SentimentTracking brandName={project?.name || 'not configured'} />
            </div>
          </div>
        )}

        {/* Show Content Metrics on content-metrics tab */}
        {activeSection === 'content-metrics' && (
          <ContentMetricsModule 
            url={session?.startUrl || ''}
            sessionId={parseInt(sessionId)}
          />
        )}

        {/* Show Answer Completeness on answer-completeness tab */}
        {activeSection === 'answer-completeness' && (
          <AnswerCompletenessModule 
            url={session?.startUrl || ''}
            sessionId={parseInt(sessionId)}
          />
        )}

        {/* Placeholder for other tabs */}
        {activeSection !== 'crawler' && activeSection !== 'crawled-data' && activeSection !== 'page-metrics' && activeSection !== 'text-quality' && activeSection !== 'wordcount' && activeSection !== 'broken-links' && activeSection !== 'link-analysis' && activeSection !== 'performance' && activeSection !== 'schema-generator' && activeSection !== 'ai-intelligence' && activeSection !== 'module-e' && activeSection !== 'content-metrics' && activeSection !== 'answer-completeness' && (
          <div className="rounded-lg p-8 border border-white/20 bg-white/10 backdrop-blur-xl text-center">
            <h2 className="text-xl font-bold text-white mb-2">
              {activeSection.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            </h2>
            <p className="text-white/60">This section is under development.</p>
          </div>
        )}
      </div>
    </SessionLayout>
  )
}
