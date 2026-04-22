'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, Shield, Globe, Loader2, RefreshCw, CheckCircle2, Target, AlertCircle } from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { useRunCompetitorAnalysisMutation, useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'

const COMPETITOR_LANDSCAPE_SECTION_DESCRIPTION =
    'Evaluate your authority, backlink strength, and domain diversity against the competitive market. Use this section to identify structural SEO gaps and prioritize off-page actions that improve AI and search visibility.'

interface CompetitorLandscapeProps {
    jobId?: string
    landscapeData?: {
        score: number
        total_referring_domains: number
        total_backlinks: number
        domain_quality: number
        diversity_score: number
        spam_score: number
        top_referring_domains: Array<{ name: string; count: number }>
        recommendations: string[]
    }
}

export default function CompetitorLandscapeSection({ jobId, landscapeData: initialData }: CompetitorLandscapeProps) {
    const [isPolling, setIsPolling] = useState(false)
    const [justCompleted, setJustCompleted] = useState(false)

    const [runCompetitorAnalysis, { isLoading: isTriggering }] = useRunCompetitorAnalysisMutation()

    const { data: polledData } = useGetModuleEResultQuery(jobId ?? '', {
        skip: !jobId,
        pollingInterval: isPolling ? 5000 : 0,
        refetchOnMountOrArgChange: true,
    })

    // Use live data if available
    const landscapeData = polledData?.data?.competitor_landscape ?? initialData

    useEffect(() => {
        if (!isPolling) return
        if (polledData?.data?.competitor_landscape) {
            setIsPolling(false)
            setJustCompleted(true)
            setTimeout(() => setJustCompleted(false), 4000)
        }
    }, [isPolling, polledData])

    const handleRunAnalysis = useCallback(async () => {
        if (!jobId) return
        try {
            await runCompetitorAnalysis(jobId).unwrap()
            setIsPolling(true)
            setJustCompleted(false)
        } catch (err) {
            console.error('Failed to trigger competitor analysis:', err)
        }
    }, [jobId, runCompetitorAnalysis])

    const isRunning = isTriggering || isPolling

    if (!landscapeData) {
        return (
            <AnalysisEmptyState
                icon={<Target className="w-8 h-8 text-(--nd-text-muted)" />}
                title="Competitor Landscape"
                description="Analyze your domain authority and backlink profile relative to the market."
                onRunAnalysis={handleRunAnalysis}
                isAnalyzing={isRunning}
                buttonLabel="Run Landscape Analysis"
            />
        )
    }

    const getScoreColor = (score: number) => {
        if (score >= 70) return 'text-emerald-400'
        if (score >= 40) return 'text-yellow-400'
        return 'text-rose-400'
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">Competitor Landscape</h3>
                        <FieldTooltip description={COMPETITOR_LANDSCAPE_SECTION_DESCRIPTION} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Score Card */}
                <Card className="p-6 flex flex-col items-center justify-center space-y-4">
                    <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Authority Score</div>
                    <div className="relative flex items-center justify-center">
                        <svg className="w-32 h-32 transform -rotate-90">
                            <circle
                                cx="64"
                                cy="64"
                                r="58"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                className="text-muted/20"
                            />
                            <circle
                                cx="64"
                                cy="64"
                                r="58"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                strokeDasharray={364.4}
                                strokeDashoffset={364.4 - (364.4 * (landscapeData.score ?? 0)) / 100}
                                className={cn("transition-all duration-1000", getScoreColor(landscapeData.score ?? 0))}
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className={cn("text-4xl font-bold", getScoreColor(landscapeData.score ?? 0))}>
                                {Math.round(landscapeData.score ?? 0)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">/ 100</span>
                        </div>
                    </div>
                    <Badge variant="outline" className={cn("font-bold", getScoreColor(landscapeData.score ?? 0))}>
                        {(landscapeData.score ?? 0) >= 70 ? 'High Authority' : (landscapeData.score ?? 0) >= 40 ? 'Moderate' : 'Low Authority'}
                    </Badge>
                </Card>

                {/* Core Metrics */}
                <Card className="p-6 grid grid-cols-2 gap-6 lg:col-span-2">
                    {[
                        { label: 'Ref. Domains', value: (landscapeData.total_referring_domains ?? 0).toLocaleString(), icon: Globe, color: 'text-blue-400' },
                        { label: 'Total Backlinks', value: (landscapeData.total_backlinks ?? 0).toLocaleString(), icon: TrendingUp, color: 'text-indigo-400' },
                        { label: 'Domain Quality', value: `${landscapeData.domain_quality ?? 0}/100`, icon: Shield, color: 'text-emerald-400' },
                        { label: 'Diversity', value: `${landscapeData.diversity_score ?? 0}/20`, icon: Target, color: 'text-orange-400' },
                    ].map((m, i) => (
                        <div key={i} className="space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <m.icon className={cn("w-4 h-4", m.color)} />
                                <span className="text-xs font-medium">{m.label}</span>
                            </div>
                            <div className="text-2xl font-bold text-foreground">{m.value}</div>
                        </div>
                    ))}

                    <div className="col-span-2 pt-2 border-t border-border/50">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Top Referring Competitors</h4>
                        <div className="space-y-2">
                            {(landscapeData.top_referring_domains ?? []).map((comp, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="text-foreground/80 font-medium truncate max-w-50">{comp.name}</span>
                                    <span className="text-muted-foreground font-mono">{(comp.count ?? 0).toLocaleString()} domains</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Recommendations */}
            <Card className="p-5 bg-primary/5 border-primary/10">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                    <AlertCircle className="w-4 h-4 text-primary" />
                    Strategic Recommendations
                </h4>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                    {(landscapeData.recommendations ?? []).map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground italic">
                            <span className="text-primary mt-1">•</span>
                            <span>{rec}</span>
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    )
}
