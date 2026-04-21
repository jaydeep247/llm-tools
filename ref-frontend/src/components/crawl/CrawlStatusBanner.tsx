'use client'

import { useEffect, useMemo, useRef, useState, type ElementType } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  CheckCircle,
  AlertCircle,
  Globe,
  XCircle,
  PauseCircle,
  Activity,
  Database,
  StopCircle,
} from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectCrawlProgressByJobId, upsertCrawlProgress } from '@/store/slices/crawlProgressSlice'
import { useStopJobMutation } from '@/store/api/jobApi'

type CrawlStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | null

interface CrawlStatusBannerProps {
  jobId: string | null
  initialStatus: CrawlStatus
  followJobTerminalEvents?: boolean
  onViewPages?: () => void
  onResume?: () => void
  onStop?: () => void
  pagesCrawled?: number
  totalPages?: number
  currentUrl?: string
  componentTitle?: string
  crawlStartedAt?: string | number | null
  crawlCompletedAt?: string | number | null
  crawlUpdatedAt?: string | number | null
  startUrl?: string | null
  totalLinks?: number
  totalSitemaps?: number
  totalFields?: number
  allowSubdomains?: boolean
  maxConcurrency?: number
  maxPages?: number | null
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || ''

type StatusStyle = {
  label: string
  chip: string
  border: string
  iconColor: string
  icon: ElementType
}

const STATUS_STYLES: Record<Exclude<CrawlStatus, null>, StatusStyle> = {
  running: {
    label: 'Running',
    chip: 'text-amber-700 bg-amber-50 border-amber-200',
    border: 'border-amber-200',
    iconColor: 'text-amber-600',
    icon: Activity,
  },
  paused: {
    label: 'Paused',
    chip: 'text-amber-700 bg-amber-50 border-amber-200',
    border: 'border-amber-200',
    iconColor: 'text-amber-600',
    icon: PauseCircle,
  },
  completed: {
    label: 'Completed',
    chip: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    border: 'border-emerald-200',
    iconColor: 'text-emerald-600',
    icon: CheckCircle,
  },
  failed: {
    label: 'Failed',
    chip: 'text-rose-700 bg-rose-50 border-rose-200',
    border: 'border-rose-200',
    iconColor: 'text-rose-600',
    icon: XCircle,
  },
  cancelled: {
    label: 'Cancelled',
    chip: 'text-zinc-600 bg-zinc-100 border-zinc-200',
    border: 'border-zinc-200',
    iconColor: 'text-zinc-500',
    icon: AlertCircle,
  },
}

function parseTime(value?: string | number | null): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function formatTimestamp(ms: number | null): string {
  if (!ms) return '-'
  return new Date(ms).toLocaleString()
}

function displayBool(value?: boolean): string {
  if (value === undefined) return '-'
  return value ? 'Yes' : 'No'
}

export function CrawlStatusBanner({
  jobId,
  initialStatus,
  followJobTerminalEvents = true,
  onViewPages,
  onResume,
  onStop,
  pagesCrawled: pagesCrawledProp = 0,
  totalPages = 0,
  currentUrl,
  componentTitle = 'Background Crawl',
  crawlStartedAt,
  crawlCompletedAt,
  crawlUpdatedAt,
  startUrl,
  totalLinks,
  totalSitemaps,
  totalFields,
  allowSubdomains,
  maxConcurrency,
  maxPages,
}: CrawlStatusBannerProps) {
  const dispatch = useAppDispatch()
  const persisted = useAppSelector(selectCrawlProgressByJobId(jobId ?? ''))
  const persistedStatus = persisted?.status === 'idle' ? null : persisted?.status

  const [status, setStatus] = useState<CrawlStatus>(() => initialStatus ?? (persistedStatus as CrawlStatus) ?? null)
  const [livePagesCrawled, setLivePagesCrawled] = useState<number>(Math.max(pagesCrawledProp, persisted?.pagesCrawled ?? 0))
  const [liveCurrentUrl, setLiveCurrentUrl] = useState<string>(currentUrl || persisted?.lastUrl || '')
  const [liveCrawledAt, setLiveCrawledAt] = useState<number | null>(null)
  const [now, setNow] = useState<number>(Date.now())
  const [stopConfirm, setStopConfirm] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const previousStatusRef = useRef<CrawlStatus>(null)

  const [stopJobMutation] = useStopJobMutation()

  useEffect(() => {
    setStatus(prev => {
      const terminal = ['completed', 'failed', 'cancelled']
      if (prev && terminal.includes(prev)) return prev
      return initialStatus ?? (persistedStatus as CrawlStatus) ?? prev
    })
  }, [initialStatus, persistedStatus])

  useEffect(() => {
    setLivePagesCrawled(prev => Math.max(prev, pagesCrawledProp, persisted?.pagesCrawled ?? 0))
  }, [pagesCrawledProp, persisted?.pagesCrawled])

  useEffect(() => {
    if (currentUrl) {
      setLiveCurrentUrl(currentUrl)
    } else if (!liveCurrentUrl && persisted?.lastUrl) {
      setLiveCurrentUrl(persisted.lastUrl)
    }
  }, [currentUrl, liveCurrentUrl, persisted?.lastUrl])

  useEffect(() => {
    if (!jobId) return
    dispatch(
      upsertCrawlProgress({
        jobId,
        pagesCrawled: Math.max(pagesCrawledProp, persisted?.pagesCrawled ?? 0),
        lastUrl: currentUrl || persisted?.lastUrl,
        status: (initialStatus ?? persistedStatus ?? undefined) as any,
        totalPages: totalPages > 0 ? totalPages : maxPages ?? null,
      }),
    )
  }, [
    jobId,
    pagesCrawledProp,
    currentUrl,
    initialStatus,
    persisted?.pagesCrawled,
    persisted?.lastUrl,
    persistedStatus,
    totalPages,
    maxPages,
    dispatch,
  ])

  useEffect(() => {
    if (!jobId) return

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join-job', jobId)
    })

    socket.on('crawl:progress', (data: { jobId: string; pages_crawled: number; url?: string; title?: string; crawled_at?: string }) => {
      if (data.jobId !== jobId) return
      const nextCount = Number.isFinite(data.pages_crawled) ? data.pages_crawled : 0
      setLivePagesCrawled(prev => Math.max(prev, nextCount))
      if (data.url) {
        setLiveCurrentUrl(data.url)
      }
      if (data.crawled_at) {
        const ts = parseTime(data.crawled_at)
        if (ts) setLiveCrawledAt(ts)
      }
      dispatch(
        upsertCrawlProgress({
          jobId,
          pagesCrawled: nextCount,
          lastUrl: data.url,
          lastTitle: data.title,
          totalPages: totalPages > 0 ? totalPages : maxPages ?? null,
          status: 'running',
        }),
      )
    })

    socket.on('crawl:status', (data: { jobId: string; crawl_status: CrawlStatus }) => {
      if (data.jobId !== jobId) return
      setStatus(prev => {
        const terminal = ['completed', 'failed', 'cancelled']
        if (prev && terminal.includes(prev)) return prev
        return data.crawl_status
      })
      if (data.crawl_status) {
        dispatch(
          upsertCrawlProgress({
            jobId,
            status: data.crawl_status,
            totalPages: totalPages > 0 ? totalPages : maxPages ?? null,
          }),
        )
      }
    })

    if (followJobTerminalEvents) {
      socket.on('job:completed', (data: { jobId: string }) => {
        if (data.jobId !== jobId) return
        setStatus('completed')
        dispatch(
          upsertCrawlProgress({
            jobId,
            status: 'completed',
            totalPages: totalPages > 0 ? totalPages : maxPages ?? null,
          }),
        )
      })

      socket.on('job:failed', (data: { jobId: string; error?: string; payload?: { reason?: string; message?: string } }) => {
        if (data.jobId !== jobId) return
        const reason = data.error || data.payload?.reason || data.payload?.message || ''
        const nextStatus: CrawlStatus = reason === 'stopped_by_user' || reason === 'Session deleted by user'
          ? 'cancelled'
          : 'failed'
        setStatus(nextStatus)
        dispatch(
          upsertCrawlProgress({
            jobId,
            status: nextStatus,
            totalPages: totalPages > 0 ? totalPages : maxPages ?? null,
          }),
        )
      })
    }

    return () => {
      if (socket.connected) {
        socket.emit('leave-job', jobId)
      }
      socket.disconnect()
      socketRef.current = null
    }
  }, [jobId, totalPages, maxPages, dispatch, followJobTerminalEvents])

  const activeStatus: CrawlStatus = status ?? initialStatus ?? (persistedStatus as CrawlStatus) ?? null

  useEffect(() => {
    const previousStatus = previousStatusRef.current
    previousStatusRef.current = activeStatus
    if (previousStatus && previousStatus !== 'cancelled' && activeStatus === 'cancelled') {
      onStop?.()
    }
  }, [activeStatus, onStop])

  const handleStop = async () => {
    if (!jobId || isStopping) return
    setIsStopping(true)
    setStopConfirm(false)
    try {
      const result = await stopJobMutation(jobId).unwrap()
      const serverStatus = result.job?.status?.toLowerCase() as CrawlStatus | undefined
      const nextStatus: CrawlStatus = result.stopApplied
        ? 'cancelled'
        : result.crawlStatus === 'cancelled' || result.crawlStatus === 'paused' || result.crawlStatus === 'running'
          ? result.crawlStatus
          : serverStatus === 'completed'
            ? 'completed'
            : serverStatus === 'failed'
              ? 'failed'
              : 'cancelled'
      setStatus(nextStatus)
      dispatch(upsertCrawlProgress({ jobId, status: nextStatus }))
    } catch {
      // Server already broadcasted the socket event; ignore mutation errors
    } finally {
      setIsStopping(false)
    }
  }

  useEffect(() => {
    const isRunning = activeStatus === 'running'
    if (!isRunning) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [activeStatus])

  const startedAtMs = parseTime(crawlStartedAt)
  const completedAtMs = parseTime(crawlCompletedAt)
  const updatedAtMs = parseTime(crawlUpdatedAt) ?? liveCrawledAt ?? parseTime(persisted?.updatedAt)

  const elapsedMs = useMemo(() => {
    if (!startedAtMs) return 0
    if (activeStatus === 'running') {
      return Math.max(0, now - startedAtMs)
    }
    if (activeStatus === 'paused') {
      if (updatedAtMs) return Math.max(0, updatedAtMs - startedAtMs)
      return Math.max(0, now - startedAtMs)
    }
    if (completedAtMs) {
      return Math.max(0, completedAtMs - startedAtMs)
    }
    if (updatedAtMs) {
      return Math.max(0, updatedAtMs - startedAtMs)
    }
    return 0
  }, [startedAtMs, activeStatus, now, completedAtMs, updatedAtMs])

  const effectiveTotalPages = Math.max(totalPages || 0, maxPages || 0, persisted?.totalPages || 0)
  const percent = effectiveTotalPages > 0 ? Math.min(100, Math.round((livePagesCrawled / effectiveTotalPages) * 100)) : 0

  if (!activeStatus) {
    return (
      <div
        className="rounded-2xl overflow-hidden h-full flex flex-col"
        style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid var(--nd-border)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>{componentTitle}</h3>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ color: 'var(--nd-text-muted)', background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}
          >
            checking
          </span>
        </div>
        <div className="px-5 py-4 text-xs" style={{ color: 'var(--nd-text-muted)' }}>Waiting for crawl metadata...</div>
      </div>
    )
  }

  const statusMeta = STATUS_STYLES[activeStatus]
  const StatusIcon = statusMeta.icon
  const isStoppable = activeStatus === 'running' || activeStatus === 'paused'

  return (
    <div
      className="relative rounded-2xl overflow-hidden h-full flex flex-col"
      style={{ background: 'var(--nd-card-bg)', border: `1px solid var(--nd-border)` }}
    >
      {/* Cancel confirmation overlay */}
      {stopConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
          <div
            className="mx-4 w-full max-w-xs rounded-xl border border-rose-500/40 p-5 text-center shadow-xl"
            style={{ background: 'var(--nd-card-bg)' }}
          >
            <StopCircle className="mx-auto mb-3 h-8 w-8 text-rose-500" />
            <p className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Cancel crawl?</p>
            <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--nd-text-muted)' }}>
              The crawler will stop immediately. All pages crawled so far are already saved — no data will be lost.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setStopConfirm(false)}
                className="flex-1 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer"
                style={{
                  border: '1px solid var(--nd-border)',
                  background: 'var(--nd-bg)',
                  color: 'var(--nd-text-secondary)',
                }}
              >
                Keep crawling
              </button>
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isStopping ? 'Cancelling…' : 'Yes, cancel now'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid var(--nd-border)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--nd-text-primary)' }}>{componentTitle}</h3>
          <span className={`inline-flex items-center gap-1 text-[10px] border px-2 py-0.5 rounded-full ${statusMeta.chip}`}>
            <StatusIcon className={`h-3 w-3 ${statusMeta.iconColor}`} />
            {statusMeta.label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isStoppable && (
            <button
              onClick={() => setStopConfirm(true)}
              disabled={isStopping}
              title="Cancel crawl — preserves all crawled pages"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 border border-rose-200 bg-rose-50 hover:bg-rose-100 hover:border-rose-300 px-2.5 py-1 rounded-lg transition-all cursor-pointer disabled:opacity-40"
            >
              <StopCircle className="h-3 w-3" />
              Cancel
            </button>
          )}
          {onViewPages && (
            <button
              onClick={onViewPages}
              className="text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
              style={{ color: 'var(--nd-text-muted)' }}
            >
              View pages <Globe className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="space-y-2.5">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Pages Indexed</p>
              <p className="text-2xl font-bold tabular-nums leading-tight" style={{ color: 'var(--nd-text-primary)' }}>
                {livePagesCrawled.toLocaleString()}
                {effectiveTotalPages > 0 && (
                  <span className="text-sm font-medium" style={{ color: 'var(--nd-text-muted)' }}> / {effectiveTotalPages.toLocaleString()}</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Crawl Time</p>
              <p className="text-base font-semibold tabular-nums" style={{ color: 'var(--nd-text-secondary)' }}>{formatDuration(elapsedMs)}</p>
            </div>
          </div>

          {effectiveTotalPages > 0 && (
            <div className="space-y-1.5">
              <div
                className="w-full h-3 rounded-full overflow-hidden"
                style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${percent}%`, background: 'var(--nd-purple)' }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono" style={{ color: 'var(--nd-text-muted)' }}>
                <span>0%</span>
                <span>{percent}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Last Update</p>
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--nd-text-secondary)' }}>{formatTimestamp(updatedAtMs)}</p>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Started At</p>
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--nd-text-secondary)' }}>{formatTimestamp(startedAtMs)}</p>
          </div>
          <div className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Allow Subdomains</p>
              <p className="text-xs mt-1" style={{ color: 'var(--nd-text-primary)' }}>{displayBool(allowSubdomains)}</p>
            </div>
            <Database className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--nd-text-muted)' }} />
          </div>
          <div className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Max Pages</p>
              <p className="text-xs mt-1 tabular-nums" style={{ color: 'var(--nd-text-primary)' }}>
                {typeof maxPages === 'number' && maxPages > 0
                  ? maxPages.toLocaleString()
                  : effectiveTotalPages > 0
                    ? effectiveTotalPages.toLocaleString()
                    : '-'}
              </p>
            </div>
            <Activity className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--nd-text-muted)' }} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Start URL</p>
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--nd-text-secondary)' }}>{startUrl || '-'}</p>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Current URL</p>
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--nd-text-secondary)' }}>{liveCurrentUrl || '-'}</p>
          </div>
        </div>

        {activeStatus === 'paused' && onResume && (
          <div className="pt-1 flex items-center justify-end">
            <button
              onClick={() => {
                setStatus('running')
                onResume()
              }}
              className="text-[12px] font-semibold text-black bg-amber-400 border border-amber-300 hover:bg-amber-300 px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Continue crawl
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
