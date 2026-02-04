'use client'

interface DiscoveredPagesProps {
  pages: string[]
}

export function DiscoveredPages({ pages }: DiscoveredPagesProps) {
  return (
    <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl overflow-hidden h-full flex flex-col">
      <div className="bg-white/5 px-4 py-3 border-b border-white/10 shrink-0">
        <h3 className="text-base sm:text-lg font-semibold text-white">📄 Discovered Pages</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {pages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/40">
            No pages discovered yet...
          </div>
        ) : (
          pages.slice().reverse().map((page, idx) => (
            <div key={idx} className="hover:bg-white/5 p-2 rounded transition-colors">
              <a
                href={page}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 text-xs sm:text-sm break-all transition-colors"
              >
                {page}
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
