'use client'

interface LogEntry {
  message: string
  timestamp: string
}

interface CrawlLoggerProps {
  logs: LogEntry[]
  isCrawling: boolean
}

export function CrawlLogger({ logs, isCrawling }: CrawlLoggerProps) {
  return (
    <div className="rounded-lg border border-(--nd-border) bg-white overflow-hidden h-full flex flex-col">
      <div className="bg-(--nd-bg) px-4 py-3 border-b border-(--nd-border) shrink-0">
        <h3 className="text-base sm:text-lg font-semibold text-(--nd-text-primary)">📝 Live Logs</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs sm:text-sm">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            {isCrawling ? 'Crawling in progress...' : 'Waiting for crawl to start...'}
          </div>
        ) : (
          logs.slice(-100).reverse().map((log, idx) => (
            <div key={idx} className="flex gap-2 text-(--nd-text-secondary) hover:bg-(--nd-bg) p-1 rounded transition-colors">
              <span className="text-blue-400 shrink-0 font-semibold">{log.timestamp}</span>
              <span className="flex-1 break-words">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
