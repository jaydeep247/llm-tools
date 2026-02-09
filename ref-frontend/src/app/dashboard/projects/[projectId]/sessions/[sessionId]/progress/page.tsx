'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { Loader2, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence, easeOut, easeIn } from 'framer-motion'
import { Button } from '@/components/ui/button'
import Aurora from '@/components/animations/Aurora'
import { useGetSessionQuery, useStartAeoAnalysisMutation, useLazyGetAeoResultsQuery } from '@/store/api/projectApi'
import { formatDurationHHMMSSMS } from '@/utils/formatDuration'

interface LogEntry {
  message: string
  timestamp: string
}

export default function SessionProgressPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const sessionId = params.sessionId as string
  
  // Fetch session data using RTK Query
  const { data: sessionData, isLoading: isLoadingSession } = useGetSessionQuery(parseInt(sessionId))
  const session = sessionData?.session
  const isLoading = isLoadingSession
  
  // API mutations and queries
  const [startAeoAnalysis] = useStartAeoAnalysisMutation()
  const [triggerGetAeoResults] = useLazyGetAeoResultsQuery()
  
  const [crawlStatus, setCrawlStatus] = useState<'idle' | 'running' | 'auditing' | 'completed' | 'cancelled' | 'failed'>('idle')
  const [pageCount, setPageCount] = useState(0)
  const [discoveredPages, setDiscoveredPages] = useState<string[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [crawlStartTime, setCrawlStartTime] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [estimatedTotal, setEstimatedTotal] = useState<number | null>(null)
  const [progressPercentage, setProgressPercentage] = useState(0)
  
  // AEO analysis tracking
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeAttempts, setAnalyzeAttempts] = useState(0)
  const [aeoResultsReceived, setAeoResultsReceived] = useState(false)

  // Function to poll for AEO results
  const pollForAeoResults = async () => {
    let attempts = 0
    const maxAttempts = 120 // 2 minutes with 1 second intervals
    
    const poll = async () => {
      attempts++
      
      try {
        const result = await triggerGetAeoResults(parseInt(sessionId)).unwrap()
        
        if (result?.success && result?.results) {
          setAeoResultsReceived(true)
          setLogs(prev => [...prev.slice(-99), {
            message: `✅ AEO analysis results received!`,
            timestamp: new Date().toLocaleTimeString()
          }])
          
          setCrawlStatus('completed')
          setProgressPercentage(100)
          setIsAnalyzing(false)
          setCrawlStartTime(null)
          
          return true // Success, stop polling
        } else if (attempts < maxAttempts) {
          setAnalyzeAttempts(attempts)
          // Log every 10 seconds
          if (attempts === 1) {
            setLogs(prev => [...prev.slice(-99), {
              message: `⏳ Waiting for AEO analysis results... (attempt ${attempts}/${maxAttempts})`,
              timestamp: new Date().toLocaleTimeString()
            }])
          } else if (attempts % 10 === 0) {
            setLogs(prev => [...prev.slice(-99), {
              message: `⏳ Still processing AEO analysis... (${attempts}/${maxAttempts})`,
              timestamp: new Date().toLocaleTimeString()
            }])
          }
          return false // Continue polling
        } else {
          throw new Error('Timeout waiting for AEO results')
        }
      } catch (error: any) {
        if (attempts === maxAttempts) {
          setLogs(prev => [...prev.slice(-99), {
            message: `❌ AEO analysis timeout after ${attempts} attempts. Proceeding without results.`,
            timestamp: new Date().toLocaleTimeString()
          }])
          setCrawlStatus('completed')
          setProgressPercentage(100)
          setIsAnalyzing(false)
          setCrawlStartTime(null)
          return true
        }
        
        return false // Continue polling
      }
    }
    
    // Poll every second
    const pollInterval = setInterval(async () => {
      const shouldStop = await poll()
      if (shouldStop) {
        clearInterval(pollInterval)
      }
    }, 1000)
  }
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
      
      // Capture the exact timer duration at crawl completion
      // Use session.startedAt directly to avoid race condition with state updates
      let exactDuration = 0
      const now = Date.now() // Get current time when done event fires
      
      console.log('Done event fired:', {
        sessionAvailable: !!session,
        sessionStartedAt: session?.startedAt,
        currentTime: now,
        message: data.message
      })
      
      if (session?.startedAt) {
        const startTime = new Date(session.startedAt).getTime()
        exactDuration = now - startTime
        console.log('Duration calculated:', {
          startTime,
          currentTime: now,
          exactDuration,
          startedAtRaw: session.startedAt
        })
      } else {
        console.log('Session or startedAt missing', { 
          session: session ? JSON.stringify(session) : 'null',
          startedAt: session?.startedAt 
        })
      }
      
      // Send the exact duration to backend to store in database
      if (session?.startedAt && exactDuration > 0) {
        console.log('Sending duration to backend:', { sessionId, exactDuration })
        fetch(`/api/crawl/session/${sessionId}/duration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration: exactDuration })
        })
          .then(res => res.json())
          .then(data => console.log('Duration response:', data))
          .catch((err) => console.error('Failed to send duration:', err))
      } else {
        console.log('Not sending duration - conditions not met:', {
          hasSession: !!session?.startedAt,
          durationGreaterThanZero: exactDuration > 0,
          exactDuration
        })
      }
      
      // If crawl is completed, start AEO analysis instead of marking as complete
      if (nextStatus === 'completed' && !isAnalyzing && session?.startUrl) {
        setIsAnalyzing(true)
        setCrawlStatus('auditing')
        setLogs(prev => [...prev, {
          message: `✅ Crawl completed! Total URLs: ${data.count}. Starting AEO analysis...`,
          timestamp: new Date().toLocaleTimeString()
        }])
        
        // Call the analyze API
        startAeoAnalysis({ sessionId: parseInt(sessionId), url: session.startUrl })
          .then((result: any) => {
            if (result.data?.success) {
              setLogs(prev => [...prev.slice(-99), {
                message: `📊 AEO analysis initiated for ${data.count} pages. Processing...`,
                timestamp: new Date().toLocaleTimeString()
              }])
              
              // Start polling for results
              pollForAeoResults()
            } else {
              setLogs(prev => [...prev.slice(-99), {
                message: `❌ Failed to start AEO analysis: ${result.data?.message || 'Unknown error'}`,
                timestamp: new Date().toLocaleTimeString()
              }])
              setCrawlStatus('completed')
              setProgressPercentage(100)
              setIsAnalyzing(false)
            }
          })
          .catch((error: any) => {
            setLogs(prev => [...prev.slice(-99), {
              message: `❌ Error starting AEO analysis: ${error?.message || 'Unknown error'}`,
              timestamp: new Date().toLocaleTimeString()
            }])
            setCrawlStatus('completed')
            setProgressPercentage(100)
            setIsAnalyzing(false)
          })
      } else if (nextStatus !== 'completed') {
        setCrawlStatus(nextStatus)
        if (nextStatus === 'cancelled' || nextStatus === 'failed') {
          setCrawlStartTime(null)
          setProgressPercentage(100)
          setIsAnalyzing(false)
        }
        
        setLogs(prev => [...prev, {
          message: nextStatus === 'cancelled' 
            ? `⚠️ Crawl cancelled`
            : `❌ Crawl failed`,
          timestamp: new Date().toLocaleTimeString()
        }])
      }
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
          } else if (data.status === 'failed' || data.status === 'cancelled') {
            setCrawlStatus(data.status)
            setCrawlStartTime(null)
            setIsAnalyzing(false)
          }
          // Note: 'completed' status is handled in the 'done' event listener
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
  }, [sessionId, router, projectId, estimatedTotal, pageCount, startAeoAnalysis, triggerGetAeoResults, session])

  // Initialize state from session data
  useEffect(() => {
    if (session) {
      console.log('Session data loaded:', {
        id: session.id,
        startedAt: session.startedAt,
        status: session.status,
        totalPages: session.totalPages
      })
      
      // Set initial state
      if (session.status === 'running' || session.status === 'auditing') {
        setCrawlStatus(session.status)
        setCrawlStartTime(new Date(session.startedAt).getTime())
      } else if (session.status === 'completed') {
        setCrawlStatus('completed')
        setProgressPercentage(100)
      } else {
        setCrawlStatus((session.status || 'idle') as 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled' | 'failed')
      }
      
      setPageCount(session.totalPages || 0)
      
      // Estimate total pages (rough estimate based on average website)
      setEstimatedTotal(100)
    }
  }, [session])

  // Calculate elapsed time
  const calculateElapsedTime = (): string => {
    if (crawlStartTime && (crawlStatus === 'running' || crawlStatus === 'auditing' || isAnalyzing)) {
      const elapsedMs = currentTime - crawlStartTime
      return formatDurationHHMMSSMS(elapsedMs)
    }
    return '00:00:00:00'
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

  // Auto-redirect when crawl is completed
  useEffect(() => {
    if (crawlStatus === 'completed') {
      // Wait 2 seconds before redirecting to let user see completion
      const redirectTimer = setTimeout(() => {
        router.push(`/dashboard/projects/${projectId}/sessions/${sessionId}`)
      }, 2000)
      
      return () => clearTimeout(redirectTimer)
    }
  }, [crawlStatus, router, projectId, sessionId])

  // Combine logs and discovered pages in chronological order
  const combinedItems = useMemo(() => [
    ...logs.map((log, idx) => ({ type: 'log' as const, data: log as LogEntry, idx })),
    ...discoveredPages.map((page, idx) => ({ type: 'page' as const, data: page as string, idx }))
  ], [logs, discoveredPages])

  // centerIdx points to the focused (middle) item index in combinedItems
  const [centerIdx, setCenterIdx] = useState(() => Math.max(0, combinedItems.length - 2))

  // Ensure center is adjusted when the combined list changes
  useEffect(() => {
    setCenterIdx(prev => {
      const desired = Math.max(0, combinedItems.length - 2)
      return Math.min(Math.max(prev, desired), Math.max(0, combinedItems.length - 1))
    })
  }, [combinedItems.length])

  // Auto-advance center until it reaches the latest item; resumes when new items arrive
  useEffect(() => {
    if (combinedItems.length <= 1) return
    const interval = setInterval(() => {
      setCenterIdx(prev => {
        const max = combinedItems.length - 1
        if (prev < max) return prev + 1
        return prev
      })
    }, 1800)

    return () => clearInterval(interval)
  }, [combinedItems.length])

  // Derive the three visible items: prev, center, next
  const visibleTriplet = (() => {
    if (combinedItems.length === 0) return []
    const c = Math.min(centerIdx, combinedItems.length - 1)
    const prev = c - 1 >= 0 ? combinedItems[c - 1] : null
    const center = combinedItems[c]
    const next = c + 1 < combinedItems.length ? combinedItems[c + 1] : null
    return [prev, center, next]
  })()

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
      {/* Aurora fog effect */}
      <div className="fixed inset-0 w-full h-full">
        <Aurora colorStops={["#475569", "#64748b", "#475569"]} amplitude={1.2} blend={0.6} speed={0.8} />
      </div>

      {/* Dotted Background Pattern */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      ></div>
      
      <div className="w-full flex flex-col items-center gap-0 animate-fade-in-hero relative z-20">
        {/* Concentric Rings Loading Animation */}
        <div className="flex items-center justify-center pt-4 pb-0 relative">
          <div className="relative w-96 h-96 flex items-center justify-center">
            {/* Center Counter */}
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-white text-5xl font-bold font-mono w-20 text-center" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {pageCount}
              </div>
            </div>
            
            {/* Ring 1 - Inner with dot */}
            <div className="absolute inset-0 flex items-center justify-center animate-spin-slow">
              <div className="relative w-40 h-40 rounded-full border border-white/70">
                <div className="absolute w-2.5 h-2.5 rounded-full bg-purple-400 -top-1.5 left-1/2 transform -translate-x-1/2"></div>
              </div>
            </div>
            
            {/* Ring 2 - Middle with dot */}
            <div className="absolute inset-0 flex items-center justify-center animate-spin-medium">
              <div className="relative w-64 h-64 rounded-full border border-white/45">
                <div className="absolute w-2.5 h-2.5 rounded-full bg-blue-400 -top-1.5 left-1/2 transform -translate-x-1/2"></div>
              </div>
            </div>
            
            {/* Ring 3 - Expanding and fading out from Ring 2 */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{
                scale: [0.667, 1],
                opacity: [0.8, 0]
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                repeatDelay: 1,
                ease: 'easeOut'
              }}
            >
              <div className="relative w-96 h-96 rounded-full border border-white/35">
              </div>
            </motion.div>

            {/* Ring 3 - Static spinning ring (visual background) */}
            <div className="absolute inset-0 flex items-center justify-center animate-spin-fast">
              <div className="relative w-96 h-96 rounded-full border border-white/15">
                <div className="absolute w-2.5 h-2.5 rounded-full bg-green-400 -top-1.5 left-1/2 transform -translate-x-1/2"></div>
              </div>
            </div>

            {/* Ring 4 - Loader ring expanding and fading out */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{
                scale: [1, 1.5],
                opacity: [0.5, 0]
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                repeatDelay: 1,
                ease: 'easeOut'
              }}
            >
              <div className="relative w-96 h-96 rounded-full border border-white/40">
              </div>
            </motion.div>
          </div>
        </div>

        {/* Timer Section */}
        <div className="flex items-center justify-center whitespace-nowrap py-6">
          <span className="text-white/85 text-6xl font-mono font-bold tracking-widest font-tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>{calculateElapsedTime()}</span>
        </div>

        {/* Logs Section - Smooth Carousel */}
        <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-white/5 overflow-hidden p-4 mb-8">
          {/* Content */}
          <div className="flex flex-col">
            <div className="space-y-0 h-56 flex flex-col justify-center">
              {combinedItems.length > 0 ? (
                <AnimatePresence mode="wait">
                  <div className="flex flex-col gap-2">
                    {visibleTriplet.map((item, pos) => {
                      if (!item) return null

                      const isCenter = pos === 1
                      const key = `${item.type}-${(item as any).idx}-${centerIdx}`

                      const containerVariants = {
                        enter: {
                          y: 80,
                          opacity: 0
                        },
                        center: {
                          zIndex: isCenter ? 10 : pos === 0 ? 5 : 3,
                          y: 0,
                          opacity: isCenter ? 1 : 0.45,
                          transition: {
                            duration: 0.65,
                            ease: easeOut
                          }
                        },
                        exit: {
                          y: -80,
                          opacity: 0,
                          transition: {
                            duration: 0.65,
                            ease: easeIn
                          }
                        }
                      }

                      return (
                        <motion.div
                          key={key}
                          variants={containerVariants}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          className={`flex items-center justify-center gap-3 p-3 rounded-md transition-all ${
                            isCenter ? 'bg-white/5 shadow-lg shadow-white/10' : 'bg-transparent'
                          }`}
                          style={{ pointerEvents: 'none', minHeight: '56px' }}
                        >
                          {item.type === 'log' ? (
                            <>
                              <span className={`${
                                isCenter ? 'text-white/70' : 'text-white/30'
                              } font-mono shrink-0 text-xs whitespace-nowrap`}>
                                {(item.data as LogEntry).timestamp}
                              </span>
                              <span className={`${
                                isCenter
                                  ? 'text-white font-bold text-base'
                                  : 'text-white/60 text-sm'
                              } break-all`}>
                                {(item.data as LogEntry).message}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={`${
                                isCenter ? 'text-green-400' : 'text-green-500/50'
                              } shrink-0 text-base`}>
                                ✅
                              </span>
                              <span className={`${
                                isCenter
                                  ? 'text-white font-bold text-base'
                                  : 'text-white/60 text-sm'
                              } break-all`}>
                                {item.data as string}
                              </span>
                            </>
                          )}
                        </motion.div>
                      )
                    })}
                  </div>
                </AnimatePresence>
              ) : (
                <div className="flex flex-col gap-2">
                  {[
                    { time: '10:24:33', msg: '✅ Session started' },
                    { time: '10:24:35', msg: '🔍 Crawling pages...' },
                    { time: '10:24:40', msg: '📄 Found 42 pages' }
                  ].map((log, idx) => (
                    <motion.div
                      key={`placeholder-${idx}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 0.7, y: 0 }}
                      transition={{ duration: 0.5, delay: idx * 0.1 }}
                      className="flex items-center justify-center gap-3 p-3 rounded-md bg-white/2 text-sm"
                      style={{ minHeight: '56px' }}
                    >
                      <span className="text-white/40 font-mono shrink-0 text-xs">{log.time}</span>
                      <span className="text-white/60 text-xs break-all">{log.msg}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>


    </div>
  )
}
