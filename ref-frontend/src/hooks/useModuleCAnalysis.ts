import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useRunModuleCAnalysisMutation } from '@/store/api/module_C/moduleCApi'

type AnalysisStatus = 'idle' | 'running' | 'completed' | 'failed'

type JobEventPayload = {
  status?: string
  progress?: number
  message?: string
  stage?: string
}

type JobEvent = {
  jobId?: string
  eventType?: string
  payload?: JobEventPayload
  timestamp?: number
  status?: string
}

type PersistedModuleCAnalysis = {
  analysisJobId: string | null
  status: AnalysisStatus
  targetProgress: number
  displayedProgress: number
  phaseLabel: string
  updatedAt: number
}

interface UseModuleCAnalysisArgs {
  jobId?: string | null
  url?: string
  onCompleted?: () => void
}

interface UseModuleCAnalysisResult {
  isAnalyzing: boolean
  status: AnalysisStatus
  progress: number
  phaseLabel: string
  analysisJobId: string | null
  runAnalysis: () => Promise<void>
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || ''
const STORAGE_PREFIX = 'module-c-analysis-v1:'
const STALE_RUNNING_MS = 2 * 60 * 60 * 1000

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

const storageKeyForJob = (jobId: string) => `${STORAGE_PREFIX}${jobId}`

const getDefaultPhase = (progress: number): string => {
  if (progress < 15) return 'Initializing analysis'
  if (progress < 35) return 'Extracting entities and page signals'
  if (progress < 60) return 'Measuring answer and coverage quality'
  if (progress < 85) return 'Running multi-model simulation'
  if (progress < 100) return 'Finalizing module insights'
  return 'Analysis complete'
}

const loadPersistedState = (jobId?: string | null): PersistedModuleCAnalysis | null => {
  if (!jobId || typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(storageKeyForJob(jobId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as PersistedModuleCAnalysis
    if (!parsed || typeof parsed !== 'object') return null

    const updatedAt = Number(parsed.updatedAt || 0)
    const isRunningAndStale = parsed.status === 'running' && Date.now() - updatedAt > STALE_RUNNING_MS

    if (isRunningAndStale) {
      window.sessionStorage.removeItem(storageKeyForJob(jobId))
      return null
    }

    return {
      analysisJobId: parsed.analysisJobId ?? null,
      status: parsed.status ?? 'idle',
      targetProgress: clampPercent(Number(parsed.targetProgress || 0)),
      displayedProgress: clampPercent(Number(parsed.displayedProgress || 0)),
      phaseLabel: parsed.phaseLabel || '',
      updatedAt,
    }
  } catch {
    return null
  }
}

const persistState = (jobId: string, value: PersistedModuleCAnalysis) => {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(storageKeyForJob(jobId), JSON.stringify(value))
  } catch {
    // Ignore storage errors (private mode / quota)
  }
}

export function useModuleCAnalysis({ jobId, url = '', onCompleted }: UseModuleCAnalysisArgs): UseModuleCAnalysisResult {
  const persistedOnLoad = useMemo(() => loadPersistedState(jobId), [jobId])

  const [analysisJobId, setAnalysisJobId] = useState<string | null>(persistedOnLoad?.analysisJobId ?? null)
  const [status, setStatus] = useState<AnalysisStatus>(persistedOnLoad?.status ?? 'idle')
  const [targetProgress, setTargetProgress] = useState<number>(persistedOnLoad?.targetProgress ?? 0)
  const [displayedProgress, setDisplayedProgress] = useState<number>(persistedOnLoad?.displayedProgress ?? 0)
  const [phaseLabel, setPhaseLabel] = useState<string>(persistedOnLoad?.phaseLabel || '')

  const [runAnalysis, { isLoading: isSubmitting }] = useRunModuleCAnalysisMutation()

  const displayRef = useRef(displayedProgress)
  const onCompletedRef = useRef(onCompleted)

  useEffect(() => {
    onCompletedRef.current = onCompleted
  }, [onCompleted])

  useEffect(() => {
    const persisted = loadPersistedState(jobId)
    if (!persisted) {
      setAnalysisJobId(null)
      setStatus('idle')
      setTargetProgress(0)
      setDisplayedProgress(0)
      setPhaseLabel('')
      displayRef.current = 0
      return
    }

    setAnalysisJobId(persisted.analysisJobId)
    setStatus(persisted.status)
    setTargetProgress(persisted.targetProgress)
    setDisplayedProgress(persisted.displayedProgress)
    setPhaseLabel(persisted.phaseLabel)
    displayRef.current = persisted.displayedProgress
  }, [jobId])

  useEffect(() => {
    if (!jobId) return

    persistState(jobId, {
      analysisJobId,
      status,
      targetProgress,
      displayedProgress,
      phaseLabel,
      updatedAt: Date.now(),
    })
  }, [jobId, analysisJobId, status, targetProgress, displayedProgress, phaseLabel])

  useEffect(() => {
    displayRef.current = displayedProgress
  }, [displayedProgress])

  useEffect(() => {
    const interval = setInterval(() => {
      const current = displayRef.current
      if (current >= targetProgress) return

      const step = targetProgress >= 100
        ? Math.max(1.5, (targetProgress - current) * 0.2)
        : Math.min(0.8, Math.max(0.15, (targetProgress - current) * 0.1))
      const next = Math.min(targetProgress, current + step)
      displayRef.current = next
      setDisplayedProgress(next)
    }, 80)

    return () => clearInterval(interval)
  }, [targetProgress])

  useEffect(() => {
    if (status !== 'running') return

    const interval = setInterval(() => {
      setTargetProgress((prev) => {
        if (prev >= 92) return prev
        const increment = prev < 30 ? 4 : prev < 60 ? 2.5 : 1.2
        return clampPercent(prev + increment)
      })
    }, 1800)

    return () => clearInterval(interval)
  }, [status])

  useEffect(() => {
    if (phaseLabel) return
    setPhaseLabel(getDefaultPhase(targetProgress))
  }, [phaseLabel, targetProgress])

  useEffect(() => {
    if (!analysisJobId || status !== 'running' || !SOCKET_URL) return

    const socket: Socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socket.on('connect', () => {
      socket.emit('join-job', analysisJobId)
    })

    const handleEvent = (raw: JobEvent) => {
      if (raw?.jobId && raw.jobId !== analysisJobId) return

      const eventType = String(raw?.eventType || '').toUpperCase()
      const payload: JobEventPayload = raw?.payload || raw
      const payloadStatus = String(payload?.status || raw?.status || '').toLowerCase()

      if (eventType === 'PROGRESS_UPDATE' || typeof payload?.progress === 'number') {
        const eventProgress = clampPercent(Number(payload?.progress ?? 0))
        if (eventProgress > 0) {
          setTargetProgress((prev) => Math.max(prev, Math.min(98, eventProgress)))
        }
        if (payload?.message) {
          setPhaseLabel(String(payload.message))
        }
      }

      if (eventType === 'JOB_STARTED' || payloadStatus === 'running') {
        setStatus('running')
        setTargetProgress((prev) => Math.max(prev, 12))
      }

      if (eventType === 'JOB_COMPLETED' || payloadStatus === 'completed') {
        setStatus('completed')
        setTargetProgress(100)
        setPhaseLabel('Analysis complete')
        setAnalysisJobId(null)
        onCompletedRef.current?.()
      }

      if (eventType === 'JOB_FAILED' || payloadStatus === 'failed') {
        setStatus('failed')
        setPhaseLabel('Analysis failed')
        setAnalysisJobId(null)
      }
    }

    socket.on('job:event', handleEvent)
    socket.on('job:batch', (batch: JobEvent[]) => {
      if (!Array.isArray(batch)) return
      batch.forEach(handleEvent)
    })
    socket.on('job:completed', handleEvent)
    socket.on('job:failed', handleEvent)

    return () => {
      socket.emit('leave-job', analysisJobId)
      socket.disconnect()
    }
  }, [analysisJobId, status])

  const runModuleCAnalysis = useCallback(async () => {
    if (!jobId) return

    setStatus('running')
    setTargetProgress(6)
    setDisplayedProgress(6)
    displayRef.current = 6
    setPhaseLabel('Queuing analysis')

    try {
      const response = await runAnalysis({ jobId, url }).unwrap()
      const nextAnalysisJobId = response.data?.analysisJobId

      if (nextAnalysisJobId) {
        setAnalysisJobId(nextAnalysisJobId)
        setStatus('running')
        setTargetProgress((prev) => Math.max(prev, 10))
        setPhaseLabel('Analysis started')
      } else {
        setStatus('failed')
        setPhaseLabel('Failed to start analysis')
      }
    } catch {
      setStatus('failed')
      setPhaseLabel('Failed to start analysis')
    }
  }, [jobId, runAnalysis, url])

  const isAnalyzing = status === 'running' || isSubmitting

  return {
    isAnalyzing,
    status,
    progress: displayedProgress,
    phaseLabel: phaseLabel || getDefaultPhase(displayedProgress),
    analysisJobId,
    runAnalysis: runModuleCAnalysis,
  }
}
