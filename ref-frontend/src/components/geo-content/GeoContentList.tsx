'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, FileText, Loader2, AlertCircle, Calendar, Hash, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useListGeoContentQuery } from '@/store/api/geoContentApi'

export function GeoContentList({ onCreateClick, onViewItem }: { onCreateClick?: () => void; onViewItem?: (id: string) => void } = {}) {
  const router = useRouter()
  const navigate = onCreateClick ?? (() => router.push('/dashboard/geo-content/create'))
  const { data, isLoading, error } = useListGeoContentQuery({})

  return (
    <div className="space-y-6 animate-fade-in-hero">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">GEO Content</h1>
          <p className="text-zinc-500 text-sm mt-1">
            AI-optimized articles designed to appear in ChatGPT, Perplexity, and Gemini answers.
          </p>
        </div>
        <Button
          id="create-geo-content-btn"
          onClick={navigate}
          className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Create New
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mb-3" />
          <p className="text-zinc-400">Failed to load GEO content</p>
        </div>
      ) : !data?.items?.length ? (
        /* Empty state */
        <div className="rounded-2xl border border-zinc-800 bg-[#111113] flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-indigo-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">No GEO articles yet</h2>
          <p className="text-zinc-500 text-sm mb-6 max-w-xs">
            Generate your first AI-optimized article to start appearing in AI-generated answers.
          </p>
          <Button
            id="empty-state-create-btn"
            onClick={navigate}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Create First Article
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.items.map((item) => (
            <button
              key={item.id}
              id={`geo-content-item-${item.id}`}
              onClick={() => onViewItem ? onViewItem(item.id) : router.push(`/dashboard/geo-content/${item.id}`)}
              className="group text-left rounded-xl border border-zinc-800 bg-[#111113] hover:border-zinc-700 hover:bg-[#161618] transition-all duration-200 p-4 sm:p-5 cursor-pointer w-full"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {item.listicle && (
                      <ListOrdered className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    )}
                    <h3 className="font-semibold text-white text-sm sm:text-base truncate group-hover:text-indigo-300 transition-colors">
                      {item.title}
                    </h3>
                  </div>
                  <p className="text-zinc-500 text-xs line-clamp-2 mb-3">{item.brief}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      {item.wordCount.toLocaleString()} words
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(item.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    {item.keywords.slice(0, 3).map((kw) => (
                      <span
                        key={kw}
                        className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    item.status === 'published'
                      ? 'border-green-500/30 text-green-400 bg-green-500/10 shrink-0'
                      : 'border-zinc-700 text-zinc-500 bg-zinc-800/40 shrink-0'
                  }
                >
                  {item.status}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination info */}
      {data && data.total > 0 && (
        <p className="text-center text-xs text-zinc-600">
          Showing {data.items.length} of {data.total} articles
        </p>
      )}
    </div>
  )
}
