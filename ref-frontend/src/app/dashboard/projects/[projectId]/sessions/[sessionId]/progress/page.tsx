'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, ArrowRight, Globe, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface LogEntry {
  message: string
  timestamp: string
}

export default function SessionProgressPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const sessionId = params.sessionId as string
  
  const [session, setSession] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [crawlStatus, setCrawlStatus] = useState<'idle' | 'running' | 'auditing' | 'completed' | 'cancelled' | 'failed'>('idle')
  const [pageCount, setPageCount] = useState(0)
  const [discoveredPages, setDiscoveredPages] = useState<string[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [crawlStartTime, setCrawlStartTime] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [estimatedTotal, setEstimatedTotal] = useState<number | null>(null)
  const [progressPercentage, setProgressPercentage] = useState(0)
  const [activeLogTab, setActiveLogTab] = useState<'logs' | 'pages'>('logs')

  // Timer for elapsed time display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 100)
    
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
      
      setDiscoveredPages(prev => [...prev.slice(-49), data.url])
      setPageCount(prev => prev + 1)
      
      // Update progress percentage
      if (estimatedTotal && estimatedTotal > 0) {
        const newPercentage = Math.min((pageCount / estimatedTotal) * 100, 95)
        setProgressPercentage(newPercentage)
      }
    })

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data)
      if (data.sessionId && data.sessionId !== parseInt(sessionId)) return
      
      const nextStatus = data.status || 'completed'
      setCrawlStatus(nextStatus)
      
      if (nextStatus === 'completed' || nextStatus === 'cancelled') {
        setProgressPercentage(100)
        setCrawlStartTime(null)
        // Redirect to main session page after completion
        // Commented out for testing
        // setTimeout(() => {
        //   router.push(`/dashboard/projects/${projectId}/sessions/${sessionId}`)
        // }, 2000)
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
            setCrawlStatus(data.status)
          } else if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
            setCrawlStatus(data.status)
            setCrawlStartTime(null)
            if (data.status === 'completed') {
              setProgressPercentage(100)
              // Commented out for testing
              // setTimeout(() => {
              //   router.push(`/dashboard/projects/${projectId}/sessions/${sessionId}`)
              // }, 2000)
            }
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
  }, [sessionId, router, projectId, estimatedTotal, pageCount])

  useEffect(() => {
    const fetchSession = async () => {
      try {
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
        
        // Set initial state
        if (sessionInfo.status === 'running' || sessionInfo.status === 'auditing') {
          setCrawlStatus(sessionInfo.status)
          setCrawlStartTime(new Date(sessionInfo.startedAt).getTime())
        } else if (sessionInfo.status === 'completed') {
          // If already completed, redirect to main page
          // Commented out for testing
          // router.push(`/dashboard/projects/${projectId}/sessions/${sessionId}`)
          setCrawlStatus('completed')
          setProgressPercentage(100)
        } else {
          setCrawlStatus(sessionInfo.status || 'idle')
        }
        
        setPageCount(sessionInfo.totalPages || 0)
        
        // Estimate total pages (rough estimate based on average website)
        setEstimatedTotal(100)
        
        setIsLoading(false)
      } catch (err: any) {
        setIsLoading(false)
        // On error, redirect to main page
        // Commented out for testing
        // setTimeout(() => {
        //   router.push(`/dashboard/projects/${projectId}/sessions/${sessionId}`)
        // }, 1000)
      }
    }

    fetchSession()
  }, [sessionId, projectId, router])

  // Calculate elapsed time
  const calculateElapsedTime = (): string => {
    if (crawlStartTime && (crawlStatus === 'running' || crawlStatus === 'auditing')) {
      const elapsedMs = currentTime - crawlStartTime
      const seconds = Math.floor(elapsedMs / 1000)
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)
      
      const pad = (n: number) => n.toString().padStart(2, '0')
      
      if (hours > 0) {
        return `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}`
      }
      return `${minutes}:${pad(seconds % 60)}`
    }
    return '0:00'
  }

  // Calculate estimated time remaining
  const calculateEstimatedTime = (): string => {
    if (!crawlStartTime || pageCount === 0 || !estimatedTotal) return 'Calculating...'
    
    const elapsedMs = currentTime - crawlStartTime
    const elapsedSeconds = elapsedMs / 1000
    const rate = pageCount / elapsedSeconds
    
    if (rate === 0) return 'Calculating...'
    
    const remainingPages = Math.max(0, estimatedTotal - pageCount)
    const remainingSeconds = remainingPages / rate
    
    const minutes = Math.floor(remainingSeconds / 60)
    const seconds = Math.floor(remainingSeconds % 60)
    
    if (minutes > 0) {
      return `~${minutes}m ${seconds}s`
    }
    return `~${seconds}s`
  }

  // Update progress based on page count
  useEffect(() => {
    if (estimatedTotal && estimatedTotal > 0 && pageCount > 0) {
      const percentage = Math.min((pageCount / estimatedTotal) * 100, 95)
      setProgressPercentage(percentage)
    }
  }, [pageCount, estimatedTotal])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 text-white animate-spin" />
          <p className="text-white/60 text-lg">Loading session...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
      {/* Dotted Background Pattern */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      ></div>
      
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-fade-in-hero relative z-10">
        {/* Left Section - Session Info */}
        <div className="lg:col-span-2 flex flex-col justify-center gap-8">
          <div className="flex flex-col gap-7">
            <div className="space-y-4">
              <span className="text-white/50 text-lg font-medium tracking-wide">Session</span>
              <div>
                <Badge className="bg-white/20 text-white border-white/30 text-2xl px-6 py-2.5 font-bold">
                  #{sessionId}
                </Badge>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Globe className="h-7 w-7 text-purple-400 shrink-0 mt-1" />
                <span className="text-white/85 text-lg break-all leading-relaxed">{session?.startUrl || 'Loading...'}</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Clock className="h-7 w-7 text-blue-400 shrink-0" />
                <span className="text-white/90 text-3xl font-mono font-bold tracking-wide">{calculateElapsedTime()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Section - Concentric Rings Loading Animation */}
        <div className="lg:col-span-7 flex items-center justify-center py-8">
          <div className="relative w-125 h-125 flex items-center justify-center">
            {/* Center Counter */}
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-white text-7xl font-bold">
                {pageCount}
              </div>
            </div>
            
            {/* Ring 1 - Inner with dot */}
            <div className="absolute inset-0 flex items-center justify-center animate-spin-slow">
              <div className="relative w-48 h-48 rounded-full border border-white/20">
                <div className="absolute w-2.5 h-2.5 rounded-full bg-purple-400 -top-1.5 left-1/2 transform -translate-x-1/2"></div>
              </div>
            </div>
            
            {/* Ring 2 - Middle with dot */}
            <div className="absolute inset-0 flex items-center justify-center animate-spin-medium">
              <div className="relative w-80 h-80 rounded-full border border-white/15">
                <div className="absolute w-2.5 h-2.5 rounded-full bg-blue-400 -top-1.5 left-1/2 transform -translate-x-1/2"></div>
              </div>
            </div>
            
            {/* Ring 3 - Outer with dot */}
            <div className="absolute inset-0 flex items-center justify-center animate-spin-fast">
              <div className="relative w-125 h-125 rounded-full border border-white/10">
                <div className="absolute w-2.5 h-2.5 rounded-full bg-green-400 -top-1.5 left-1/2 transform -translate-x-1/2"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Combined Logs with Sidebar */}
        <div className="lg:col-span-3 h-150 flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          {/* Sidebar */}
          <div className="w-16 flex flex-col gap-2 p-2 border-r border-white/10 bg-white/5">
            <button
              onClick={() => setActiveLogTab('logs')}
              className={`p-3 rounded-lg transition-all ${
                activeLogTab === 'logs'
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
              }`}
              title="Live Logs"
            >
              📝
            </button>
            <button
              onClick={() => setActiveLogTab('pages')}
              className={`p-3 rounded-lg transition-all ${
                activeLogTab === 'pages'
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
              }`}
              title="Discovered Pages"
            >
              ✅
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white/90">
                {activeLogTab === 'logs' ? '📝 Live Logs' : '✅ Recently Discovered Pages'}
              </h3>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
              {activeLogTab === 'logs' ? (
                <div className="space-y-1.5">
                  {logs.length === 0 ? (
                    <div className="text-center py-8 text-white/50">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      <p className="text-xs">Waiting for logs...</p>
                    </div>
                  ) : (
                    logs.slice().reverse().map((log, index) => (
                      <div 
                        key={`${log.timestamp}-${index}`}
                        className="flex items-start gap-2 text-xs p-2 rounded-md hover:bg-white/5"
                      >
                        <span className="text-white/40 font-mono shrink-0 text-[10px]">{log.timestamp}</span>
                        <span className="text-white/70 break-all">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {discoveredPages.length === 0 ? (
                    <div className="text-center py-8 text-white/50">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      <p className="text-xs">Waiting for pages...</p>
                    </div>
                  ) : (
                    discoveredPages.slice().reverse().map((page, index) => (
                      <div 
                        key={`${page}-${index}`}
                        className="flex items-start gap-2 p-2 rounded-md hover:bg-white/5 transition-colors"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                        <span className="text-white/70 text-xs break-all">{page}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Navigation Option - Floating at Bottom */}
      {crawlStatus === 'completed' && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 animate-fade-in-hero">
          <Button
            onClick={() => router.push(`/dashboard/projects/${projectId}/sessions/${sessionId}`)}
            className="bg-white text-black hover:bg-slate-100 rounded-xl px-6 py-3 text-sm font-semibold shadow-lg"
          >
            View Results
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  )
}
