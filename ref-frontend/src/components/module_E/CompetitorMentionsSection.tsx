'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, MessageSquare, Play, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { useRunCompetitorAnalysisMutation, useRunAiSovAnalysisMutation, useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'

const WEB_MENTION_FIELD_DESCRIPTIONS: Record<string, string> = {
    Competitor: 'The competitor we found mentions for (domain or brand name).',
    Mentions: 'How many times this competitor was mentioned.',
    Sentiment: 'The overall tone of those mentions (positive, neutral, or negative).',
    '12M Trend': 'How mentions changed over the last 12 months.',
}

const AI_SOV_FIELD_DESCRIPTIONS: Record<string, string> = {
    Model: 'Which AI model we checked (ChatGPT, Gemini, Claude).',
    'SOV %': 'Your share of voice in this model — higher means your brand is mentioned more than competitors.',
    'Brand mentions': 'How many times the model mentioned your brand.',
    'Competitor mentions': 'How many times the model mentioned competitors (total).',
    'Brand known': 'Whether the model seems to recognize your brand without being explicitly told.',
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
}

export default function CompetitorMentionsSection({ jobId, mentionsData: initialMentionsData }: CompetitorMentionsProps) {
    const [isPolling, setIsPolling] = useState(false)
    const [pollCount, setPollCount] = useState(0)
    const [justCompleted, setJustCompleted] = useState(false)
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | undefined>(undefined)

    const [runCompetitorAnalysis, { isLoading: isTriggering }] = useRunCompetitorAnalysisMutation()

    const { data: polledData } = useGetModuleEResultQuery(jobId ?? '', {
        skip: !jobId,
        pollingInterval: isPolling ? 5000 : 0,
        refetchOnMountOrArgChange: true,
    })

    const mentionsData = polledData?.data?.competitor_mentions ?? initialMentionsData
    // Use updatedAt (not createdAt) — createdAt is $setOnInsert only, never changes on re-runs
    const updatedAt = polledData?.data?.updatedAt

    // Stop polling when new data arrives (detect via updatedAt change)
    useEffect(() => {
        if (!isPolling) return
        if (updatedAt && updatedAt !== lastUpdatedAt && mentionsData) {
            setIsPolling(false)
            setPollCount(0)
            setLastUpdatedAt(updatedAt)
            setJustCompleted(true)
            setTimeout(() => setJustCompleted(false), 4000)
        }
    }, [isPolling, updatedAt, lastUpdatedAt, mentionsData])

    // Safety: stop polling after 3 minutes
    useEffect(() => {
        if (isPolling && pollCount > 36) {
            setIsPolling(false)
            setPollCount(0)
        }
    }, [isPolling, pollCount])

    useEffect(() => {
        if (isPolling) {
            const id = setInterval(() => setPollCount(c => c + 1), 5000)
            return () => clearInterval(id)
        }
    }, [isPolling])

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

    const isRunning = isTriggering || isPolling

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
            ) : mentionsData ? (
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
    if (!mentionsData) {
        return (
            <AnalysisEmptyState
                icon={<Users className="w-8 h-8 text-zinc-400" />}
                title="No Competitor Mentions Data"
                description="No competitor data yet. Click Run Analysis to fetch competitor mentions."
                onRunAnalysis={handleRunAnalysis}
                isAnalyzing={isRunning}
                buttonLabel="Run Analysis"
            />
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">Competitor Mentions</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
                        Track which competitors are appearing in AI and web conversations, how often they are mentioned, and the tone around them.
                        Use this section to benchmark your competitive presence and monitor momentum shifts over time.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {/* Mentions Table Card */}
                <div className="rounded-2xl border border-zinc-800 bg-zinc-800/50 overflow-hidden">
                    <div className="p-4 border-b border-zinc-800 bg-zinc-800/50 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-semibold">Web Mention Trends</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="border-b bg-background/50 text-muted-foreground">
                                    {(['Competitor', 'Mentions', 'Sentiment', '12M Trend'] as const).map((h) => (
                                        <th key={h} className="p-3 font-medium">
                                            <div className="flex items-center gap-1">
                                                <span>{h}</span>
                                                <FieldTooltip description={WEB_MENTION_FIELD_DESCRIPTIONS[h] ?? ''} />
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {(mentionsData?.data?.length ?? 0) > 1 ? (
                                    mentionsData?.data
                                        // Hide the brand's own domain row — it's used for SOV % but not shown as a competitor
                                        ?.filter((_, i) => i !== 0)
                                        .map((item, i) => (
                                            <tr key={i} className="hover:bg-zinc-800/50 transition-colors">
                                                <td className="p-3 border-r font-medium text-foreground truncate max-w-30">{item.name}</td>
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
                </div>
            </div>
        </div>
    )
}

interface ShareOfVoiceSectionProps {
    jobId?: string
}

export function ShareOfVoiceSection({ jobId }: ShareOfVoiceSectionProps) {
    const [isPolling, setIsPolling] = useState(false)
    const [pollCount, setPollCount] = useState(0)
    const [justCompleted, setJustCompleted] = useState(false)
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | undefined>(undefined)

    const [runCompetitorAnalysis, { isLoading: isCompetitorTriggering }] = useRunCompetitorAnalysisMutation()
    const [runAiSovAnalysis, { isLoading: isAiSovTriggering }] = useRunAiSovAnalysisMutation()

    const { data } = useGetModuleEResultQuery(jobId ?? '', {
        skip: !jobId,
        pollingInterval: isPolling ? 5000 : 0,
        refetchOnMountOrArgChange: true,
    })

    const aiSov = data?.data?.ai_share_of_voice
    const competitorRows = data?.data?.competitor_mentions?.data ?? []
    const updatedAt = data?.data?.updatedAt

    useEffect(() => {
        if (!isPolling) return
        if (updatedAt && updatedAt !== lastUpdatedAt && aiSov) {
            setIsPolling(false)
            setPollCount(0)
            setLastUpdatedAt(updatedAt)
            setJustCompleted(true)
            setTimeout(() => setJustCompleted(false), 4000)
        }
    }, [isPolling, updatedAt, lastUpdatedAt, aiSov])

    useEffect(() => {
        if (isPolling && pollCount > 36) {
            setIsPolling(false)
            setPollCount(0)
        }
    }, [isPolling, pollCount])

    useEffect(() => {
        if (isPolling) {
            const id = setInterval(() => setPollCount(c => c + 1), 5000)
            return () => clearInterval(id)
        }
    }, [isPolling])

    const handleRunAnalysis = useCallback(async () => {
        if (!jobId) return
        try {
            setLastUpdatedAt(updatedAt)
            if (competitorRows && competitorRows.length > 0) {
                await runAiSovAnalysis(jobId).unwrap()
            } else {
                await runCompetitorAnalysis(jobId).unwrap()
            }
            setIsPolling(true)
            setPollCount(0)
        } catch (e) {
            console.error('AI SOV analysis failed:', e)
        }
    }, [jobId, updatedAt, competitorRows, runAiSovAnalysis, runCompetitorAnalysis])

    const isRunning = isCompetitorTriggering || isAiSovTriggering || isPolling

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
            {isCompetitorTriggering || isAiSovTriggering ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Queuing…</>
            ) : isPolling ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
            ) : justCompleted ? (
                <><CheckCircle2 className="w-4 h-4" /> Done!</>
            ) : aiSov ? (
                <><RefreshCw className="w-4 h-4" /> Re-run Analysis</>
            ) : (
                <><Play className="w-4 h-4" /> Run Analysis</>
            )}
        </Button>
    )

    if (!aiSov) {
        return (
            <AnalysisEmptyState
                icon={<Users className="w-8 h-8 text-zinc-400" />}
                title="No AI Share of Voice Data"
                description="No AI Share of Voice data yet. Click Run Analysis to calculate it across OpenAI, Gemini, and Claude."
                onRunAnalysis={handleRunAnalysis}
                isAnalyzing={isRunning}
                buttonLabel="Run Analysis"
            />
        )
    }

    const overallSov = aiSov.overall_sov ?? 0
    const byModelEntries = Object.entries(aiSov.by_model ?? {})
    const visibilityTier = aiSov.visibility_tier ?? (overallSov === 0 ? 'Not yet AI-indexed' : 'Emerging')
    const brandKnownBy: string[] = aiSov.brand_known_by_models ?? []

    const tierColor: Record<string, string> = {
        'Not yet AI-indexed': 'bg-zinc-800 text-zinc-400 border-zinc-800',
        'Minimally Indexed': 'bg-blue-500/15 text-blue-400 border-blue-500/20',
        'Emerging': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
        'Recognized': 'bg-green-500/15 text-green-400 border-green-500/20',
        'Established': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    }
    const tierClass = tierColor[visibilityTier] ?? 'bg-zinc-800 text-zinc-400 border-zinc-800'

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">AI Share of Voice</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
                        Compare your brand's mention share against competitors across OpenAI, Gemini, and Claude.
                        Use this section to evaluate discoverability, identify model gaps, and track progress in unprompted brand recognition.
                    </p>
                </div>
            </div>

            {isRunning && (
                <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-4 py-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>
                        Updating AI Share of Voice. This queries OpenAI, Gemini, and Claude.
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-800/50 p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-muted-foreground">Overall AI SOV</span>
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                            All models
                        </Badge>
                    </div>
                    <div className="mt-2">
                        <div className="text-4xl font-bold text-foreground">
                            {overallSov.toFixed(1)}%
                        </div>
                        <span className={cn('inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded border', tierClass)}>
                            {visibilityTier}
                        </span>
                        {brandKnownBy.length > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Recognized by: {brandKnownBy.join(', ')}
                            </p>
                        )}
                        {overallSov === 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Brand not yet mentioned unprompted by AI models.
                            </p>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-800/50 p-4 md:col-span-2">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-muted-foreground">By Model</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="border-b bg-zinc-800/50 text-zinc-400">
                                    {([
                                        { key: 'Model', align: 'text-left' },
                                        { key: 'SOV %', align: 'text-right' },
                                        { key: 'Brand mentions', align: 'text-right' },
                                        { key: 'Competitor mentions', align: 'text-right' },
                                        { key: 'Brand known', align: 'text-right' },
                                    ] as const).map((col) => (
                                        <th key={col.key} className={cn('p-2 font-medium', col.align)}>
                                            <div className={cn('flex items-center gap-1', col.align === 'text-right' ? 'justify-end' : 'justify-start')}>
                                                <span>{col.key}</span>
                                                <FieldTooltip description={AI_SOV_FIELD_DESCRIPTIONS[col.key] ?? ''} />
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {byModelEntries.map(([model, stats]) => {
                                    const s = stats as any
                                    const sov = s.sov ?? 0
                                    const brandMentions = s.brand_mentions ?? 0
                                    const competitorMentions = s.competitor_mentions ?? 0
                                    const brandKnown = s.brand_known === true
                                    return (
                                        <tr key={model} className="hover:bg-zinc-800/50 transition-colors">
                                            <td className="p-2 font-medium text-foreground capitalize">{model}</td>
                                            <td className="p-2 text-right font-mono">{sov.toFixed(1)}%</td>
                                            <td className="p-2 text-right font-mono">{brandMentions}</td>
                                            <td className="p-2 text-right font-mono">{competitorMentions}</td>
                                            <td className="p-2 text-right">
                                                <span className={cn(
                                                    'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                                                    brandKnown
                                                        ? 'bg-green-500/15 text-green-400 border-green-500/20'
                                                        : 'bg-zinc-800 text-zinc-400 border-zinc-800'
                                                )}>
                                                    {brandKnown ? 'Yes' : 'No'}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
