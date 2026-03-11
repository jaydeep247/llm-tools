'use client'

/**
 * CrawlStatusBanner
 *
 * Shows the live crawl state for a Quick Start background crawl.
 * Combines:
 *   - Polling via `initialStatus` prop (parent drives the base value)
 *   - Socket.IO `crawl:status` events from the Node.js consumer for
 *     instant updates (no polling lag).
 *
 * States handled:
 *   running   → animated pulsing indicicator, "Crawling in progress"
 *   completed → green tick,                  "Crawling completed"
 *   failed    → red icon,                    "Crawling failed"
 *   cancelled → grey icon,                   "Crawling cancelled"
 *   null      → nothing rendered
 */

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { CheckCircle, AlertCircle, Globe, XCircle, PauseCircle } from 'lucide-react'

type CrawlStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | null

interface CrawlStatusBannerProps {
  /** The Quick Start job ID — used to join the correct socket room. */
  jobId: string | null
  /** Initial value from the last API poll. Component overrides this with
   *  live socket data once connected. */
  initialStatus: CrawlStatus
  /** Optional callback for "View pages" button */
  onViewPages?: () => void
  /** Callback invoked when the user clicks "Continue crawl" (paused state). */
  onResume?: () => void
  /** Live pages crawled count (from jobSnapshot) */
  pagesCrawled?: number
  /** Total pages goal (defaults to 100) */
  totalPages?: number
  /** Most recently crawled URL */
  currentUrl?: string
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || ''

export function CrawlStatusBanner({
  jobId,
  initialStatus,
  onViewPages,
  onResume,
  pagesCrawled: pagesCrawledProp = 0,
  totalPages = 100,
  currentUrl,
}: CrawlStatusBannerProps) {
  const [status, setStatus] = useState<CrawlStatus>(initialStatus)
  // Live counter driven by crawl:progress socket events; falls back to the
  // parent-polled prop so the value is never stale on initial mount.
  const [livePagesCrawled, setLivePagesCrawled] = useState<number>(pagesCrawledProp)
  const socketRef = useRef<Socket | null>(null)

  // Keep local status in sync when the parent polling drives changes
  // (e.g. on initial mount before socket connects).
  useEffect(() => {
    setStatus(prev => {
      // Never downgrade a truly terminal status via a polling update.
      // 'paused' is NOT terminal — it can be overridden by 'running' on resume.
      const terminal = ['completed', 'failed', 'cancelled']
      if (prev && terminal.includes(prev)) return prev
      return initialStatus
    })
  }, [initialStatus])

  // Keep livePagesCrawled in sync with the parent's polling value, but only
  // if the socket hasn't already reported a higher number (avoids going
  // backwards on a late poll response).
  useEffect(() => {
    setLivePagesCrawled(prev => Math.max(prev, pagesCrawledProp))
  }, [pagesCrawledProp])

  // Socket subscription — live crawl:status events
  useEffect(() => {
    if (!jobId) return

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      // Allow polling as a fallback so the initial connection succeeds even if
      // the WebSocket upgrade is momentarily rejected (avoids the console error
      // the user sees on first load).  Once connected, socket.io upgrades to WS.
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join-job', jobId)
    })

    // Live page counter — updates the progress bar without polling lag.
    socket.on('crawl:progress', (data: { jobId: string; pages_crawled: number }) => {
      if (data.jobId !== jobId) return
      setLivePagesCrawled(prev => Math.max(prev, data.pages_crawled))
    })

    socket.on('crawl:status', (data: { jobId: string; crawl_status: CrawlStatus }) => {
      if (data.jobId !== jobId) return
      setStatus(prev => {
        // Never downgrade a truly terminal status via socket either.
        // 'paused' is NOT terminal — socket 'running' after resume is allowed.
        const terminal = ['completed', 'failed', 'cancelled']
        if (prev && terminal.includes(prev)) return prev
        return data.crawl_status
      })
    })

    return () => {
      if (socket.connected) {
        socket.emit('leave-job', jobId)
        socket.disconnect()
      }
      socketRef.current = null
    }
  }, [jobId])

  /* ------------------------------------------------------------------ */
  /*  Unknown / not-yet-loaded state — show a subtle neutral banner     */
  /*  so the component is always visible once a jobId is provided.      */
  /* ------------------------------------------------------------------ */
  if (!status) {
    return (
      <div className="rounded-2xl border border-zinc-700/40 bg-[#0D0D10] overflow-hidden h-full flex flex-col">
        <div className="flex items-center gap-2.5 px-5 py-3.5 flex-1">
          <span className="h-2 w-2 rounded-full bg-zinc-600 shrink-0" />
          <span className="text-sm font-semibold text-zinc-400">Background crawl</span>
          <span className="text-[10px] text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded-full select-none">
            checking…
          </span>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------ */
  /*  Running state                                                       */
  /* ------------------------------------------------------------------ */
  if (status === 'running') {
    const pct = Math.min(100, totalPages > 0 ? Math.round((livePagesCrawled / totalPages) * 100) : 0)
    return (
      <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            <span className="text-sm font-semibold text-white">Crawling</span>
            <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded-full animate-pulse select-none">
              LIVE
            </span>
          </div>
          {onViewPages && (
            <button
              onClick={onViewPages}
              className="text-[11px] text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
            >
              View <Globe className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Progress area — styled like progress page */}
        <div className="px-5 py-4 flex-1 flex flex-col justify-center space-y-4">
          {/* Percentage + pages label */}
          <div className="flex items-end justify-between">
            <span className="text-zinc-500 text-xs font-mono uppercase tracking-widest">
              Progress
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-zinc-500 tabular-nums">
                <span className="font-semibold text-zinc-300">{livePagesCrawled}</span>
                <span className="text-zinc-600"> / </span>{totalPages} pages
              </span>
              <span className="text-3xl font-bold font-mono tabular-nums text-white">
                {pct}%
              </span>
            </div>
          </div>

          {/* Thick progress bar with shimmer */}
          <div className="space-y-1.5">
            <div className="w-full h-4 bg-white/6 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full rounded-full bg-linear-to-r from-amber-600 via-amber-400 to-amber-300 transition-all duration-700 ease-out relative overflow-hidden"
                style={{ width: `${pct}%` }}
              >
                {/* Shimmer animation */}
                <span
                  className="absolute inset-0 bg-linear-to-r from-transparent via-white/25 to-transparent animate-shimmer"
                />
              </div>
            </div>
            {/* Track labels */}
            <div className="flex justify-between">
              <span className="text-zinc-600 text-[10px] font-mono">0%</span>
              <span className="text-zinc-600 text-[10px] font-mono">100%</span>
            </div>
          </div>

          {/* Current URL — below the progress bar */}
          {currentUrl && (
            <div className="flex items-center gap-2 min-w-0 pt-1">
              <Globe className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
              <span className="text-xs text-zinc-400 font-mono truncate">
                {currentUrl}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------ */
  /*  Paused state                                                        */
  /* ------------------------------------------------------------------ */
  if (status === 'paused') {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-[#0D0D10] overflow-hidden h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <PauseCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-white">100 pages indexed — crawl paused</span>
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full select-none">
              paused
            </span>
          </div>
          {onViewPages && (
            <button
              onClick={onViewPages}
              className="text-[11px] text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
            >
              View pages <Globe className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="px-5 pb-3 border-t border-zinc-800/40 pt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            The initial 100 pages have been indexed. Click <strong className="text-zinc-300">Continue crawl</strong> to
            index the rest of the site.
          </p>
          {onResume && (
            <button
              onClick={() => {
                // Optimistically transition: button disappears immediately
                // without waiting for the socket to confirm 'running'.
                setStatus('running')
                onResume()
              }}
              className="shrink-0 text-[11px] font-semibold text-amber-400 border border-amber-500/40 hover:bg-amber-500/10 px-3 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Continue crawl
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------ */
  /*  Completed state                                                     */
  /* ------------------------------------------------------------------ */
  if (status === 'completed') {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-[#0D0D10] overflow-hidden h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-sm font-semibold text-white">Background crawl completed</span>
            <span className="text-[10px] text-zinc-400 bg-zinc-700/40 px-2 py-0.5 rounded-full select-none">
              done
            </span>
          </div>
          {onViewPages && (
            <button
              onClick={onViewPages}
              className="text-[11px] text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
            >
              View pages <Globe className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="px-5 pb-3 border-t border-zinc-800/40 pt-3">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            All pages have been indexed. Head to the <strong className="text-zinc-300">Crawler</strong> tab
            to explore the full site data.
          </p>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------ */
  /*  Failed state                                                        */
  /* ------------------------------------------------------------------ */
  if (status === 'failed') {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-[#0D0D10] overflow-hidden h-full flex flex-col">
        <div className="flex items-center gap-2.5 px-5 py-3.5 flex-1">
          <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span className="text-sm font-semibold text-white">Background crawl failed</span>
          <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full select-none">
            failed
          </span>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------ */
  /*  Cancelled state                                                     */
  /* ------------------------------------------------------------------ */
  return (
    <div className="rounded-2xl border border-zinc-700/40 bg-[#0D0D10] overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-3.5 flex-1">
        <AlertCircle className="h-4 w-4 text-zinc-500 shrink-0" />
        <span className="text-sm font-semibold text-zinc-400">Background crawl cancelled</span>
      </div>
    </div>
  )
}
