'use client'

import { Badge } from '@/components/ui/badge'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'

interface CrawlStatusHeaderProps {
  crawlStatus: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled' | 'failed'
  isCrawling: boolean
  pageCount: number
  duration: string
  itemsPerSecond: string
}

export function CrawlStatusHeader({
  crawlStatus,
  isCrawling,
  pageCount,
  duration,
  itemsPerSecond,
}: CrawlStatusHeaderProps) {
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-400/50'
      case 'running':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-400/50 animate-pulse'
      case 'auditing':
        return 'bg-amber-500/20 text-amber-400 border-amber-400/50'
      case 'failed':
      case 'cancelled':
        return 'bg-rose-500/20 text-rose-400 border-rose-400/50'
      case 'pending':
        return 'bg-(--nd-bg) text-(--nd-text-muted) border-(--nd-border)'
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-400/50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      case 'running':
      case 'auditing':
        return <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin" />
      case 'failed':
      case 'cancelled':
        return <XCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      default:
        return null
    }
  }

  return (
    <div className="rounded-lg p-3 sm:p-4 border border-(--nd-border) bg-white">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-bold text-(--nd-text-primary)">🕷️ Crawling Status</h2>
          <div className="flex items-center gap-1.5">
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing'
                  ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]'
                  : crawlStatus === 'completed'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                  : 'bg-slate-500'
              }`}
            ></div>
            <Badge className={`${getStatusColor(crawlStatus)} text-[10px] flex items-center gap-1`}>
              {getStatusIcon(crawlStatus)}
              {crawlStatus === 'running'
                ? 'CRAWLING...'
                : crawlStatus === 'auditing'
                ? 'AUDITING...'
                : crawlStatus === 'completed'
                ? 'COMPLETED'
                : crawlStatus === 'cancelled'
                ? 'CANCELLED'
                : crawlStatus === 'failed'
                ? 'FAILED'
                : crawlStatus?.toUpperCase() || 'IDLE'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="text-center">
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-400 mb-1">
            {pageCount}
          </div>
          <div className="text-[10px] sm:text-xs text-(--nd-text-muted) uppercase tracking-wider">
            Pages Discovered
          </div>
        </div>

        <div className="text-center">
          <div
            className={`text-xl sm:text-2xl md:text-3xl font-bold mb-1 ${
              isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing'
                ? 'text-(--nd-text-muted) animate-pulse'
                : crawlStatus === 'completed' ? 'text-blue-400' : 'text-(--nd-text-primary)'
            }`}
          >
            {duration}
          </div>
          <div className="text-[10px] sm:text-xs text-(--nd-text-muted) uppercase tracking-wider">Duration</div>
        </div>

        <div className="text-center">
          <div className={`text-xl sm:text-2xl md:text-3xl font-bold mb-1 ${
            crawlStatus === 'completed' ? 'text-blue-400' : 'text-(--nd-text-primary)'
          }`}>
            {itemsPerSecond}
          </div>
          <div className="text-[10px] sm:text-xs text-(--nd-text-muted) uppercase tracking-wider">Items/Sec</div>
        </div>
      </div>
    </div>
  )
}
