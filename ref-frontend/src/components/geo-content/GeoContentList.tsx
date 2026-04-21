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
          <h1 className="text-2xl font-bold text-(--nd-text-primary)">GEO Content</h1>
          <p className="text-(--nd-text-muted) text-sm mt-1">
            AI-optimized articles designed to appear in ChatGPT, Perplexity, and Gemini answers.
          </p>
        </div>
        <Button
          id="create-geo-content-btn"
          onClick={navigate}
          className="bg-(--nd-purple) hover:bg-(--nd-purple-light) text-white gap-2 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Create New
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-(--nd-text-muted)" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-12 w-12 text-red-600 mb-3" />
          <p className="text-(--nd-text-muted)">Failed to load GEO content</p>
        </div>
      ) : !data?.items?.length ? (
        /* Empty state */
        <div className="rounded-2xl border border-(--nd-border) bg-white flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-(--nd-purple-subtle) flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-(--nd-purple)" />
          </div>
          <h2 className="text-lg font-semibold text-(--nd-text-primary) mb-2">No GEO articles yet</h2>
          <p className="text-(--nd-text-muted) text-sm mb-6 max-w-xs">
            Generate your first AI-optimized article to start appearing in AI-generated answers.
          </p>
          <Button
            id="empty-state-create-btn"
            onClick={navigate}
            className="bg-(--nd-purple) hover:bg-(--nd-purple-light) text-white gap-2 cursor-pointer"
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
              className="group text-left rounded-xl border border-(--nd-border) bg-white hover:border-(--nd-border-hover) hover:bg-(--nd-bg) transition-all duration-200 p-4 sm:p-5 cursor-pointer w-full"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {item.listicle && (
                      <ListOrdered className="h-3.5 w-3.5 text-(--nd-purple) shrink-0" />
                    )}
                    <h3 className="font-semibold text-(--nd-text-primary) text-sm sm:text-base truncate group-hover:text-(--nd-purple) transition-colors">
                      {item.title}
                    </h3>
                  </div>
                  <p className="text-(--nd-text-muted) text-xs line-clamp-2 mb-3">{item.brief}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-(--nd-text-muted)">
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
                        className="px-1.5 py-0.5 rounded bg-(--nd-bg) text-(--nd-text-muted)"
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
                      ? 'border-green-200 text-green-700 bg-green-50 shrink-0'
                      : 'border-(--nd-border) text-(--nd-text-muted) bg-(--nd-bg) shrink-0'
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
        <p className="text-center text-xs text-(--nd-text-muted)">
          Showing {data.items.length} of {data.total} articles
        </p>
      )}
    </div>
  )
}
