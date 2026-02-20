'use client'

import { useMemo, useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Gauge, Layers, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetModuleEResultQuery, useRunConsistencyAnalysisMutation } from '@/store/api/module_E/moduleEApi'

interface ContentConsistencyEntityCoverageProps {
  jobId?: string | null
}

export default function ContentConsistencyEntityCoverage({ jobId }: ContentConsistencyEntityCoverageProps) {
  const [showAllMissing, setShowAllMissing] = useState(false)
  const { data, isLoading, error, refetch } = useGetModuleEResultQuery(jobId || '', {
    skip: !jobId,
  })
  
  const [runConsistencyAnalysis, { isLoading: isAnalyzing }] = useRunConsistencyAnalysisMutation()
  const [isPolling, setIsPolling] = useState(false)

  // Poll for results when analysis is running or just finished
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isPolling) {
      interval = setInterval(() => {
        refetch().then((res) => {
           // If we have data and it's recent (or just check if we have data), stop polling
           // For now, let's just poll for a fixed duration or until data changes
           // Better approach: check job status if available, but here we just check if data appears
           if (res.data?.data?.content_consistency?.score) {
             setIsPolling(false)
           }
        })
      }, 3000)
    }
    return () => clearInterval(interval)
  }, [isPolling, refetch])

  const handleRunAnalysis = async () => {
    if (jobId) {
      try {
        await runConsistencyAnalysis(jobId).unwrap()
        setIsPolling(true)
        // Stop polling after 60s timeout if no result
        setTimeout(() => setIsPolling(false), 60000)
      } catch (err) {
        console.error('Failed to run consistency analysis:', err)
      }
    }
  }

  const result = data?.data
  const consistencyScore = result?.content_consistency?.score ?? 0
  const entityScore = result?.entity_coverage?.score ?? 0
  const mandate = result?.content_consistency?.mandate
  const missing = result?.entity_coverage?.missing ?? []
  const found = result?.entity_coverage?.found ?? []
  const totalExpected = result?.entity_coverage?.total_expected ?? 0

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400'
    if (score >= 60) return 'text-amber-400'
    return 'text-rose-400'
  }

  const scoreBg = (score: number) => {
    if (score >= 80) return 'bg-emerald-500/10 border-emerald-500/30'
    if (score >= 60) return 'bg-amber-500/10 border-amber-500/30'
    return 'bg-rose-500/10 border-rose-500/30'
  }

  const mandateChips = useMemo(() => {
    const chips: Array<{ label: string; value?: string }> = [
      { label: 'Topic', value: mandate?.topic },
      { label: 'Audience', value: mandate?.audience },
      { label: 'Tone', value: mandate?.tone },
      { label: 'Brand', value: mandate?.brand_name },
      { label: 'Location', value: mandate?.location },
    ]
    return chips.filter((c) => c.value && c.value.trim().length > 0)
  }, [mandate])

  const isProcessing = isAnalyzing || isPolling

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600">
            <Gauge className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Consistency & Coverage</h3>
            <p className="text-sm text-muted-foreground">Content mandate fit and entity depth</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRunAnalysis} size="sm" variant="default" disabled={!jobId || isProcessing || isLoading}>
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing
              </>
            ) : (
              'Run Analysis'
            )}
          </Button>
          <Button onClick={() => refetch()} size="sm" variant="secondary" disabled={!jobId || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Refreshing
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {!jobId && (
        <div className="p-4 border border-amber-500/50 bg-amber-500/10 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Run a crawl to generate Module E results.
          </p>
        </div>
      )}

      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
          <p className="text-sm text-destructive">
            {((error as any)?.data?.error ?? (error as any)?.message ?? 'Failed to load Module E results')}
          </p>
        </div>
      )}

      {!isLoading && !result && !error && jobId && (
        <div className="p-6 border border-dashed border-border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            No Module E data found yet. It runs after crawl completion.
          </p>
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={cn('rounded-xl border p-6', scoreBg(consistencyScore))}>
            <div className="flex items-center gap-2 mb-4">
              <Gauge className="w-4 h-4 text-foreground" />
              <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">Content Consistency</h4>
            </div>
            <div className="mb-4">
              <div>
                <div className={cn('text-5xl font-bold', scoreColor(consistencyScore))}>{consistencyScore}</div>
                <p className="text-xs text-muted-foreground mb-3">Score out of 100</p>
                <div className="text-xs text-muted-foreground">Mandate Precision Batch Avg</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {mandateChips.length === 0 && (
                <Badge variant="outline">No mandate extracted</Badge>
              )}
              {mandateChips.map((chip) => (
                <Badge key={chip.label} variant="secondary" className="text-xs">
                  {chip.label}: {chip.value}
                </Badge>
              ))}
            </div>
          </div>

          <div className={cn('rounded-xl border p-6', scoreBg(entityScore))}>
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-foreground" />
              <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">Entity Coverage</h4>
            </div>
            <div className="flex items-end gap-4 mb-4">
              <div>
                <div className={cn('text-5xl font-bold', scoreColor(entityScore))}>{entityScore}</div>
                <p className="text-xs text-muted-foreground">Score out of 100</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Missing entities</div>
              {missing.length === 0 ? (
                <Badge variant="outline">None missing</Badge>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {showAllMissing
                    ? missing.map((item) => (
                        <Badge key={item} variant="destructive" className="text-xs">
                          {item}
                        </Badge>
                      ))
                    : missing.slice(0, 8).map((item) => (
                        <Badge key={item} variant="destructive" className="text-xs">
                          {item}
                        </Badge>
                      ))}
                  {missing.length > 8 && (
                    <Button
                      onClick={() => setShowAllMissing(!showAllMissing)}
                      size="sm"
                      variant="outline"
                      className="h-5 text-xs px-2 cursor-pointer"
                    >
                      {showAllMissing ? 'Show less' : `+${missing.length - 8} more`}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
