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

function ChatGPTLogo(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 509.639"
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
      imageRendering="optimizeQuality"
      fillRule="evenodd"
      clipRule="evenodd"
      {...props}
    >
      <path
        fill="#fff"
        d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.613-115.613 115.613H115.612C52.026 509.64 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z"
      />
      <path
        fillRule="nonzero"
        d="M412.037 221.764a90.834 90.834 0 004.648-28.67 90.79 90.79 0 00-12.443-45.87c-16.37-28.496-46.738-46.089-79.605-46.089-6.466 0-12.943.683-19.264 2.04a90.765 90.765 0 00-67.881-30.515h-.576c-.059.002-.149.002-.216.002-39.807 0-75.108 25.686-87.346 63.554-25.626 5.239-47.748 21.31-60.682 44.03a91.873 91.873 0 00-12.407 46.077 91.833 91.833 0 0023.694 61.553 90.802 90.802 0 00-4.649 28.67 90.804 90.804 0 0012.442 45.87c16.369 28.504 46.74 46.087 79.61 46.087a91.81 91.81 0 0019.253-2.04 90.783 90.783 0 0067.887 30.516h.576l.234-.001c39.829 0 75.119-25.686 87.357-63.588 25.626-5.242 47.748-21.312 60.682-44.033a91.718 91.718 0 0012.383-46.035 91.83 91.83 0 00-23.693-61.553l-.004-.005zM275.102 413.161h-.094a68.146 68.146 0 01-43.611-15.8 56.936 56.936 0 002.155-1.221l72.54-41.901a11.799 11.799 0 005.962-10.251V241.651l30.661 17.704c.326.163.55.479.596.84v84.693c-.042 37.653-30.554 68.198-68.21 68.273h.001zm-146.689-62.649a68.128 68.128 0 01-9.152-34.085c0-3.904.341-7.817 1.005-11.663.539.323 1.48.897 2.155 1.285l72.54 41.901a11.832 11.832 0 0011.918-.002l88.563-51.137v35.408a1.1 1.1 0 01-.438.94l-73.33 42.339a68.43 68.43 0 01-34.11 9.12 68.359 68.359 0 01-59.15-34.11l-.001.004zm-19.083-158.36a68.044 68.044 0 0135.538-29.934c0 .625-.036 1.731-.036 2.5v83.801l-.001.07a11.79 11.79 0 005.954 10.242l88.564 51.13-30.661 17.704a1.096 1.096 0 01-1.034.093l-73.337-42.375a68.36 68.36 0 01-34.095-59.143 68.412 68.412 0 019.112-34.085l-.004-.003zm251.907 58.621l-88.563-51.137 30.661-17.697a1.097 1.097 0 011.034-.094l73.337 42.339c21.109 12.195 34.132 34.746 34.132 59.132 0 28.604-17.849 54.199-44.686 64.078v-86.308c.004-.032.004-.065.004-.096 0-4.219-2.261-8.119-5.919-10.217zm30.518-45.93c-.539-.331-1.48-.898-2.155-1.286l-72.54-41.901a11.842 11.842 0 00-5.958-1.611c-2.092 0-4.15.558-5.957 1.611l-88.564 51.137v-35.408l-.001-.061a1.1 1.1 0 01.44-.88l73.33-42.303a68.301 68.301 0 0134.108-9.129c37.704 0 68.281 30.577 68.281 68.281a68.69 68.69 0 01-.984 11.545v.005zm-191.843 63.109l-30.668-17.704a1.09 1.09 0 01-.596-.84v-84.692c.016-37.685 30.593-68.236 68.281-68.236a68.332 68.332 0 0143.689 15.804 63.09 63.09 0 00-2.155 1.222l-72.54 41.9a11.794 11.794 0 00-5.961 10.248v.068l-.05 102.23zm16.655-35.91l39.445-22.782 39.444 22.767v45.55l-39.444 22.767-39.445-22.767v-45.535z"
      />
    </svg>
  )
}

function GeminiLogo(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      {...props}
    >
      <defs>
        <linearGradient id="geminiGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00c6ff" />
          <stop offset="100%" stopColor="#7b2ff7" />
        </linearGradient>
      </defs>
      <rect
        x="4"
        y="8"
        width="56"
        height="48"
        rx="14"
        fill="#020617"
      />
      <rect
        x="10"
        y="16"
        width="44"
        height="4"
        rx="2"
        fill="url(#geminiGradient)"
      />
      <rect
        x="10"
        y="44"
        width="44"
        height="4"
        rx="2"
        fill="url(#geminiGradient)"
      />
      <rect
        x="18"
        y="20"
        width="6"
        height="24"
        rx="3"
        fill="url(#geminiGradient)"
      />
      <rect
        x="40"
        y="20"
        width="6"
        height="24"
        rx="3"
        fill="url(#geminiGradient)"
      />
    </svg>
  )
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
  const masterAnalysis = (result as any)?.master_analysis
  const masterModels = masterAnalysis?.models ?? []

  const getModelMeta = (modelId: string) => {
    if (modelId.startsWith('gpt-')) {
      return {
        label: 'ChatGPT',
        short: 'GPT',
        colorClass: 'bg-emerald-500 text-emerald-950',
      }
    }
    if (modelId.startsWith('gemini')) {
      return {
        label: 'Gemini',
        short: 'G',
        colorClass: 'bg-sky-500 text-sky-950',
      }
    }
    return {
      label: modelId,
      short: modelId.slice(0, 2).toUpperCase(),
      colorClass: 'bg-slate-500 text-slate-950',
    }
  }

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
        <>
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
                </div>
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

          {masterModels.length > 0 && (
            <div className="mt-6 border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                  Model-wise Performance
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Model</th>
                      <th className="text-right py-2 px-4 font-medium text-muted-foreground">Accuracy</th>
                      <th className="text-right py-2 px-4 font-medium text-muted-foreground">Consistency</th>
                      <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Performance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masterModels.map((m: any) => {
                      const meta = getModelMeta(m.model)
                      const isChatGpt = meta.label === 'ChatGPT'
                      const isGemini = meta.label === 'Gemini'
                      return (
                        <tr key={m.model} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-4">
                            {isChatGpt ? (
                              <div className="flex items-center">
                                <ChatGPTLogo className="h-7 w-7" />
                              </div>
                            ) : isGemini ? (
                              <div className="flex items-center">
                                <GeminiLogo className="h-7 w-7" />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold',
                                    meta.colorClass,
                                  )}
                                >
                                  {meta.short}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium text-foreground">{meta.label}</span>
                                  <span className="text-[10px] text-muted-foreground">{m.model}</span>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-4 text-right">{m.accuracy_of_generated_response}</td>
                          <td className="py-2 px-4 text-right">{m.content_consistency?.score ?? 0}</td>
                          <td className="py-2 pl-4 text-right font-semibold">
                            {m.model_wise_performance_score}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
