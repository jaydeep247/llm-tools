'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useMemo, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { motion, AnimatePresence, easeOut, easeIn } from 'framer-motion'
import Aurora from '@/components/animations/Aurora'
import { useGetJobSnapshotQuery, useGetJobStatusQuery } from '@/store/api/jobApi'
import { formatDurationHHMMSSMS } from '@/utils/formatDuration'
import { io, Socket } from 'socket.io-client'

interface LogEntry {
  message: string
  timestamp: number
}

interface PageEntry {
  url: string
  timestamp: number
}

type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * Job Progress Page - Clean Architecture
 * 
 * Design Principles:
 * 1. jobId comes from URL - single stable identity
 * 2. Snapshot hydrates state EXACTLY ONCE per job
 * 3. Socket emits ONLY future deltas (timestamp > snapshotAt)
 * 4. ONE ref (hydratedJobIdRef) for race condition prevention
 * 5. Derived values computed, never stored
 * 
 * Race Condition Prevention:
 * - hydratedJobIdRef tracks which job has been hydrated SYNCHRONOUSLY
 * - State updates are batched/async, but ref updates are immediate
 * - This prevents stale data when rapidly switching between job progress pages
 */
export default function JobProgressPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.jobId as string

  // ============ CORE STATE ============
  // These are the ONLY sources of truth
  const [status, setStatus] = useState<JobStatus>('pending')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [snapshotAt, setSnapshotAt] = useState<number | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [pages, setPages] = useState<PageEntry[]>([])
  const [currentTime, setCurrentTime] = useState(Date.now())
  
  // For redirect after completion
  const [jobMeta, setJobMeta] = useState<{ projectId?: string; sessionId?: string }>({})

  // ============ REF: HYDRATION TRACKING ============
  // CRITICAL: This ref synchronously tracks which jobId we've hydrated
  // Unlike state, refs update immediately, preventing race conditions
  // when navigating between progress pages
  const hydratedJobIdRef = useRef<string | null>(null)

  // ============ EFFECT 0: RESET STATE ON JOB CHANGE ============
  // CRITICAL: When jobId changes (navigation between progress pages),
  // React preserves component state. We MUST reset to prevent cross-job contamination.
  useEffect(() => {
    // SYNCHRONOUSLY clear hydration ref FIRST - this is the critical gate
    hydratedJobIdRef.current = null
    
    // Reset ALL state to initial values
    setStatus('pending')
    setStartedAt(null)
    setSnapshotAt(null)  // This gates the hydration effect
    setLogs([])
    setPages([])
    setJobMeta({})
    setCurrentTime(Date.now())
    console.log(`🔄 State reset for new job: ${jobId}`)
  }, [jobId])

  // ============ QUERIES ============
  // Snapshot for initial hydration
  // CRITICAL: We need BOTH isSuccess AND !isFetching to ensure data is fresh
  // - isSuccess=true, isFetching=true  → stale cache returned, fresh fetch in progress
  // - isSuccess=true, isFetching=false → fresh data confirmed
  const { data: snapshot, isSuccess: isSnapshotSuccess, isLoading: isSnapshotLoading, isFetching: isSnapshotFetching } = useGetJobSnapshotQuery(jobId, {
    skip: !jobId,
    refetchOnMountOrArgChange: true,  // Force fresh fetch on mount/jobId change
  })
  
  // Job status for metadata (projectId, sessionId)
  const { data: jobStatus } = useGetJobStatusQuery(jobId, {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  // ============ EFFECT 1: SNAPSHOT HYDRATION (ONE-TIME PER JOB) ============
  useEffect(() => {
    // Guard 1: Wait for successful fetch
    if (!isSnapshotSuccess || !snapshot) return
    
    // Guard 2: CRITICAL - Wait for fresh data, not stale cache
    // When isFetching=true, RTK Query is returning cached data while fetching fresh
    // We MUST wait for isFetching=false to ensure we have confirmed fresh data
    if (isSnapshotFetching) {
      console.log('⏳ Waiting for fresh snapshot data (cached data ignored)')
      return
    }
    
    // Guard 3: CRITICAL - Check ref SYNCHRONOUSLY to prevent race conditions
    // State updates are batched and async, but ref updates are immediate
    // This prevents hydrating with stale data when rapidly switching jobs
    if (hydratedJobIdRef.current === jobId) {
      console.log(`⏭️ Already hydrated for job: ${jobId}`)
      return
    }
    
    // Guard 4: Validate snapshot belongs to current job
    if (snapshot.jobId && snapshot.jobId !== jobId) {
      console.warn(`⚠️ Ignoring snapshot for wrong job: ${snapshot.jobId} vs ${jobId}`)
      return
    }

    console.log('📸 Hydrating from FRESH snapshot:', snapshot)
    
    // CRITICAL: Mark this job as hydrated IMMEDIATELY (synchronous)
    hydratedJobIdRef.current = jobId

    // Set boundary FIRST - this gates all future socket events
    setSnapshotAt(snapshot.snapshotAt)
    
    // Hydrate status
    const snapshotStatus = (snapshot.status || 'pending') as JobStatus
    setStatus(snapshotStatus)
    
    // CRITICAL: Only set startedAt if:
    // 1. Job is ACTIVELY RUNNING
    // 2. startedAt exists
    // 3. startedAt is reasonable (within last 24 hours)
    if (snapshotStatus === 'running' && snapshot.startedAt) {
      const age = Date.now() - snapshot.startedAt
      const isReasonable = age >= 0 && age < 24 * 60 * 60 * 1000
      if (isReasonable) {
        setStartedAt(Number(snapshot.startedAt))
      } else {
        console.warn(`⚠️ Rejecting stale startedAt: ${snapshot.startedAt} (age: ${age}ms)`)
        setStartedAt(null)
      }
    } else {
      setStartedAt(null)
    }
    
    // Transform logs - snapshot returns { message, timestamp }
    const hydratedLogs: LogEntry[] = (snapshot.logs || []).map(l => ({
      message: typeof l === 'string' ? l : (l.message || JSON.stringify(l)),
      timestamp: typeof l.timestamp === 'number' ? l.timestamp : Date.now()
    }))
    setLogs(hydratedLogs)
    
    // Transform pages - snapshot returns links as { url, timestamp }
    const hydratedPages: PageEntry[] = (snapshot.links || [])
      .map(l => ({
        url: typeof l === 'string' ? l : l.url,
        timestamp: typeof l === 'object' && l.timestamp ? Number(l.timestamp) : Date.now()
      }))
      .filter(p => p.url) // Filter out entries without URL
    setPages(hydratedPages)

    console.log(`✅ Snapshot hydrated: ${hydratedLogs.length} logs, ${hydratedPages.length} pages, boundary=${snapshot.snapshotAt}`)
  }, [isSnapshotSuccess, isSnapshotFetching, snapshot, jobId])
  // NOTE: Removed snapshotAt from deps - we use hydratedJobIdRef for gating now

  // ============ EFFECT 2: JOB METADATA ============
  useEffect(() => {
    if (jobStatus) {
      setJobMeta({
        projectId: (jobStatus as any).projectId,
        sessionId: (jobStatus as any).sessionId
      })
    }
  }, [jobStatus])

  // ============ EFFECT 3: SOCKET SUBSCRIPTION (FUTURE DELTAS ONLY) ============
  useEffect(() => {
    // Don't connect until snapshot is loaded (snapshotAt is set)
    if (!jobId || snapshotAt === null) return
    
    // Don't connect for terminal states
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      console.log(`📵 Socket not needed - job already ${status}`)
      return
    }

    console.log(`🔌 Connecting socket for job: ${jobId}, boundary: ${snapshotAt}`)

    const socket: Socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socket.on('connect', () => {
      console.log(`✅ Socket connected, joining job: ${jobId}`)
      socket.emit('join-job', jobId)
    })

    const handleEvent = (event: any) => {
      // CRITICAL: Validate event belongs to this job
      if (event.jobId !== jobId) {
        console.warn(`⚠️ Ignoring event for wrong job: ${event.jobId}`)
        return
      }
      
      // CRITICAL: Reject events already covered by snapshot
      const eventTimestamp = Number(event.timestamp)
      if (!eventTimestamp || eventTimestamp <= snapshotAt) {
        return // Silently ignore - this is expected on reconnect
      }

      const eventType = event.eventType

      // Handle log events
      if (eventType === 'log') {
        const message = event.payload?.message || 
                       (typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload))
        setLogs(prev => [...prev, { message, timestamp: eventTimestamp }])
      }
      // Handle page_crawled events
      else if (eventType === 'page_crawled') {
        const url = event.payload?.url
        if (url) {
          setPages(prev => {
            // Dedupe by URL
            if (prev.some(p => p.url === url)) return prev
            return [...prev, { url, timestamp: eventTimestamp }]
          })
          
          // Also add to logs
          const message = event.payload?.message || `Crawled: ${url}`
          setLogs(prev => [...prev, { message, timestamp: eventTimestamp }])
        }
      }
      // Handle status transitions
      else if (eventType === 'JOB_STARTED' || eventType === 'status') {
        const newStatus = event.payload?.status || eventType
        if (newStatus === 'running' || eventType === 'JOB_STARTED') {
          setStatus('running')
          // Set startedAt if not already set
          setStartedAt(prev => {
            if (prev) return prev
            const ts = event.payload?.startedAt || event.timestamp
            return typeof ts === 'number' ? ts : new Date(ts).getTime()
          })
          
          // Add start message
          const startMessage = event.payload?.message || `🚀 Starting crawl...`
          setLogs(prev => [...prev, { message: startMessage, timestamp: eventTimestamp }])
        }
      }
      else if (eventType === 'JOB_COMPLETED' || event.payload?.status === 'completed') {
        setStatus('completed')
        setLogs(prev => [...prev, { message: '✅ Crawl completed!', timestamp: eventTimestamp }])
        socket.disconnect()
      }
      else if (eventType === 'JOB_FAILED' || event.payload?.status === 'failed') {
        setStatus('failed')
        setLogs(prev => [...prev, { message: '❌ Crawl failed', timestamp: eventTimestamp }])
        socket.disconnect()
      }
      else if (eventType === 'JOB_CANCELLED' || event.payload?.status === 'cancelled') {
        setStatus('cancelled')
        setLogs(prev => [...prev, { message: '🚫 Crawl cancelled', timestamp: eventTimestamp }])
        socket.disconnect()
      }
    }

    socket.on('job:event', handleEvent)
    socket.on('job:batch', (batch: any[]) => {
      if (Array.isArray(batch)) {
        batch.forEach(handleEvent)
      }
    })

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected for job: ${jobId}`)
    })

    return () => {
      console.log(`🧹 Cleaning up socket for job: ${jobId}`)
      socket.emit('leave-job', jobId)
      socket.disconnect()
    }
  }, [jobId, snapshotAt, status])

  // ============ EFFECT 4: TIMER ============
  useEffect(() => {
    // CRITICAL: Only run timer when job is RUNNING and we have a valid startedAt
    // - Not for 'pending' (job hasn't started, no valid startedAt)
    // - Not for 'completed'/'failed'/'cancelled' (job is done)
    if (!startedAt) return
    if (status !== 'running') return

    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 100)

    return () => clearInterval(timer)
  }, [startedAt, status])

  // ============ EFFECT 5: REDIRECT ON COMPLETION ============
  useEffect(() => {
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      const timer = setTimeout(() => {
        if (jobMeta.projectId && jobMeta.sessionId) {
          router.push(`/dashboard/projects/${jobMeta.projectId}/sessions/${jobMeta.sessionId}`)
        }
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [status, jobMeta.projectId, jobMeta.sessionId, router])

  // ============ DERIVED VALUES (COMPUTED, NOT STORED) ============
  const elapsedTime = useMemo(() => {
    // Guard 1: Still loading snapshot
    if (snapshotAt === null) return '--:--:--.--'
    
    // Guard 2: Job not running or no start time
    if (status !== 'running' || !startedAt) return '00:00:00.00'
    
    const elapsed = currentTime - startedAt
    
    // Guard 3: Invalid elapsed time (stale data protection)
    if (elapsed < 0 || elapsed > 24 * 60 * 60 * 1000) return '00:00:00.00'
    
    return formatDurationHHMMSSMS(elapsed)
  }, [startedAt, currentTime, snapshotAt, status])

  const pageCount = pages.length

  // ============ UI HELPERS ============
  // Combine logs and pages for carousel display
  const combinedItems = useMemo(() => [
    ...logs.map((log, idx) => ({ type: 'log' as const, data: log, idx })),
  ], [logs])

  const [centerIdx, setCenterIdx] = useState(0)

  // Auto-advance carousel
  useEffect(() => {
    if (combinedItems.length <= 1) return
    setCenterIdx(Math.max(0, combinedItems.length - 1))
  }, [combinedItems.length])

  useEffect(() => {
    if (combinedItems.length <= 1) return
    const interval = setInterval(() => {
      setCenterIdx(prev => {
        const max = combinedItems.length - 1
        return prev < max ? prev + 1 : prev
      })
    }, 1800)
    return () => clearInterval(interval)
  }, [combinedItems.length])

  // Derive visible items for carousel
  const visibleTriplet = useMemo(() => {
    if (combinedItems.length === 0) return []
    const c = Math.min(centerIdx, combinedItems.length - 1)
    const prev = c - 1 >= 0 ? combinedItems[c - 1] : null
    const center = combinedItems[c]
    const next = c + 1 < combinedItems.length ? combinedItems[c + 1] : null
    return [prev, center, next]
  }, [combinedItems, centerIdx])

  // ============ LOADING STATE ============
  if (isSnapshotLoading || snapshotAt === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 text-white animate-spin" />
          <p className="text-white/60 text-lg">Loading job progress...</p>
        </div>
      </div>
    )
  }

  // ============ RENDER ============
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
            {elapsedTime}
          </span>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${status === 'running' ? 'bg-green-400 animate-pulse' : status === 'completed' ? 'bg-blue-400' : status === 'failed' ? 'bg-red-400' : 'bg-gray-400'}`}></div>
            <span className="text-white/40 text-sm font-mono uppercase tracking-wider">
              {status === 'running' ? 'Live Duration' : status === 'completed' ? 'Total Duration' : status === 'failed' ? 'Failed' : 'Status: ' + status}
            </span>
          </div>
        </div>

        {/* Logs Section - Smooth Carousel */}
        <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-white/5 overflow-hidden p-4 mb-8">
          <div className="flex flex-col">
            <div className="space-y-0 h-56 flex flex-col justify-center">
              {combinedItems.length > 0 ? (
                <AnimatePresence mode="wait">
                  <div className="flex flex-col gap-2">
                    {visibleTriplet.map((item, pos) => {
                      if (!item) return null

                      const isCenter = pos === 1
                      const key = `${item.type}-${item.idx}-${centerIdx}`

                      const containerVariants = {
                        enter: { y: 80, opacity: 0 },
                        center: {
                          zIndex: isCenter ? 10 : pos === 0 ? 5 : 3,
                          y: 0,
                          opacity: isCenter ? 1 : 0.45,
                          transition: { duration: 0.65, ease: easeOut }
                        },
                        exit: { y: -80, opacity: 0, transition: { duration: 0.65, ease: easeIn } }
                      }

                      return (
                        <motion.div
                          key={key}
                          variants={containerVariants}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          className={`flex items-center justify-center gap-3 p-3 rounded-md transition-all ${isCenter ? 'bg-white/5 shadow-lg shadow-white/10' : 'bg-transparent'}`}
                          style={{ pointerEvents: 'none', minHeight: '56px' }}
                        >
                          <span className={`${isCenter ? 'text-white/70' : 'text-white/30'} font-mono shrink-0 text-xs whitespace-nowrap`}>
                            {new Date(item.data.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={`${isCenter ? 'text-white font-bold text-base' : 'text-white/60 text-sm'} break-all`}>
                            {item.data.message}
                          </span>
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
