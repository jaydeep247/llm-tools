'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useMemo, useRef } from 'react'
import { Loader2, BarChart3 } from 'lucide-react'
import { motion } from 'framer-motion'
import Aurora from '@/components/animations/Aurora'
import { useGetJobSnapshotQuery, useGetJobStatusQuery } from '@/store/api/jobApi'
import { io, Socket } from 'socket.io-client'

// ─── Types ──────────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'completed' | 'failed'
type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

interface StepDefinition {
  id: string
  label: string
  description: string
}

// ─── Step Definitions (matches quick_start_runner.py phases) ──────────────

const STEP_DEFINITIONS: StepDefinition[] = [
  {
    id: 'brand_analysis',
    label: 'Brand Analysis',
    description: 'Analyzing brand presence and sentiment across AI platforms',
  },
  {
    id: 'competitor_analysis',
    label: 'Competitor & AI Share of Voice',
    description: 'Discovering competitor mentions and measuring AI visibility',
  },
  {
    id: 'ranking_analysis',
    label: 'Ranking Analysis',
    description: 'Checking brand ranking across AI models',
  },
]

const TOTAL_STEPS = STEP_DEFINITIONS.length

// ─── Main Component ─────────────────────────────────────────────────────

export default function JobProgressPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.jobId as string

  // ── Core state ────────────────────────────────────────────────────────
  const [jobStatus, setJobStatus] = useState<JobStatus>('pending')
  const [snapshotAt, setSnapshotAt] = useState<number | null>(null)
  const [jobMeta, setJobMeta] = useState<{ projectId?: string; sessionId?: string }>({})
  const [steps, setSteps] = useState<Record<string, StepStatus>>(() => {
    const initial: Record<string, StepStatus> = {}
    STEP_DEFINITIONS.forEach(s => { initial[s.id] = 'pending' })
    return initial
  })

  // ── Refs for stable socket handlers ───────────────────────────────────
  const hydratedJobIdRef = useRef<string | null>(null)
  const statusRef = useRef<JobStatus>('pending')
  const snapshotAtRef = useRef<number | null>(null)

  useEffect(() => { statusRef.current = jobStatus }, [jobStatus])
  useEffect(() => { snapshotAtRef.current = snapshotAt }, [snapshotAt])

  // ── Reset on job change ───────────────────────────────────────────────
  useEffect(() => {
    hydratedJobIdRef.current = null
    statusRef.current = 'pending'
    snapshotAtRef.current = null
    setJobStatus('pending')
    setSnapshotAt(null)
    setJobMeta({})
    const initial: Record<string, StepStatus> = {}
    STEP_DEFINITIONS.forEach(s => { initial[s.id] = 'pending' })
    setSteps(initial)
  }, [jobId])

  // ── Queries ───────────────────────────────────────────────────────────
  const {
    data: snapshot,
    isSuccess: isSnapshotSuccess,
    isLoading: isSnapshotLoading,
    isFetching: isSnapshotFetching,
  } = useGetJobSnapshotQuery(jobId, {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const { data: polledStatus } = useGetJobStatusQuery(jobId, {
    skip: !jobId,
    pollingInterval: jobStatus === 'running' || jobStatus === 'pending' ? 3000 : 0,
    refetchOnMountOrArgChange: true,
  })

  // ── Snapshot hydration (once per job) ─────────────────────────────────
  useEffect(() => {
    if (isSnapshotFetching || !snapshot || hydratedJobIdRef.current === jobId) return
    hydratedJobIdRef.current = jobId

    setSnapshotAt(snapshot.snapshotAt)

    const snapshotStatus = (snapshot.status || 'pending').toLowerCase() as JobStatus
    setJobStatus(snapshotStatus)

    if (snapshot.projectId || snapshot.sessionId) {
      setJobMeta({ projectId: snapshot.projectId, sessionId: snapshot.sessionId })
    }

    // Hydrate step statuses from snapshot
    if (snapshot.steps && Object.keys(snapshot.steps).length > 0) {
      setSteps(prev => {
        const next = { ...prev }
        for (const [stepId, stepStatus] of Object.entries(snapshot.steps!)) {
          if (next[stepId] !== undefined) {
            next[stepId] = stepStatus as StepStatus
          }
        }
        return next
      })
    }
  }, [isSnapshotSuccess, isSnapshotFetching, snapshot, jobId])

  // ── Polling fallback for metadata + status ────────────────────────────
  useEffect(() => {
    if (!polledStatus) return
    setJobMeta(prev => ({
      ...prev,
      projectId: (polledStatus as any).projectId || prev.projectId,
      sessionId: (polledStatus as any).sessionId || prev.sessionId,
    }))

    const status = (polledStatus.status || '').toLowerCase() as JobStatus
    if (status && status !== jobStatus) {
      if ((jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'cancelled') && status === 'running') return
      setJobStatus(status)
    }
  }, [polledStatus])

  // ── Socket subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!jobId || snapshotAt === null) return
    if (jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'cancelled') return

    const socketSnapshotAt = snapshotAt

    const socket: Socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || '', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      forceNew: true,
    })

    socket.on('connect', () => {
      socket.emit('join-job', jobId)
    })

    const handleEvent = (event: any) => {
      if (event.jobId !== jobId) return
      const eventTimestamp = Number(event.timestamp)
      if (!eventTimestamp || eventTimestamp <= socketSnapshotAt) return

      const eventType = event.eventType

      if (eventType === 'QS_STEP_UPDATE') {
        const stepId = event.payload?.step
        const stepStatus = event.payload?.stepStatus as StepStatus
        if (stepId && stepStatus) {
          setSteps(prev => ({ ...prev, [stepId]: stepStatus }))
        }
      } else if (eventType === 'JOB_STARTED' || eventType === 'status') {
        const newStatus = event.payload?.status || eventType
        if (statusRef.current === 'completed' || statusRef.current === 'failed' || statusRef.current === 'cancelled') return
        if (newStatus === 'running' || eventType === 'JOB_STARTED') {
          setJobStatus('running')
          if (event.payload?.projectId && event.payload?.sessionId) {
            setJobMeta({ projectId: event.payload.projectId, sessionId: event.payload.sessionId })
          }
        }
      } else if (eventType === 'JOB_COMPLETED' || event.payload?.status === 'completed') {
        setJobStatus('completed')
        if (event.payload?.projectId && event.payload?.sessionId) {
          setJobMeta(prev => ({
            ...prev,
            projectId: event.payload.projectId,
            sessionId: event.payload.sessionId,
          }))
        }
        socket.disconnect()
      } else if (eventType === 'JOB_FAILED' || event.payload?.status === 'failed') {
        setJobStatus('failed')
        socket.disconnect()
      } else if (eventType === 'JOB_CANCELLED' || event.payload?.status === 'cancelled') {
        setJobStatus('cancelled')
        socket.disconnect()
      }
    }

    socket.on('job:event', handleEvent)
    socket.on('job:batch', (batch: any[]) => {
      if (Array.isArray(batch)) batch.forEach(handleEvent)
    })
    socket.on('job:completed', handleEvent)
    socket.on('job:failed', handleEvent)

    return () => {
      socket.emit('leave-job', jobId)
      socket.disconnect()
    }
  }, [jobId, snapshotAt])

  // ── Redirect on completion — immediate ────────────────────────────────
  useEffect(() => {
    if (jobStatus !== 'completed' && jobStatus !== 'failed' && jobStatus !== 'cancelled') return

    // Mark all steps completed when job completes (in case events arrived out of order)
    if (jobStatus === 'completed') {
      setSteps(prev => {
        const next = { ...prev }
        STEP_DEFINITIONS.forEach(s => {
          if (next[s.id] !== 'failed') next[s.id] = 'completed'
        })
        return next
      })
    }

    // Short delay for visual feedback, then redirect
    const timer = setTimeout(() => {
      if (jobMeta.projectId && jobMeta.sessionId) {
        router.push(`/dashboard/projects/${jobMeta.projectId}/sessions/${jobMeta.sessionId}`)
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [jobStatus, jobMeta.projectId, jobMeta.sessionId, router])

  // ── Derived values ────────────────────────────────────────────────────
  const completedCount = useMemo(
    () => Object.values(steps).filter(s => s === 'completed').length,
    [steps],
  )

  // Target progress percent based on real step events
  const targetPercent = useMemo(() => {
    if (jobStatus === 'completed') return 100
    if (jobStatus === 'failed' || jobStatus === 'cancelled') return completedCount > 0 ? Math.round((completedCount / TOTAL_STEPS) * 100) : 0
    const runningCount = Object.values(steps).filter(s => s === 'running').length
    return Math.round(((completedCount + runningCount * 0.5) / TOTAL_STEPS) * 100)
  }, [steps, completedCount, jobStatus])

  // Smoothly displayed progress that inches toward target every tick
  const [displayedProgress, setDisplayedProgress] = useState(0)
  const displayedRef = useRef(0)

  useEffect(() => {
    displayedRef.current = displayedProgress
  }, [displayedProgress])

  useEffect(() => {
    // Tick every 80ms and move displayed value toward target
    const interval = setInterval(() => {
      const current = displayedRef.current
      const target = targetPercent
      if (current >= target) return
      const step = jobStatus === 'completed'
        ? Math.max(2, (target - current) * 0.15) // fast finish
        : Math.min(0.6, Math.max(0.1, (target - current) * 0.08)) // gradual
      const next = Math.min(target, current + step)
      displayedRef.current = next
      setDisplayedProgress(next)
    }, 80)
    return () => clearInterval(interval)
  }, [targetPercent, jobStatus])

  const isFailed = jobStatus === 'failed' || jobStatus === 'cancelled'
  const isTerminal = jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'cancelled'

  // ── Current phase label ───────────────────────────────────────────────
  const activeStep = STEP_DEFINITIONS.find(s => steps[s.id] === 'running')
  const phaseLabel = activeStep?.label ?? (isTerminal ? '' : 'Initializing...')

  // ── Loading state ─────────────────────────────────────────────────────
  if (isSnapshotLoading || snapshotAt === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <Loader2 className="h-16 w-16 text-white/60 animate-spin" />
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8 relative overflow-hidden">
      {/* Aurora background */}
      <div className="fixed inset-0 w-full h-full">
        <Aurora colorStops={['#475569', '#64748b', '#475569']} amplitude={1.2} blend={0.6} speed={0.8} />
      </div>

      {/* Dot pattern */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="w-full max-w-2xl flex flex-col items-center gap-12 relative z-20">

        {/* Icon */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`w-24 h-24 rounded-3xl flex items-center justify-center ${
            isFailed
              ? 'bg-red-500/10 border border-red-500/20'
              : jobStatus === 'completed'
                ? 'bg-emerald-500/10 border border-emerald-500/20'
                : 'bg-blue-500/10 border border-blue-500/20'
          }`}
        >
          <BarChart3 className={`w-12 h-12 ${
            isFailed ? 'text-red-400' : jobStatus === 'completed' ? 'text-emerald-400' : 'text-blue-400'
          }`} />
        </motion.div>

        {/* Title */}
        <div className="flex flex-col items-center gap-4 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-white text-4xl font-semibold tracking-tight"
          >
            {isFailed ? 'Analysis Failed' : jobStatus === 'completed' ? 'Analysis Complete' : 'Analyzing Your Brand'}
          </motion.h1>
          {!isTerminal && phaseLabel && (
            <motion.p
              key={phaseLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-white/40 text-base"
            >
              {phaseLabel}
            </motion.p>
          )}
          {isFailed && (
            <p className="text-red-400/70 text-base">Something went wrong. Please try again.</p>
          )}
        </div>

        {/* Progress area */}
        <div className="w-full space-y-5">
          {/* Percentage */}
          <div className="flex items-end justify-between">
            <span className="text-white/40 text-sm font-mono uppercase tracking-widest">Progress</span>
            <motion.span
              className={`text-5xl font-bold font-mono tabular-nums ${
                isFailed ? 'text-red-400' : jobStatus === 'completed' ? 'text-emerald-400' : 'text-white'
              }`}
            >
              {Math.round(displayedProgress)}%
            </motion.span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-5 bg-white/8 rounded-full overflow-hidden border border-white/5">
            <motion.div
              className={`h-full rounded-full transition-none ${
                isFailed
                  ? 'bg-red-500'
                  : jobStatus === 'completed'
                    ? 'bg-emerald-400'
                    : 'bg-linear-to-r from-blue-600 via-blue-400 to-blue-300'
              }`}
              style={{ width: `${displayedProgress}%` }}
            >
              {/* Shimmer on active bar */}
              {!isTerminal && (
                <motion.div
                  className="h-full w-16 bg-linear-to-r from-transparent via-white/20 to-transparent rounded-full"
                  animate={{ x: ['-100%', '800%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', repeatDelay: 0.5 }}
                />
              )}
            </motion.div>
          </div>

          {/* Track labels */}
          <div className="flex justify-between">
            <span className="text-white/20 text-xs font-mono">0%</span>
            <span className="text-white/20 text-xs font-mono">100%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
