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
    chip: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    border: 'border-amber-500/25',
    iconColor: 'text-amber-400',
    icon: Activity,
  },
  paused: {
    label: 'Paused',
    chip: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    border: 'border-amber-500/25',
    iconColor: 'text-amber-400',
    icon: PauseCircle,
  },
  completed: {
    label: 'Completed',
    chip: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    border: 'border-emerald-500/25',
    iconColor: 'text-emerald-400',
    icon: CheckCircle,
  },
  failed: {
    label: 'Failed',
    chip: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
    border: 'border-rose-500/25',
    iconColor: 'text-rose-400',
    icon: XCircle,
  },
  cancelled: {
    label: 'Cancelled',
    chip: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30',
    border: 'border-zinc-500/25',
    iconColor: 'text-zinc-400',
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
      <div className="rounded-2xl border border-zinc-700/40 bg-[#0D0D10] overflow-hidden h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60">
          <h3 className="text-sm font-semibold text-white">{componentTitle}</h3>
          <span className="text-[10px] text-zinc-500 bg-zinc-800/60 border border-zinc-700/50 px-2 py-0.5 rounded-full">checking</span>
        </div>
        <div className="px-5 py-4 text-xs text-zinc-500">Waiting for crawl metadata...</div>
      </div>
    )
  }

  const statusMeta = STATUS_STYLES[activeStatus]
  const StatusIcon = statusMeta.icon
  const isStoppable = activeStatus === 'running' || activeStatus === 'paused'

  return (
    <div className={`relative rounded-2xl border bg-[#0D0D10] overflow-hidden h-full flex flex-col ${statusMeta.border}`}>
      {/* Cancel confirmation overlay */}
      {stopConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-xs rounded-xl border border-rose-500/40 bg-zinc-900 p-5 text-center shadow-xl">
            <StopCircle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
            <p className="text-sm font-semibold text-white">Cancel crawl?</p>
            <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
              The crawler will stop immediately. All pages crawled so far are already saved — no data will be lost.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setStopConfirm(false)}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Keep crawling
              </button>
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="flex-1 rounded-lg border border-rose-500/60 bg-rose-500/15 px-3 py-1.5 text-[12px] font-semibold text-rose-300 hover:bg-rose-500/25 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isStopping ? 'Cancelling…' : 'Yes, cancel now'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{componentTitle}</h3>
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
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 border border-rose-500/35 bg-rose-500/8 hover:bg-rose-500/18 hover:text-rose-300 hover:border-rose-400/50 px-2.5 py-1 rounded-lg transition-all cursor-pointer disabled:opacity-40 shadow-[0_0_0_1px_rgba(239,68,68,0.1)]"
            >
              <StopCircle className="h-3 w-3" />
              Cancel
            </button>
          )}
          {onViewPages && (
            <button
              onClick={onViewPages}
              className="text-[11px] text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
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
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Pages Indexed</p>
              <p className="text-2xl font-bold text-white tabular-nums leading-tight">
                {livePagesCrawled.toLocaleString()}
                {effectiveTotalPages > 0 && (
                  <span className="text-sm text-zinc-500 font-medium"> / {effectiveTotalPages.toLocaleString()}</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Crawl Time</p>
              <p className="text-base font-semibold text-zinc-200 tabular-nums">{formatDuration(elapsedMs)}</p>
            </div>
          </div>

          {effectiveTotalPages > 0 && (
            <div className="space-y-1.5">
              <div className="w-full h-3 bg-white/6 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full rounded-full bg-linear-to-r from-amber-600 via-amber-400 to-amber-300 transition-all duration-700 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-600 font-mono">
                <span>0%</span>
                <span>{percent}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Last Update</p>
            <p className="text-xs text-zinc-300 mt-1 truncate">{formatTimestamp(updatedAtMs)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Started At</p>
            <p className="text-xs text-zinc-300 mt-1 truncate">{formatTimestamp(startedAtMs)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Allow Subdomains</p>
              <p className="text-xs text-zinc-200 mt-1">{displayBool(allowSubdomains)}</p>
            </div>
            <Database className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Max Pages</p>
              <p className="text-xs text-zinc-200 mt-1 tabular-nums">
                {typeof maxPages === 'number' && maxPages > 0
                  ? maxPages.toLocaleString()
                  : effectiveTotalPages > 0
                    ? effectiveTotalPages.toLocaleString()
                    : '-'}
              </p>
            </div>
            <Activity className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Start URL</p>
            <p className="text-xs text-zinc-300 mt-1 truncate">{startUrl || '-'}</p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Current URL</p>
            <p className="text-xs text-zinc-300 mt-1 truncate">{liveCurrentUrl || '-'}</p>
          </div>
        </div>

        {activeStatus === 'paused' && onResume && (
          <div className="pt-1 flex items-center justify-end">
            <button
              onClick={() => {
                setStatus('running')
                onResume()
              }}
              className="text-[12px] font-semibold text-black bg-amber-400 border border-amber-300 hover:bg-amber-300 px-3.5 py-1.5 rounded-lg transition-colors shadow-[0_0_0_1px_rgba(251,191,36,0.35)] cursor-pointer"
            >
              Continue crawl
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
