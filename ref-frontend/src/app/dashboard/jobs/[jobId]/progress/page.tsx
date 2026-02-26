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
 * 4. Refs for race condition prevention and stable closures:
 *    - hydratedJobIdRef: tracks hydrated job synchronously
 *    - statusRef: current status for socket handlers
 *    - snapshotAtRef: current snapshot boundary for handlers
 * 5. Derived values computed, never stored
 * 6. Socket effect depends ONLY on jobId + snapshotAt (NOT status)
 *    - forceNew:true prevents socket multiplexing between jobs
 *    - Status changes handled internally, don't cause reconnections
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
  const [finalPagesCrawled, setFinalPagesCrawled] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(Date.now())
  
  // For redirect after completion
  const [jobMeta, setJobMeta] = useState<{ projectId?: string; sessionId?: string }>({})
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null)

  // ============ REF: HYDRATION TRACKING ============
  // CRITICAL: This ref synchronously tracks which jobId we've hydrated
  // Unlike state, refs update immediately, preventing race conditions
  // when navigating between progress pages
  const hydratedJobIdRef = useRef<string | null>(null)
  
  // ============ REFS: CURRENT VALUES FOR SOCKET EFFECT ============
  // These refs allow socket handlers to access current values without
  // causing effect re-runs (which would reconnect the socket)
  const statusRef = useRef<JobStatus>('pending')
  const snapshotAtRef = useRef<number | null>(null)
  const seenUrlsRef = useRef<Set<string>>(new Set())
  
  // Keep refs in sync with state
  useEffect(() => {
    statusRef.current = status
  }, [status])
  
  useEffect(() => {
    snapshotAtRef.current = snapshotAt
  }, [snapshotAt])

  // ============ EFFECT 0: RESET STATE ON JOB CHANGE ============
  // CRITICAL: When jobId changes (navigation between progress pages),
  // React preserves component state. We MUST reset to prevent cross-job contamination.
  useEffect(() => {
    // SYNCHRONOUSLY clear ALL refs FIRST - these are the critical gates
    hydratedJobIdRef.current = null
    statusRef.current = 'pending'
    snapshotAtRef.current = null
    seenUrlsRef.current = new Set()
    
    // Reset ALL state to initial values
    setStatus('pending')
    setStartedAt(null)
    setSnapshotAt(null)  // This gates the socket effect
    setLogs([])
    setPages([])
    setFinalPagesCrawled(null)
    setJobMeta({})
    setCurrentTime(Date.now())
  }, [jobId])

  // ============ QUERIES ============
  // Snapshot for initial hydration
  // CRITICAL: isFetching guards against stale cache - only hydrate when fetch completes
  const { data: snapshot, isSuccess: isSnapshotSuccess, isLoading: isSnapshotLoading, isFetching: isSnapshotFetching } = useGetJobSnapshotQuery(jobId, {
    skip: !jobId,
    refetchOnMountOrArgChange: true,  // Force fresh fetch on mount/jobId change
  })
  
  // Job status for metadata (projectId, sessionId)
  const { data: jobStatus } = useGetJobStatusQuery(jobId, {
    skip: !jobId,
    pollingInterval: status === 'running' ? 2000 : 0, // Poll every 2s while running (fallback for socket)
    refetchOnMountOrArgChange: true,
  })

  // ============ EFFECT 1: SNAPSHOT HYDRATION (ONE-TIME PER JOB) ============
  useEffect(() => {
    if (isSnapshotFetching) {
      return
    }

    if (!snapshot) {
      return
    }

    if (hydratedJobIdRef.current === jobId) {
      return
    }
    
    // CRITICAL: Mark this job as hydrated IMMEDIATELY (synchronous)
    hydratedJobIdRef.current = jobId

    // Set boundary FIRST - this gates all future socket events
    setSnapshotAt(snapshot.snapshotAt)
    
    // Hydrate status
    const snapshotStatus = (snapshot.status || 'pending') as JobStatus
    console.log(`📊 Setting initial status from snapshot: ${snapshotStatus}`)
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
    const uniqueLinks = new Map<string, PageEntry>();
    const newSeenUrls = new Set<string>();
    
    (snapshot.links || []).forEach(l => {
        const url = typeof l === 'string' ? l : l.url;
        const timestamp = typeof l === 'object' && l.timestamp ? Number(l.timestamp) : Date.now();
        if (url && !uniqueLinks.has(url)) {
            uniqueLinks.set(url, { url, timestamp });
            newSeenUrls.add(url);
        }
    });
    const hydratedPages = Array.from(uniqueLinks.values());
    setPages(hydratedPages)
    seenUrlsRef.current = newSeenUrls;

    // Hydrate final page count if available
    // BUT prefer hydratedPages.length if we have pages, to ensure consistency
    if (snapshot.pagesCrawled !== undefined) {
      // If we have pages, use that count as it's deduped
      if (hydratedPages.length > 0) {
        setFinalPagesCrawled(hydratedPages.length)
      } else {
        setFinalPagesCrawled(snapshot.pagesCrawled)
      }
    }

    // Hydrate metadata if available in snapshot
    if (snapshot.projectId || snapshot.sessionId) {
      setJobMeta({
        projectId: snapshot.projectId,
        sessionId: snapshot.sessionId
      })
    }

    console.log(`✅ Snapshot hydrated: ${hydratedLogs.length} logs, ${hydratedPages.length} pages, boundary=${snapshot.snapshotAt}`)
  }, [isSnapshotSuccess, isSnapshotFetching, snapshot, jobId])
  // NOTE: Removed snapshotAt from deps - we use hydratedJobIdRef for gating now

  // ============ EFFECT 2: JOB METADATA & STATUS SYNC ============
  useEffect(() => {
    if (jobStatus) {
      setJobMeta({
        projectId: (jobStatus as any).projectId,
        sessionId: (jobStatus as any).sessionId
      })
      
      // Sync status from polling (fallback if socket event missed)
      // Normalize status to lowercase to match local state type
      const polledStatus = (jobStatus.status || '').toLowerCase() as JobStatus
      
      console.log(`📡 Polled status: ${polledStatus}, current status: ${status}, jobId: ${jobId}`)

      if (polledStatus && polledStatus !== status) {
        // CRITICAL: Guard against status regression via polling
        // If current state is terminal (completed/failed/cancelled),
        // do NOT revert to 'running' just because polling returned stale data
        if ((status === 'completed' || status === 'failed' || status === 'cancelled') && polledStatus === 'running') {
           console.log(`🛡️ Ignoring polled status '${polledStatus}' - job already ${status}`)
           return
        }

        console.log(`🔄 Status updated via polling: ${jobStatus.status} -> ${polledStatus}`)
        setStatus(polledStatus)
        
        // If completed via polling, ensure we stop the loader
        if (polledStatus === 'completed' || polledStatus === 'failed') {
             // We might miss finalPagesCrawled if socket missed, but redirect will handle it
             console.log('✅ Job completed (detected via polling)')
        }
      }
    }
  }, [jobStatus, status])

  // ============ EFFECT 3: SOCKET SUBSCRIPTION (FUTURE DELTAS ONLY) ============
  useEffect(() => {
    // Don't connect until snapshot is loaded (snapshotAt is set)
    if (!jobId || snapshotAt === null) return
    
    // Don't connect for terminal states - check current status from state
    // (not ref, because we want this initial check to use hydrated value)
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      return
    }

    // Capture snapshotAt for this socket session (stable reference)
    const socketSnapshotAt = snapshotAt
    
    const socket: Socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || '', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      forceNew: true,  // CRITICAL: Prevent socket multiplexing across jobs
    })

    socket.on('connect', () => {
      socket.emit('join-job', jobId)
    })

    const handleEvent = (event: any) => {
      // CRITICAL: Validate event belongs to this job
      if (event.jobId !== jobId) {
        console.warn(`⚠️ Ignoring event for wrong job: ${event.jobId}`)
        return
      }
      
      // CRITICAL: Reject events already covered by snapshot
      // Use captured socketSnapshotAt (stable for this socket session)
      const eventTimestamp = Number(event.timestamp)
      if (!eventTimestamp || eventTimestamp <= socketSnapshotAt) {
        return
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
          // Dedupe using ref (synchronous check)
          if (seenUrlsRef.current.has(url)) {
             return
          }
          seenUrlsRef.current.add(url)

          setPages(prev => [...prev, { url, timestamp: eventTimestamp }])
          
          // Increment finalPagesCrawled if we are tracking it (real-time count)
          // Only increment for NEW unique pages
          setFinalPagesCrawled(prev => (prev !== null ? prev + 1 : null))
          
          // Also add to logs
          const message = event.payload?.message || `Crawled: ${url}`
          setLogs(prev => [...prev, { message, timestamp: eventTimestamp }])
        }
      }
      // Handle status transitions
      else if (eventType === 'JOB_STARTED' || eventType === 'status') {
        const newStatus = event.payload?.status || eventType
        
        // CRITICAL: Guard against status regression (e.g. late 'running' event after completion)
        if (statusRef.current === 'completed' || statusRef.current === 'failed' || statusRef.current === 'cancelled') {
           console.log(`🛡️ Ignoring ${eventType} (status=${newStatus}) - job already ${statusRef.current}`)
           return
        }

        if (newStatus === 'running' || eventType === 'JOB_STARTED') {
          setStatus('running')
          // Set startedAt - VALIDATE it's reasonable (within last hour for a fresh start)
          setStartedAt(prev => {
            if (prev) return prev
            
            // Use event.timestamp (when event was created) NOT payload.startedAt
            // payload.startedAt could be stale from a previous job attempt
            const ts = eventTimestamp  // Use the filtered event timestamp, not payload
            
            // Extra validation: startedAt should be recent (within 1 hour)
            const age = Date.now() - ts
            if (age < 0 || age > 60 * 60 * 1000) {
              console.warn(`⚠️ Rejecting stale JOB_STARTED timestamp: ${ts} (age: ${age}ms)`)
              return Date.now()  // Use current time as fallback
            }
            
            return ts
          })
          
          // Add start message
          const startMessage = event.payload?.message || `🚀 Starting crawl...`
          setLogs(prev => [...prev, { message: startMessage, timestamp: eventTimestamp }])
        }
      }
      else if (eventType === 'JOB_COMPLETED' || event.payload?.status === 'completed') {
        setStatus('completed')
        setLogs(prev => [...prev, { message: '✅ Crawl completed!', timestamp: eventTimestamp }])
        
        // Capture final stats from payload
        if (event.payload?.pages_crawled !== undefined) {
          setFinalPagesCrawled(event.payload.pages_crawled)
        }

        // CRITICAL: Hydrate metadata from completion event if missing
        // This ensures redirect works even if initial query failed
        if (event.payload?.projectId && event.payload?.sessionId) {
            console.log('📦 Hydrating metadata from completion event', event.payload)
            setJobMeta(prev => ({
                ...prev,
                projectId: event.payload.projectId,
                sessionId: event.payload.sessionId
            }))
        }
        
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
      // Socket disconnected
    })

    return () => {
      socket.emit('leave-job', jobId)
      socket.disconnect()
    }
  }, [jobId, snapshotAt]) // REMOVED: status dependency - prevents reconnection cycles

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
    console.log(`🏁 Redirect effect triggered: status=${status}, meta=`, jobMeta)
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      console.log(`🏁 Job ${status}. Starting redirect countdown...`)
      setRedirectCountdown(5)
      
      const interval = setInterval(() => {
        setRedirectCountdown(prev => {
           if (prev === null || prev <= 1) return 0
           return prev - 1
        })
      }, 1000)

      const timer = setTimeout(() => {
        if (jobMeta.projectId && jobMeta.sessionId) {
          console.log(`➡️ Redirecting to session: ${jobMeta.sessionId}`)
          router.push(`/dashboard/projects/${jobMeta.projectId}/sessions/${jobMeta.sessionId}`)
        } else {
            console.warn('⚠️ Cannot redirect: missing metadata', jobMeta)
        }
      }, 5000)
      return () => {
        clearTimeout(timer)
        clearInterval(interval)
      }
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

  const pageCount = pages.length > 0 ? pages.length : (finalPagesCrawled || 0)

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
            <div className={`absolute inset-0 flex items-center justify-center ${status === 'running' ? 'animate-spin-slow' : ''}`}>
              <div className={`relative w-40 h-40 rounded-full border ${status === 'completed' ? 'border-green-400' : 'border-white/70'}`}>
                <div className={`absolute w-2.5 h-2.5 rounded-full ${status === 'completed' ? 'bg-green-400' : 'bg-purple-400'} -top-1.5 left-1/2 transform -translate-x-1/2`}></div>
              </div>
            </div>

            {/* Ring 2 - Middle with dot */}
            <div className={`absolute inset-0 flex items-center justify-center ${status === 'running' ? 'animate-spin-medium' : ''}`}>
              <div className={`relative w-64 h-64 rounded-full border ${status === 'completed' ? 'border-green-400/50' : 'border-white/45'}`}>
                <div className={`absolute w-2.5 h-2.5 rounded-full ${status === 'completed' ? 'bg-green-400' : 'bg-blue-400'} -top-1.5 left-1/2 transform -translate-x-1/2`}></div>
              </div>
            </div>

            {/* Ring 3 - Expanding and fading out from Ring 2 */}
            {status === 'running' && (
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
            )}

            {/* Ring 3 - Static spinning ring (visual background) */}
            <div className={`absolute inset-0 flex items-center justify-center ${status === 'running' ? 'animate-spin-fast' : ''}`}>
              <div className="relative w-96 h-96 rounded-full border border-white/15">
                <div className={`absolute w-2.5 h-2.5 rounded-full ${status === 'completed' ? 'bg-green-400' : 'bg-green-400'} -top-1.5 left-1/2 transform -translate-x-1/2`}></div>
              </div>
            </div>

            {/* Ring 4 - Loader ring expanding and fading out */}
            {status === 'running' && (
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
            )}
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
          
          {redirectCountdown !== null && (
            <div className="mt-4 px-4 py-2 bg-white/10 rounded-full border border-white/20 animate-pulse">
              <span className="text-white/80 font-mono text-sm">
                Redirecting in {redirectCountdown}s...
              </span>
            </div>
          )}
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
