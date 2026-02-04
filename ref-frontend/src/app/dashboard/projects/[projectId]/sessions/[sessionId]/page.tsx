'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Clock, Globe, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CrawlLogger, DiscoveredPages, CrawlStatusHeader } from '@/components/crawl'
import { SessionLayout } from '@/components/layout/SessionLayout'

interface LogEntry {
  message: string
  timestamp: string
}

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const sessionId = params.sessionId as string
  
  const [session, setSession] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState('crawler')
  
  // Live crawl state
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

  useEffect(() => {
    // Fetch session status and project info
    const fetchData = async () => {
      try {
        // Fetch session
        const sessionResponse = await fetch(`/api/sessions/${sessionId}`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (!sessionResponse.ok) {
          throw new Error('Failed to fetch session')
        }
        
        const sessionData = await sessionResponse.json()
        const sessionInfo = sessionData.session || sessionData
        setSession(sessionInfo)
        
        // Fetch project
        const projectResponse = await fetch(`/api/projects/${projectId}`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (projectResponse.ok) {
          const projectData = await projectResponse.json()
          setProject(projectData.project || projectData)
        }
        
        // Set initial crawl state
        if (sessionInfo.status === 'running' || sessionInfo.status === 'auditing') {
          setIsCrawling(true)
          setCrawlStatus(sessionInfo.status)
          setCrawlStartTime(new Date(sessionInfo.startedAt).getTime())
        } else {
          setIsCrawling(false)
          setCrawlStatus(sessionInfo.status || 'completed')
        }
        
        setPageCount(sessionInfo.totalPages || 0)
        setIsLoading(false)
      } catch (err: any) {
        setError(err.message || 'Failed to load session')
        setIsLoading(false)
      }
    }

    fetchData()
  }, [sessionId, projectId, session?.status])

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

  // Calculate elapsed time
  const calculateElapsedTime = (): { seconds: number; milliseconds: number } => {
    const isActive = isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing'
    
    if (isActive && crawlStartTime) {
      const elapsedMs = currentTime - crawlStartTime
      return {
        seconds: Math.floor(elapsedMs / 1000),
        milliseconds: Math.floor((elapsedMs % 1000) / 100)
      }
    }
    
    if (crawlStats?.duration) {
      return { seconds: Math.floor(crawlStats.duration / 1000), milliseconds: 0 }
    }
    
    if (session?.duration) {
      return { seconds: Math.floor(session.duration / 1000), milliseconds: 0 }
    }
    
    return { seconds: 0, milliseconds: 0 }
  }

  // Calculate items per second
  const calculateItemsPerSecond = (): string => {
    const isActive = isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing'
    const elapsed = calculateElapsedTime()
    const elapsedSec = elapsed.seconds + elapsed.milliseconds / 10
    
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
        onSectionChange={setActiveSection}
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
        onSectionChange={setActiveSection}
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
      onSectionChange={setActiveSection}
    >
      <div className="p-6 space-y-6 sm:space-y-8 animate-fade-in-hero">
        {/* Crawling Status Header */}
        <CrawlStatusHeader
          crawlStatus={crawlStatus}
          isCrawling={isCrawling}
          pageCount={pageCount}
          duration={(() => {
            const elapsed = calculateElapsedTime()
            const isActive = isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing'
            return formatDuration(elapsed.seconds, elapsed.milliseconds, isActive)
          })()}
          itemsPerSecond={calculateItemsPerSecond()}
        />

        {/* Live Logs and Discovered Pages */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 h-400px">
          <CrawlLogger logs={logs} isCrawling={isCrawling} />
          <DiscoveredPages pages={discoveredPages} />
        </div>

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
      </div>
    </SessionLayout>
  )
}
