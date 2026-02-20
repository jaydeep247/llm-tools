'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useMemo, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { motion, AnimatePresence, easeOut, easeIn } from 'framer-motion'
import Aurora from '@/components/animations/Aurora'
import { useGetSessionQuery } from '@/store/api/sessionApi'
import { useGetSessionJobsQuery, useGetJobSnapshotQuery } from '@/store/api/jobApi'
import { formatDurationHHMMSSMS } from '@/utils/formatDuration'
import { io } from 'socket.io-client'

interface LogEntry {
  message: string
  timestamp: string | number
}

export default function SessionProgressPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string
  
  // Fetch session data using RTK Query
  const { data: sessionData, isLoading: isLoadingSession } = useGetSessionQuery(sessionId)
  const session = sessionData?.session
  const isLoading = isLoadingSession

  const { data: jobsData } = useGetSessionJobsQuery(sessionId, { pollingInterval: 0 })
  const jobs = jobsData?.data || []
  const activeJob = jobs.find(j => j.status === 'running' || j.status === 'pending') || jobs[jobs.length - 1]

  // Snapshot Query
  const { data: snapshotData, isSuccess: isSnapshotSuccess } = useGetJobSnapshotQuery(activeJob?.id || '', {
    skip: !activeJob?.id
  })

  const [crawlStatus, setCrawlStatus] = useState<'idle' | 'running' | 'auditing' | 'completed' | 'cancelled' | 'failed'>('idle')
  const [discoveredPages, setDiscoveredPages] = useState<string[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [crawlStartTime, setCrawlStartTime] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [snapshotLoaded, setSnapshotLoaded] = useState(false)
  const snapshotBoundaryRef = useRef<number | null>(null)

  const pageCount = discoveredPages.length
  
  // Reset snapshot state when job changes
  useEffect(() => {
    setSnapshotLoaded(false)
  }, [activeJob?.id])
  
  // ✅ STEP 3 — TIMER MUST WAIT FOR TIME ANCHOR
  useEffect(() => {
    if (!crawlStartTime) return

    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 100)

    return () => clearInterval(timer)
  }, [crawlStartTime])

  // Sync state from Snapshot - Single Source of Truth
  useEffect(() => {
    if (isSnapshotSuccess && snapshotData && !snapshotLoaded) {
      console.log('📸 Snapshot loaded:', snapshotData)

      // Snapshot hard boundary: lock once and never reset during this page lifecycle
      if (snapshotBoundaryRef.current === null) {
        snapshotBoundaryRef.current = Number(snapshotData.snapshotAt) || Date.now()
      }
      
      // 1. Restore Status
      if (snapshotData.status) {
        setCrawlStatus(snapshotData.status as any)
      }
      
      // 2. Restore Logs
      if (snapshotData.logs && snapshotData.logs.length > 0) {
        setLogs(snapshotData.logs.map(l => ({
            message: l.message || (typeof l === 'string' ? l : JSON.stringify(l)),
            timestamp: l.timestamp || Date.now()
        })))
      }
      
      // 3. Restore Links
      if (snapshotData.links && snapshotData.links.length > 0) {
        // Handle both object format and potential string format from Redis
        const links = snapshotData.links.map(l => typeof l === 'string' ? l : l.url).filter(Boolean)
        setDiscoveredPages(links)
      }
      
      // ✅ STEP 2 — SET crawlStartTime IN ONE PLACE ONLY
      if (!crawlStartTime && (snapshotData as any).startedAt) {
          setCrawlStartTime(new Date((snapshotData as any).startedAt).getTime())
      }

      setSnapshotLoaded(true)
    }
  }, [snapshotData, isSnapshotSuccess, snapshotLoaded, crawlStartTime])

  // WebSocket Connection - Only after snapshot is loaded AND job is not completed
  useEffect(() => {
    const activeJobId = activeJob?.id
    
    // Don't connect if:
    // 1. No active job
    // 2. Snapshot hasn't loaded (prevent race condition)
    // 3. Job is already completed/failed (no need for live updates)
    if (!activeJobId || !snapshotLoaded) return
    if (crawlStatus === 'completed' || crawlStatus === 'failed' || crawlStatus === 'cancelled') return

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socket.on('connect', () => {
      console.log(`🔌 Connected to job stream: ${activeJobId}`)
      socket.emit('join-job', activeJobId)
    })

    const handleEvent = (event: any) => {
      const boundary = snapshotBoundaryRef.current
      const eventTimestamp = Number(event?.timestamp)

      // Strict socket filter: no timestamp OR <= snapshot boundary => ignore
      if (boundary === null || !Number.isFinite(eventTimestamp) || eventTimestamp <= boundary) {
        return
      }

      if (event.eventType === 'log') {
        const message = event.payload?.message || (typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload))
        setLogs(prev => {
            // Deduplication: don't add if identical message exists in last 10 logs
            // This handles socket reconnects sending buffered events we might have just seen
            const lastLogs = prev.slice(-10)
            if (lastLogs.some(l => l.message === message)) return prev
            
            return [...prev, {
              message,
              timestamp: eventTimestamp
            }]
        })
      }
      else if (event.eventType === 'link_found' || event.eventType === 'link' || event.eventType === 'LINK_FOUND') {
        const url = event.payload?.url || (typeof event.payload === 'string' ? event.payload : null)
        if (url) {
            setDiscoveredPages(prev => {
                if (prev.includes(url)) return prev
                return [...prev, url]
            })
        }
      }
      else if (['JOB_STARTED', 'JOB_COMPLETED', 'JOB_FAILED', 'status'].includes(event.eventType)) {
         const status = event.payload?.status || event.eventType
         
         if (status === 'completed' || status === 'JOB_COMPLETED') {
             // ✅ STEP 5 — COMPLETION FREEZES STATE
             setCrawlStatus('completed')
             // DO NOT touch crawlStartTime
             setLogs(prev => [...prev, {
                 message: `✅ Crawl completed!`,
               timestamp: eventTimestamp
             }])
             // Socket will be cleaned up by effect dependency change or unmount
         } else if (status === 'failed' || status === 'JOB_FAILED') {
             setCrawlStatus('failed')
             setLogs(prev => [...prev, {
                 message: `❌ Crawl failed`,
               timestamp: eventTimestamp
             }])
         } else if (status === 'running' || status === 'JOB_STARTED') {
             setCrawlStatus('running')
         }
      }
    }

    socket.on('job:event', handleEvent)
    
    socket.on('job:batch', (batch: any[]) => {
        if (Array.isArray(batch)) {
            batch.forEach(handleEvent)
        }
    })

    return () => {
      console.log('🔌 Disconnecting socket')
      socket.disconnect()
    }
  }, [activeJob?.id, snapshotLoaded, crawlStatus])

  // ✅ STEP 4 — SESSION EFFECT BECOMES READ-ONLY
  useEffect(() => {
    if (!session) return

    if (!snapshotLoaded && session.status) {
      // Only metadata allowed - do NOT touch logs, links, or time
      if (session.status === 'running' || session.status === 'auditing') {
        setCrawlStatus(session.status)
      } else if (session.status === 'completed') {
        setCrawlStatus('completed')
      } else {
        setCrawlStatus((session.status || 'idle') as any)
      }
    }
  }, [session, snapshotLoaded])

  // Calculate elapsed time
  const calculateElapsedTime = (): string => {
    // If we have a start time, use it. Otherwise return 0
    if (!crawlStartTime) return '00:00:00.00'
    
    // If completed, show final duration if available
    if (crawlStatus === 'completed' && session?.completedAt) {
       const start = new Date(session.startedAt as string).getTime()
       const end = new Date(session.completedAt as string).getTime()
       return formatDurationHHMMSSMS(end - start)
    }

    const elapsedMs = currentTime - crawlStartTime
    return formatDurationHHMMSSMS(Math.max(0, elapsedMs))
  }

  // Auto-redirect when crawl is completed
  useEffect(() => {
    // Redirect if session status is completed or if local crawl status is completed
    if (session?.status === 'completed' || crawlStatus === 'completed') {
      // Add a small delay to let the user see the completion state
      const timer = setTimeout(() => {
        router.push(`/dashboard/projects/${params.projectId}/sessions/${params.sessionId}`)
      }, 2000)
      
      return () => clearTimeout(timer)
    }
  }, [session, crawlStatus, params.projectId, params.sessionId, router])

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
        <div className="flex flex-col items-center justify-center py-6">
          <span className="text-white/85 text-6xl font-mono font-bold tracking-widest font-tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {calculateElapsedTime()}
          </span>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${crawlStatus === 'running' ? 'bg-green-400 animate-pulse' : crawlStatus === 'completed' ? 'bg-blue-400' : 'bg-gray-400'}`}></div>
            <span className="text-white/40 text-sm font-mono uppercase tracking-wider">
              {crawlStatus === 'running' ? 'Live Duration' : crawlStatus === 'completed' ? 'Total Duration' : 'Status: ' + crawlStatus}
            </span>
          </div>
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
                <div className="flex flex-col gap-2 items-center justify-center h-full opacity-50">
                   <div className="animate-pulse flex items-center gap-2">
                      <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                      <div className="h-2 w-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="h-2 w-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                    <p className="text-white/40 text-sm font-mono">Initializing crawl...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
