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
import { useGetSessionQuery, useGetProjectQuery } from '@/store/api/projectApi'
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
  const { data: sessionData, isLoading: isLoadingSession, error: sessionError } = useGetSessionQuery(parseInt(sessionId))
  const { data: projectData, isLoading: isLoadingProject } = useGetProjectQuery(projectId)
  
  const session = sessionData?.session
  const project = projectData?.project
  const isLoading = isLoadingSession || isLoadingProject
  const error = sessionError ? 'Failed to load session' : null
  
  // Ensure URL always has tab parameter with default 'crawler'
  const tab = searchParams.get('tab') || 'crawler'
  if (!searchParams.get('tab')) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'crawler')
    router.replace(`/dashboard/projects/${projectId}/sessions/${sessionId}?${params.toString()}`, { scroll: false })
  }
  
  const activeSection = tab
  
  // Extraneous API calls removed
  const pagesData = { data: [] }
  const isLoadingPages = false
  const refetchPages = () => {}

  const pageMetricsData = { data: [] }
  const isLoadingMetrics = false
  const refetchMetrics = () => {}

  const textQualityData = { data: [] }
  const isLoadingTextQuality = false
  const refetchTextQuality = () => {}

  const wordCountData = { data: [] }
  const isLoadingWordCount = false
  const refetchWordCount = () => {}

  const linkStatsData = { pageStats: [], stats: null }
  const isLoadingLinkStats = false
  const refetchLinkStats = () => {}

  // Mock hooks to satisfy TS and runtime usage (returning object with unwrap)
  const getPageLinks = (arg: any) => ({ unwrap: async () => ({ links: [] }) })
  
  const checkLinks = (arg: any) => ({ unwrap: async () => ({ results: {
    brokenInternalLinks: [],
    brokenExternalLinks: [],
    missingPages: [],
    serverErrors: [],
    timeoutUnreachable: []
  } }) } as any)
  const linkCheckData = { results: null }
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

  // Server-Sent Events for live updates
  useEffect(() => {
    const eventSource = new EventSource('/events', {
      withCredentials: true
    })

    eventSource.addEventListener('connected', (e) => {
      console.log('SSE connected:', JSON.parse(e.data))
    })

    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data)
      if (data.sessionId && data.sessionId !== parseInt(sessionId)) return
      
      setLogs(prev => [...prev.slice(-99), {
        message: data.message,
        timestamp: new Date().toLocaleTimeString()
      }])
    })

    eventSource.addEventListener('page', (e) => {
      const data = JSON.parse(e.data)
      if (data.sessionId && data.sessionId !== parseInt(sessionId)) return
      
      setDiscoveredPages(prev => [...prev.slice(-199), data.url])
      setPageCount(prev => prev + 1)
    })

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data)
      if (data.sessionId && data.sessionId !== parseInt(sessionId)) return
      
      setCrawlStats({
        count: data.count,
        duration: data.duration || 0,
        pagesPerSecond: data.pagesPerSecond || 0
      })
      
      const nextStatus = data.status || 'completed'
      setIsCrawling(nextStatus === 'auditing')
      setCrawlStatus(nextStatus)
      if (nextStatus === 'completed' || nextStatus === 'cancelled') {
        setCrawlStartTime(null)
      }
      
      setLogs(prev => [...prev, {
        message: nextStatus === 'auditing' 
          ? `✅ Crawl completed! Starting audits... Total URLs: ${data.count}`
          : `✅ Crawl completed! Total URLs: ${data.count}`,
        timestamp: new Date().toLocaleTimeString()
      }])
    })

    eventSource.addEventListener('session-status-update', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data?.sessionId && data.sessionId !== parseInt(sessionId)) return
        
        const message = data?.message || `Session ${data?.status || ''}`.trim()
        if (message) {
          setLogs(prev => [...prev.slice(-99), {
            message,
            timestamp: new Date().toLocaleTimeString()
          }])
        }
        
        if (data?.status) {
          if (data.status === 'running' || data.status === 'auditing') {
            setIsCrawling(true)
            setCrawlStatus(data.status)
          } else if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
            setIsCrawling(false)
            setCrawlStatus(data.status)
            setCrawlStartTime(null)
          }
        }
      } catch {}
    })

    eventSource.addEventListener('audit', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.sessionId && data.sessionId !== parseInt(sessionId)) return
        
        let message = ''
        if (data?.type === 'audit-start') {
          message = `🔍 Audit started: ${data.url}`
          setIsCrawling(true)
          setCrawlStatus('auditing')
        } else if (data?.type === 'audit-complete') {
          if (data.success) {
            const parts: string[] = []
            if (data.performanceScore !== undefined) parts.push(`Score ${data.performanceScore.toFixed(2)}`)
            if (data.lcp !== undefined) parts.push(`LCP ${data.lcp.toFixed(2)}ms`)
            if (data.tbt !== undefined) parts.push(`TBT ${data.tbt.toFixed(2)}ms`)
            if (data.cls !== undefined) parts.push(`CLS ${data.cls.toFixed(2)}`)
            message = `✅ Audit: ${data.url} ${parts.length ? `(${parts.join(', ')})` : ''}`.trim()
          } else {
            message = `❌ Audit failed: ${data.url}${data.error ? ` - ${data.error}` : ''}`
          }
        } else if (data?.type === 'audit-progress') {
          const progress = data.progress?.toFixed(2) || ''
          message = `⏳ Audits progress: ${data.completed}/${data.total} ${progress ? `${progress}%` : ''}`.trim()
        }
        
        if (message) {
          setLogs(prev => [...prev.slice(-99), {
            message,
            timestamp: new Date().toLocaleTimeString()
          }])
        }
      } catch {}
    })

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error)
    }

    return () => {
      eventSource.close()
    }
  }, [sessionId])

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
      const result = await getPageLinks({
        sessionId: parseInt(sessionId),
        pageId,
        type: linkType
      }).unwrap()
      return result.links
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
