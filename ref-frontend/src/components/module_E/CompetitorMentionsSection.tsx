'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Brain, Users, MessageSquare, PieChart, Play, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRunCompetitorAnalysisMutation, useRunAiSovAnalysisMutation, useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'

interface SovSnapshot {
    date: string
    overall_sov: number
    by_model: Record<string, { sov: number; brand_mentions: number; competitor_mentions: number }>
}

interface CompetitorMentionsProps {
    jobId?: string
    mentionsData?: {
        overall_sov: number
        data: Array<{
            name: string
            mentions: number
            sentiment: string
            trend: number[]
        }>
    }
    aiSovData?: {
        overall_sov: number
        by_model: Record<
            string,
            {
                sov: number
                brand_mentions: number
                competitor_mentions: number
            }
        >
    }
    aiSovHistory?: SovSnapshot[]
}

export default function CompetitorMentionsSection({ jobId, mentionsData: initialMentionsData, aiSovData: initialAiSovData, aiSovHistory: initialAiSovHistory }: CompetitorMentionsProps) {
    const [isPolling, setIsPolling] = useState(false)
    const [pollCount, setPollCount] = useState(0)
    const [justCompleted, setJustCompleted] = useState(false)
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | undefined>(undefined)

    const [runCompetitorAnalysis, { isLoading: isTriggering }] = useRunCompetitorAnalysisMutation()
    const [runAiSovAnalysis, { isLoading: isAiSovTriggering }] = useRunAiSovAnalysisMutation()

    // Separate polling state for AI SOV-only re-runs
    const [isAiSovPolling, setIsAiSovPolling] = useState(false)
    const [aiSovPollCount, setAiSovPollCount] = useState(0)
    const [aiSovJustCompleted, setAiSovJustCompleted] = useState(false)

    const { data: polledData } = useGetModuleEResultQuery(jobId ?? '', {
        skip: !jobId,
        pollingInterval: isPolling ? 5000 : 0,
        refetchOnMountOrArgChange: true,
    })

    const mentionsData = polledData?.data?.competitor_mentions ?? initialMentionsData
    const aiSovData = polledData?.data?.ai_share_of_voice ?? initialAiSovData
    const aiSovHistory: SovSnapshot[] = polledData?.data?.ai_sov_history ?? initialAiSovHistory ?? []
    // Use updatedAt (not createdAt) — createdAt is $setOnInsert only, never changes on re-runs
    const updatedAt = polledData?.data?.updatedAt

    // Stop polling when new data arrives (detect via updatedAt change)
    useEffect(() => {
        if (!isPolling) return
        if (updatedAt && updatedAt !== lastUpdatedAt && (mentionsData || aiSovData)) {
            setIsPolling(false)
            setPollCount(0)
            setLastUpdatedAt(updatedAt)
            setJustCompleted(true)
            setTimeout(() => setJustCompleted(false), 4000)
        }
    }, [isPolling, updatedAt, lastUpdatedAt, mentionsData, aiSovData])

    // AI SOV polling: stop when updatedAt changes after triggering
    useEffect(() => {
        if (!isAiSovPolling) return
        if (updatedAt && updatedAt !== lastUpdatedAt && aiSovData) {
            setIsAiSovPolling(false)
            setAiSovPollCount(0)
            setLastUpdatedAt(updatedAt)
            setAiSovJustCompleted(true)
            setTimeout(() => setAiSovJustCompleted(false), 4000)
        }
    }, [isAiSovPolling, updatedAt, lastUpdatedAt, aiSovData])

    // Safety: stop polling after 3 minutes
    useEffect(() => {
        if (isPolling && pollCount > 36) {
            setIsPolling(false)
            setPollCount(0)
        }
        if (isAiSovPolling && aiSovPollCount > 36) {
            setIsAiSovPolling(false)
            setAiSovPollCount(0)
        }
    }, [isPolling, pollCount, isAiSovPolling, aiSovPollCount])

    useEffect(() => {
        if (isPolling) {
            const id = setInterval(() => setPollCount(c => c + 1), 5000)
            return () => clearInterval(id)
        }
    }, [isPolling])

    useEffect(() => {
        if (isAiSovPolling) {
            const id = setInterval(() => setAiSovPollCount(c => c + 1), 5000)
            return () => clearInterval(id)
        }
    }, [isAiSovPolling])

    const handleRunAnalysis = useCallback(async () => {
        if (!jobId) return
        try {
            setLastUpdatedAt(updatedAt)
            await runCompetitorAnalysis(jobId).unwrap()
            setIsPolling(true)
            setPollCount(0)
        } catch (e) {
            console.error('Competitor analysis failed:', e)
        }
    }, [jobId, updatedAt, runCompetitorAnalysis])

    const handleRunAiSov = useCallback(async () => {
        if (!jobId) return
        try {
            setLastUpdatedAt(updatedAt)
            await runAiSovAnalysis(jobId).unwrap()
            setIsAiSovPolling(true)
            setAiSovPollCount(0)
        } catch (e) {
            console.error('AI SOV analysis failed:', e)
        }
    }, [jobId, updatedAt, runAiSovAnalysis])

    const isRunning = isTriggering || isPolling
    const isAiSovRunning = isAiSovTriggering || isAiSovPolling

    const RunButton = (
        <Button
            size="sm"
            onClick={handleRunAnalysis}
            disabled={isRunning}
            className={cn(
                'gap-2 font-semibold transition-all',
                justCompleted
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            )}
        >
            {isTriggering ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Queuing…</>
            ) : isPolling ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
            ) : justCompleted ? (
                <><CheckCircle2 className="w-4 h-4" /> Done!</>
            ) : (mentionsData || aiSovData) ? (
                <><RefreshCw className="w-4 h-4" /> Re-run Analysis</>
            ) : (
                <><Play className="w-4 h-4" /> Run Analysis</>
            )}
        </Button>
    )

    const getSentimentVariant = (sentiment: string) => {
        switch (sentiment.toLowerCase()) {
            case 'positive': return 'default'
            case 'negative': return 'destructive'
            default: return 'secondary'
        }
    }

    const renderSparkline = (trend: number[]) => {
        if (!trend || trend.length === 0) return null
        const max = Math.max(...trend) || 1
        const W = 100
        const H = 24
        const step = W / (trend.length - 1)
        const points = trend.map((v, i) => `${i * step},${H - (v / max) * H}`).join(' ')

        return (
            <svg width={W} height={H} className="text-primary truncate overflow-visible">
                <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    points={points}
                />
            </svg>
        )
    }

    // Empty state
    if (!mentionsData && !aiSovData) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">Competitor Mentions &amp; AI SOV</h3>
                    </div>
                    {RunButton}
                </div>
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                    {isPolling
                        ? 'Fetching competitor mentions and AI Share of Voice data…'
                        : <>No competitor data yet. Click <span className="font-semibold text-foreground">Run Analysis</span> to fetch competitor mentions and AI Share of Voice.</>
                    }
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">Competitor Mentions &amp; AI SOV</h3>
                </div>
                {RunButton}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Mentions Table Card */}
                <Card className="p-0 overflow-hidden border">
                    <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-semibold">Web Mention Trends</span>
                        </div>
                        <div className="text-xs font-mono text-muted-foreground uppercase">
                            Brand SOV: <span className="text-primary font-bold">{mentionsData?.overall_sov ?? 0}%</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="border-b bg-background/50 text-muted-foreground">
                                    <th className="p-3 font-medium">Competitor</th>
                                    <th className="p-3 font-medium">Mentions</th>
                                    <th className="p-3 font-medium">Sentiment</th>
                                    <th className="p-3 font-medium">12M Trend</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {(mentionsData?.data?.length ?? 0) > 1 ? (
                                    mentionsData?.data
                                        // Hide the brand's own domain row — it's used for SOV % but not shown as a competitor
                                        ?.filter((_, i) => i !== 0)
                                        .map((item, i) => (
                                            <tr key={i} className="hover:bg-muted/30 transition-colors">
                                                <td className="p-3 border-r font-medium text-foreground truncate max-w-[120px]">{item.name}</td>
                                                <td className="p-3 border-r font-mono">{(item.mentions ?? 0).toLocaleString()}</td>
                                                <td className="p-3 border-r">
                                                    <Badge variant={getSentimentVariant(item.sentiment ?? 'neutral')} className="text-[10px] px-1.5 py-0">
                                                        {item.sentiment}
                                                    </Badge>
                                                </td>
                                                <td className="p-3">{renderSparkline(item.trend)}</td>
                                            </tr>
                                        ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <Users className="w-8 h-8 opacity-20" />
                                                <p className="text-sm font-medium">No competitors found</p>
                                                <p className="text-xs opacity-70">
                                                    DataForSEO found no direct competitors for this brand.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {/* AI SOV Card */}
                <Card className="p-5 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Brain className="w-5 h-5 text-purple-400" />
                            <span className="text-sm font-semibold">AI Share of Voice</span>
                        </div>
                        {/* Re-run AI SOV button — only LLM queries, no DataForSEO */}
                        {aiSovData && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleRunAiSov}
                                disabled={isAiSovRunning || isRunning}
                                className={cn(
                                    'gap-1.5 text-xs font-semibold h-7 px-2.5 transition-all',
                                    aiSovJustCompleted
                                        ? 'border-emerald-500 text-emerald-400 hover:bg-emerald-500/10'
                                        : 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10'
                                )}
                            >
                                {isAiSovTriggering ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> Queuing…</>
                                ) : isAiSovPolling ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> Running…</>
                                ) : aiSovJustCompleted ? (
                                    <><CheckCircle2 className="w-3 h-3" /> Updated!</>
                                ) : (
                                    <><RefreshCw className="w-3 h-3" /> Re-run AI SOV</>
                                )}
                            </Button>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex-1 space-y-1">
                            <div className="text-3xl font-bold text-foreground">{aiSovData?.overall_sov ?? 0}%</div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Overall AI SOV</p>
                        </div>
                        <PieChart className="w-10 h-10 text-purple-400/30" />
                    </div>

                    <div className="space-y-4 pt-4 border-t border-border/50">
                        {Object.entries(aiSovData?.by_model ?? {}).map(([model, data], i) => (
                            <div key={i} className="space-y-1.5">
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="font-bold uppercase tracking-wider text-muted-foreground">{model}</span>
                                    <span className="font-mono text-foreground font-bold">{data.sov}%</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
                                    <div
                                        className="h-full bg-purple-500 transition-all duration-1000"
                                        style={{ width: `${data.sov}%` }}
                                    />
                                    <div
                                        className="h-full bg-muted-foreground/20 transition-all duration-1000"
                                        style={{ width: `${100 - data.sov}%` }}
                                    />
                                </div>
                                <div className="text-[9px] text-muted-foreground flex justify-between">
                                    <span>Mentions: {data.brand_mentions}</span>
                                    <span>Competitors: {data.competitor_mentions}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* AI SOV Trend over time — shown once 2+ historical runs exist */}
                    {aiSovHistory.length >= 2 && (() => {
                        const W = 220, H = 40
                        const vals = aiSovHistory.map(s => s.overall_sov)
                        const max = Math.max(...vals, 1)
                        const step = W / (vals.length - 1)
                        const pts = vals.map((v, i) => `${i * step},${H - (v / max) * H}`).join(' ')
                        return (
                            <div className="pt-3 border-t border-border/50">
                                <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-1.5">
                                    <span className="uppercase tracking-wider font-semibold">SOV Trend</span>
                                    <span className="font-mono">{aiSovHistory[0].date} → {aiSovHistory[aiSovHistory.length - 1].date}</span>
                                </div>
                                <svg width={W} height={H + 4} viewBox={`0 0 ${W} ${H + 4}`} className="text-purple-400 w-full overflow-visible">
                                    <defs>
                                        <linearGradient id="sovGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
                                            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                                        </linearGradient>
                                    </defs>
                                    {/* gradient fill under line */}
                                    <polygon
                                        fill="url(#sovGrad)"
                                        points={`0,${H} ${pts} ${(vals.length - 1) * step},${H}`}
                                    />
                                    <polyline
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinejoin="round"
                                        points={pts}
                                    />
                                    {vals.map((v, i) => {
                                        const cx = i * step
                                        const cy = H - (v / max) * H
                                        // keep tooltip label inside svg bounds
                                        const labelX = Math.min(Math.max(cx, 20), W - 20)
                                        return (
                                            <g key={i} className="group" style={{ cursor: 'default' }}>
                                                {/* dot — scales up on hover */}
                                                <circle
                                                    cx={cx} cy={cy} r="3"
                                                    fill="currentColor"
                                                    style={{ transformOrigin: `${cx}px ${cy}px`, transition: 'transform 0.15s ease' }}
                                                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.8)')}
                                                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                                                />
                                                {/* large transparent hit area */}
                                                <circle cx={cx} cy={cy} r="10" fill="transparent" />
                                                {/* tooltip — visible on group hover */}
                                                <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                                                    <rect
                                                        x={labelX - 20} y={cy - 28}
                                                        width="40" height="16"
                                                        rx="4"
                                                        fill="hsl(var(--popover, 224 71% 4%))"
                                                        stroke="rgb(168 85 247 / 0.4)"
                                                        strokeWidth="0.75"
                                                    />
                                                    <text
                                                        x={labelX} y={cy - 16}
                                                        textAnchor="middle"
                                                        fontSize="8"
                                                        fontWeight="700"
                                                        fill="rgb(216 180 254)"
                                                        fontFamily="monospace"
                                                    >
                                                        {v}% · {aiSovHistory[i].date.slice(5)}
                                                    </text>
                                                </g>
                                            </g>
                                        )
                                    })}
                                </svg>
                            </div>
                        )
                    })()}
                </Card>
            </div>
        </div>
    )
}
