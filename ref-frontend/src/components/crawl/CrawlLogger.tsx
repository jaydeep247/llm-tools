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
    <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl overflow-hidden h-full flex flex-col">
      <div className="bg-white/5 px-4 py-3 border-b border-white/10 shrink-0">
        <h3 className="text-base sm:text-lg font-semibold text-white">📝 Live Logs</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs sm:text-sm">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/40">
            {isCrawling ? 'Crawling in progress...' : 'Waiting for crawl to start...'}
          </div>
        ) : (
          logs.slice(-100).reverse().map((log, idx) => (
            <div key={idx} className="flex gap-2 text-white/80 hover:bg-white/5 p-1 rounded transition-colors">
              <span className="text-purple-400 shrink-0 font-semibold">{log.timestamp}</span>
              <span className="flex-1 break-words">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
