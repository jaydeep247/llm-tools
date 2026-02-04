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
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'running':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'auditing':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'failed':
      case 'cancelled':
        return 'bg-red-500/20 text-red-300 border-red-500/30'
      default:
        return 'bg-white/10 text-white/60 border-white/20'
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
    <div className="rounded-lg p-4 sm:p-5 md:p-6 border border-white/20 bg-white/10 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-white">🕷️ Crawling Status</h2>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing'
                  ? 'bg-purple-400 animate-pulse'
                  : 'bg-gray-500'
              }`}
            ></div>
            <Badge className={`${getStatusColor(crawlStatus)} text-xs flex items-center gap-1`}>
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
                : 'IDLE'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <div className="text-center">
          <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-2">
            {pageCount}
          </div>
          <div className="text-xs sm:text-sm text-white/60 uppercase tracking-wider">
            Pages Discovered
          </div>
        </div>

        <div className="text-center">
          <div
            className={`text-3xl sm:text-4xl md:text-5xl font-bold mb-2 ${
              isCrawling || crawlStatus === 'running' || crawlStatus === 'auditing'
                ? 'text-purple-400'
                : 'text-white'
            }`}
          >
            {duration}
          </div>
          <div className="text-xs sm:text-sm text-white/60 uppercase tracking-wider">Duration</div>
        </div>

        <div className="text-center">
          <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-2">
            {itemsPerSecond}
          </div>
          <div className="text-xs sm:text-sm text-white/60 uppercase tracking-wider">Items/Sec</div>
        </div>
      </div>
    </div>
  )
}
