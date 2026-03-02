'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useMemo, useRef } from 'react'
import { Loader2, CheckCircle2, XCircle, Circle, Sparkles, BarChart3, Users, TrendingUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
  icon: React.ReactNode
}

// ─── Step Definitions (matches quick_start_runner.py phases) ──────────────

const STEP_DEFINITIONS: StepDefinition[] = [
  {
    id: 'brand_analysis',
    label: 'Brand Analysis',
    description: 'Analyzing brand presence and sentiment across AI platforms',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    id: 'competitor_analysis',
    label: 'Competitor & AI Share of Voice',
    description: 'Discovering competitor mentions and measuring AI visibility',
    icon: <Users className="w-5 h-5" />,
  },
  {
    id: 'ranking_analysis',
    label: 'Ranking Analysis',
    description: 'Checking brand ranking across AI models',
    icon: <TrendingUp className="w-5 h-5" />,
  },
]

const TOTAL_STEPS = STEP_DEFINITIONS.length

// ─── Step Status Icon ────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />
    case 'running':
      return (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-5 h-5 text-blue-400" />
        </motion.div>
      )
    case 'failed':
      return <XCircle className="w-5 h-5 text-red-400" />
    default:
      return <Circle className="w-5 h-5 text-white/20" />
  }
}

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

  const progressPercent = useMemo(
    () => {
      const runningCount = Object.values(steps).filter(s => s === 'running').length
      return Math.round(((completedCount + runningCount * 0.4) / TOTAL_STEPS) * 100)
    },
    [steps, completedCount],
  )

  const isTerminal = jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'cancelled'

  // ── Loading state ─────────────────────────────────────────────────────
  if (isSnapshotLoading || snapshotAt === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 text-white animate-spin" />
          <p className="text-white/60 text-lg">Loading session progress...</p>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
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

      <div className="w-full max-w-lg flex flex-col items-center gap-8 relative z-20">
        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <BarChart3 className="w-10 h-10 text-blue-400" />
          </motion.div>

          <h1 className="text-white text-2xl font-semibold tracking-tight">
            {isTerminal ? (jobStatus === 'completed' ? 'Analysis Complete' : 'Analysis Failed') : 'Analyzing Your Brand'}
          </h1>
          <p className="text-white/40 text-sm text-center max-w-xs">
            {isTerminal
              ? jobStatus === 'completed'
                ? 'Redirecting to your dashboard...'
                : 'Something went wrong. Please try again.'
              : 'Running AI-powered analysis across multiple dimensions'}
          </p>
        </div>

        {/* Overall progress bar */}
        <div className="w-full">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs font-mono uppercase tracking-wider">Progress</span>
            <span className="text-white/70 text-sm font-mono">
              {completedCount}/{TOTAL_STEPS}
            </span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                jobStatus === 'completed'
                  ? 'bg-emerald-400'
                  : jobStatus === 'failed'
                    ? 'bg-red-400'
                    : 'bg-blue-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${jobStatus === 'completed' ? 100 : progressPercent}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="w-full space-y-3">
          {STEP_DEFINITIONS.map((step, index) => {
            const status = steps[step.id]
            const isActive = status === 'running'
            const isDone = status === 'completed'
            const isFailed = status === 'failed'

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                className={`relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-500 ${
                  isActive
                    ? 'bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-500/5'
                    : isDone
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : isFailed
                        ? 'bg-red-500/5 border-red-500/20'
                        : 'bg-white/5 border-white/10'
                }`}
              >
                {/* Pulse glow for active step */}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-xl border border-blue-400/20"
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}

                {/* Icon */}
                <div className={`mt-0.5 shrink-0 ${
                  isActive ? 'text-blue-400' : isDone ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-white/20'
                }`}>
                  {step.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${
                      isActive ? 'text-white' : isDone ? 'text-emerald-300/90' : isFailed ? 'text-red-300/90' : 'text-white/40'
                    }`}>
                      {step.label}
                    </span>
                    <StepIcon status={status} />
                  </div>
                  <p className={`text-xs mt-1 ${
                    isActive ? 'text-white/50' : isDone ? 'text-emerald-400/40' : 'text-white/20'
                  }`}>
                    {isActive
                      ? step.description
                      : isDone
                        ? 'Completed'
                        : isFailed
                          ? 'Failed'
                          : 'Waiting...'}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Completion indicator */}
        <AnimatePresence>
          {isTerminal && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className={`px-5 py-2.5 rounded-full border ${
                jobStatus === 'completed'
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <span className={`text-sm font-medium ${
                jobStatus === 'completed' ? 'text-emerald-300' : 'text-red-300'
              }`}>
                {jobStatus === 'completed' ? 'Redirecting to dashboard...' : 'Analysis encountered an error'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
