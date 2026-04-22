'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { SectionCard } from '@/components/ui/SectionCard'
import { cn } from '@/lib/utils'
import {
  useSearchMultipleQueriesMutation,
  type BrandMentionSearchResult,
} from '@/store/api/brandMentionsApi'
import {
  Loader2,
  ExternalLink,
  Globe,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Check,
} from 'lucide-react'
import type { PromptResult } from '@/store/api/brandOnboardingApi'

interface PromptSourceURLsComponentProps {
  prompts: PromptResult[]
  isLoading?: boolean
  onSourcesFound?: (total: number) => void
}

type SourceURLGroup = {
  query: string
  results: BrandMentionSearchResult[]
  isLoading: boolean
  error?: string
}

/**
 * Fetches source URLs for each prompt from brand mentions
 * Displays organized by prompt with expandable results
 */
export function PromptSourceURLsComponent({
  prompts,
  isLoading: externalLoading,
  onSourcesFound,
}: PromptSourceURLsComponentProps) {
  const [sourceGroups, setSourceGroups] = useState<SourceURLGroup[]>([])
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const [searchMultipleQueries, { isLoading: isSearching }] =
    useSearchMultipleQueriesMutation()

  // Extract unique prompt texts
  const promptTexts = useMemo(
    () => Array.from(new Set(prompts.map((p) => p.prompt))),
    [prompts],
  )

  // Fetch all source URLs for each prompt
  const fetchSourceURLs = useCallback(async () => {
    if (!promptTexts.length) return

    const initialGroups: SourceURLGroup[] = promptTexts.map((query) => ({
      query,
      results: [],
      isLoading: true,
    }))
    setSourceGroups(initialGroups)

    try {
      const response = await searchMultipleQueries({
        queries: promptTexts,
        num: 10,
      }).unwrap()

      const grouped = response.results.map((group) => ({
        query: group.query,
        results: group.results,
        isLoading: false,
      }))

      setSourceGroups(grouped)
      setHasSearched(true)

      // Report total sources found
      const totalSources = grouped.reduce((acc, g) => acc + g.results.length, 0)
      onSourcesFound?.(totalSources)

      // Expand first group by default
      if (grouped.length > 0 && !expandedPrompt) {
        setExpandedPrompt(grouped[0].query)
      }
    } catch (error) {
      console.error('Failed to fetch source URLs:', error)
      const failedGroups = promptTexts.map((query) => ({
        query,
        results: [],
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch sources',
      }))
      setSourceGroups(failedGroups)
      setHasSearched(true)
    }
  }, [promptTexts, searchMultipleQueries, expandedPrompt, onSourcesFound])

  // Auto-fetch on mount or when prompts change
  useEffect(() => {
    if (!hasSearched && promptTexts.length > 0) {
      fetchSourceURLs()
    }
  }, [promptTexts, hasSearched, fetchSourceURLs])

  if (!promptTexts.length) {
    return null
  }

  const isLoading = isSearching || externalLoading
  const totalResults = sourceGroups.reduce((acc, g) => acc + g.results.length, 0)

  return (
    <SectionCard
      title="Brand Mentions - Source URLs"
      description={`${totalResults} discovered source URLs from ${promptTexts.length} prompt queries`}
      className="bg-white overflow-hidden"
      actionSlot={
        isLoading && (
          <div className="flex items-center gap-2 text-xs text-blue-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Searching...
          </div>
        )
      }
    >
      <div className="space-y-2">
        {sourceGroups.map((group, idx) => {
          const isExpanded = expandedPrompt === group.query
          const isError = !!group.error

          return (
            <div
              key={`${group.query}-${idx}`}
              className="border border-(--nd-border) rounded-lg overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpandedPrompt(isExpanded ? null : group.query)
                }
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-(--nd-bg) transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-(--nd-text-secondary) leading-snug line-clamp-2">
                    {group.query}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {group.isLoading ? (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/25">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          Fetching
                        </span>
                      </>
                    ) : isError ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/25">
                        <AlertCircle className="w-2.5 h-2.5" />
                        Error
                      </span>
                    ) : group.results.length > 0 ? (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25">
                          <Check className="w-2.5 h-2.5" />
                          {group.results.length} sources
                        </span>
                        <span className="text-[9px] text-(--nd-text-muted)">
                          {group.results.length} unique domains
                        </span>
                      </>
                    ) : (
                      <span className="text-[9px] text-(--nd-text-muted)">No sources found</span>
                    )}
                  </div>
                </div>

                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-(--nd-text-muted) shrink-0 mt-0.5" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-(--nd-text-muted) shrink-0 mt-0.5" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-(--nd-border) px-4 pb-3 pt-3 space-y-2 max-h-96 overflow-y-auto">
                  {group.isLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-4 h-4 text-(--nd-text-muted) animate-spin" />
                    </div>
                  ) : isError ? (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-red-200">{group.error}</div>
                    </div>
                  ) : group.results.length > 0 ? (
                    <div className="space-y-1.5">
                      {group.results.map((result, i) => (
                        <a
                          key={`${result.url}-${i}`}
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2.5 p-3 rounded-lg bg-white hover:bg-(--nd-bg) border border-(--nd-border) hover:border-(--nd-border-hover) transition-all group/link"
                        >
                          <div className="mt-0.5 shrink-0">
                            <Globe className="w-3.5 h-3.5 text-(--nd-text-muted) group-hover/link:text-blue-400 transition-colors" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-[11px] font-semibold text-(--nd-text-secondary) group-hover/link:text-blue-300 transition-colors line-clamp-2">
                                  {result.title}
                                </p>
                                <p className="text-[10px] text-(--nd-text-muted) font-mono mt-0.5 truncate group-hover/link:text-(--nd-text-muted) transition-colors">
                                  {result.url}
                                </p>
                              </div>
                              <ExternalLink className="w-3 h-3 text-(--nd-text-muted) group-hover/link:text-blue-400 shrink-0 mt-0.5 transition-colors" />
                            </div>
                            {result.snippet && (
                              <p className="text-[9px] text-(--nd-text-muted) mt-1.5 line-clamp-1">
                                {result.snippet}
                              </p>
                            )}
                            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                              <span className="text-[8px] font-bold uppercase tracking-tighter text-(--nd-text-muted) px-1.5 py-0.5 rounded bg-(--nd-border)">
                                Rank #{result.rank}
                              </span>
                              <span className="text-[8px] text-(--nd-text-muted) bg-(--nd-bg) px-1.5 py-0.5 rounded">
                                {result.source_domain}
                              </span>
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-[11px] text-(--nd-text-muted)">No sources found for this query</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
