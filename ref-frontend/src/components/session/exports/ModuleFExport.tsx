'use client'

import { useState } from 'react'
import { Download, ChevronDown, ChevronUp, Swords, FileSpreadsheet, Trophy, Target, Globe, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGetModuleFResultQuery, useGetModuleFTrendsQuery } from '@/store/api/module_F/moduleFApi'
import {
  createWorkbook,
  addSheet,
  downloadWorkbook,
} from '@/utils/excelExport'

interface ModuleFExportProps {
  jobId?: string
  sessionName?: string
}

// ── transform helpers ────────────────────────────────────────────────────────

function transformVisibilityComparison(result: any) {
  const cvc = result?.compare_visibility_against_competitors
  if (!cvc) return []
  const rows: any[] = []
  const allEntities = [
    ...(cvc.brand ? [{ ...cvc.brand, _type: 'Brand' }] : []),
    ...(cvc.competitors ?? []).map((c: any) => ({ ...c, _type: 'Competitor' })),
  ]
  allEntities.forEach((entity) => {
    const baseRow: Record<string, any> = {
      Type: entity._type,
      Name: entity.name || '',
      'Visibility Score': entity.visibility_score ?? 0,
      'Market Share (%)': entity.market_share_percent ?? 0,
      'Total Mentions': entity.mentions_total ?? 0,
      'Mentioned in # Models': entity.mentioned_in_models ?? 0,
      'Avg Rank': entity.avg_rank ?? 'N/A',
      'Avg Rank Percentile': entity.avg_rank_percentile ?? 0,
      'Rank Diff vs Brand': entity.rank_difference_vs_brand ?? 0,
    }
    const perModel = entity.per_model || {}
    Object.entries(perModel).forEach(([model, val]: [string, any]) => {
      baseRow[`${model} Mentions`] = val.mentions ?? 0
      baseRow[`${model} Rank`] = val.rank ?? 'N/A'
      baseRow[`${model} Rank Percentile`] = val.rank_percentile ?? 0
    })
    rows.push(baseRow)
  })
  return rows
}

function transformCompetitorWins(result: any) {
  const wins = result?.competitor_wins
  if (!wins?.detailed_results) return []
  return wins.detailed_results.map((r: any) => ({
    Prompt: r.prompt || '',
    Winner: r.winner || '',
    'Winner Name': r.winner_name || '',
    'Brand Rank': r.brand_rank ?? 'N/A',
    'Coverage Gap Score': r.coverage_gap_score ?? 0,
    'Text Snippet': typeof r.text_snippet === 'string' ? r.text_snippet.slice(0, 200) : '',
  }))
}

function transformGapOpportunities(result: any) {
  const gaps = result?.gap_opportunities ?? []
  const rows: any[] = []
  gaps.forEach((gap: any) => {
    ;(gap.opportunities ?? []).forEach((opp: any) => {
      rows.push({
        Competitor: gap.competitor || '',
        'Gap Score': gap.gapScore ?? 0,
        'Missing Prompts': gap.missingPrompts ?? 0,
        'Potential Gain (%)': gap.potentialGainPercent ?? 0,
        Prompt: opp.prompt || '',
        Rank: opp.rank ?? 'N/A',
        'Opportunity Score': opp.opportunityScore ?? 0,
      })
    })
  })
  return rows
}

function transformSourceAnalysis(result: any) {
  const sa = result?.source_analysis?.competitor_source_analysis ?? []
  const rows: any[] = []
  sa.forEach((comp: any) => {
    ;(comp.top_citations ?? []).forEach((cite: any, i: number) => {
      rows.push({
        Competitor: comp.competitor || '',
        'Source Domain Influence Score': comp.source_domain_influence_score ?? 0,
        'Avg Domain Authority': comp.average_domain_authority ?? 0,
        'Citation Count': comp.citation_count ?? 0,
        [`Top Citation ${i + 1} Domain`]: cite.domain || '',
        [`Top Citation ${i + 1} Authority`]: cite.authority_score ?? 0,
        [`Top Citation ${i + 1} Type`]: cite.citation_type || '',
      })
    })
    if (!comp.top_citations?.length) {
      rows.push({
        Competitor: comp.competitor || '',
        'Source Domain Influence Score': comp.source_domain_influence_score ?? 0,
        'Avg Domain Authority': comp.average_domain_authority ?? 0,
        'Citation Count': comp.citation_count ?? 0,
      })
    }
  })
  return rows
}

function transformGrowthTrends(trends: any) {
  if (!trends?.history) return []
  return trends.history.map((point: any) => {
    const row: Record<string, any> = {
      Date: point.date || '',
      'Job ID': point.jobId || '',
      'Brand Name': point.brand?.name || '',
      'Brand Visibility Score': point.brand?.visibility_score ?? 0,
      'Brand Market Share (%)': point.brand?.market_share_percent ?? 0,
      'Brand Mentions': point.brand?.mentions_total ?? 0,
    }
    ;(point.competitors ?? []).forEach((comp: any, i: number) => {
      row[`Competitor ${i + 1} Name`] = comp.name || ''
      row[`Competitor ${i + 1} Visibility`] = comp.visibility_score ?? 0
      row[`Competitor ${i + 1} Market Share`] = comp.market_share_percent ?? 0
      row[`Competitor ${i + 1} Mentions`] = comp.mentions_total ?? 0
    })
    return row
  })
}

// ────────────────────────────────────────────────────────────────────────────

const EXPORT_OPTIONS = [
  {
    id: 'visibility-comparison',
    label: 'Visibility Comparison',
    description: 'Brand vs competitor visibility scores, market share and per-model rankings.',
    icon: Swords,
    color: 'text-orange-400',
  },
  {
    id: 'competitor-wins',
    label: 'Competitor Wins / Losses',
    description: 'Per-prompt winner analysis and coverage gap scores.',
    icon: Trophy,
    color: 'text-amber-400',
  },
  {
    id: 'gap-opportunities',
    label: 'Gap Opportunities',
    description: 'Competitor gaps with missing prompts and potential gain percentages.',
    icon: Target,
    color: 'text-rose-400',
  },
  {
    id: 'source-analysis',
    label: 'Competitor Cited URLs',
    description: 'Competitor source domain influence and top citation details.',
    icon: Globe,
    color: 'text-blue-400',
  },
  {
    id: 'growth-trends',
    label: 'Growth Trends',
    description: 'Historical visibility, market share and mention trends over time.',
    icon: TrendingUp,
    color: 'text-emerald-400',
  },
  {
    id: 'all',
    label: 'Full Competitor Analysis (All Sheets)',
    description: 'All competitor intelligence in one Excel workbook.',
    icon: FileSpreadsheet,
    color: 'text-indigo-400',
  },
]

export default function ModuleFExport({ jobId, sessionName = 'session' }: ModuleFExportProps) {
  const [expanded, setExpanded] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data: moduleFData, isLoading: isLoadingF } = useGetModuleFResultQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })
  const { data: trendsData, isLoading: isLoadingTrends } = useGetModuleFTrendsQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const result = moduleFData?.data
  const trends = trendsData?.data
  const isLoading = isLoadingF || isLoadingTrends
  const hasData = !!(result || trends)

  const getCount = (id: string): number => {
    if (!result) return 0
    switch (id) {
      case 'visibility-comparison': {
        const cvc = result.compare_visibility_against_competitors
        return (cvc?.brand ? 1 : 0) + (cvc?.competitors?.length ?? 0)
      }
      case 'competitor-wins':
        return result.competitor_wins?.detailed_results?.length ?? 0
      case 'gap-opportunities':
        return (result.gap_opportunities ?? []).reduce(
          (sum: number, g: any) => sum + (g.opportunities?.length ?? 0),
          0
        )
      case 'source-analysis':
        return result.source_analysis?.competitor_source_analysis?.length ?? 0
      case 'growth-trends':
        return trends?.history?.length ?? 0
      default:
        return 0
    }
  }

  const handleDownload = async (optionId: string) => {
    if (!result && !trends) return
    setDownloading(optionId)
    try {
      const wb = createWorkbook()
      const date = new Date().toISOString().split('T')[0]
      const filename = `${sessionName}_module-F_${optionId}_${date}`

      if ((optionId === 'visibility-comparison' || optionId === 'all') && result) {
        addSheet(wb, transformVisibilityComparison(result), 'Visibility Comparison')
      }
      if ((optionId === 'competitor-wins' || optionId === 'all') && result) {
        addSheet(wb, transformCompetitorWins(result), 'Competitor Wins')
      }
      if ((optionId === 'gap-opportunities' || optionId === 'all') && result) {
        addSheet(wb, transformGapOpportunities(result), 'Gap Opportunities')
      }
      if ((optionId === 'source-analysis' || optionId === 'all') && result) {
        addSheet(wb, transformSourceAnalysis(result), 'Competitor Cited URLs')
      }
      if ((optionId === 'growth-trends' || optionId === 'all') && trends) {
        addSheet(wb, transformGrowthTrends(trends), 'Growth Trends')
      }

      downloadWorkbook(wb, filename)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="rounded-2xl border border-(--nd-border) bg-white overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-(--nd-bg) transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
            <Swords className="h-4 w-4 text-orange-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-(--nd-text-primary)">Competitor Intelligence (Module F)</p>
            <p className="text-[11px] text-(--nd-text-muted) mt-0.5">
              Visibility comparison, wins library, gap opportunities, cited URLs, growth trends
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!hasData && !isLoading && (
            <Badge className="bg-(--nd-bg) text-(--nd-text-muted) border-(--nd-border) text-[10px]">No data</Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-(--nd-text-muted)" />
          ) : (
            <ChevronDown className="h-4 w-4 text-(--nd-text-muted)" />
          )}
        </div>
      </button>

      {/* Export options */}
      {expanded && (
        <div className="border-t border-(--nd-border) divide-y divide-(--nd-border)">
          {EXPORT_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const count = getCount(opt.id)
            const isDownloading = downloading === opt.id
            const disabled = isLoading || !hasData || !!downloading

            return (
              <div
                key={opt.id}
                className={`flex items-center justify-between px-5 py-3.5 gap-4 ${
                  opt.id === 'all' ? 'bg-indigo-500/5' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${opt.color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-(--nd-text-primary)">{opt.label}</p>
                    <p className="text-[11px] text-(--nd-text-muted) truncate">{opt.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-(--nd-text-muted)">
                    {opt.id === 'all' ? '5 sheets' : `${count.toLocaleString()} rows`}
                  </span>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => handleDownload(opt.id)}
                    className={`h-8 px-3 text-xs rounded-xl cursor-pointer ${
                      opt.id === 'all'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30'
                        : 'bg-white text-(--nd-text-secondary) border border-(--nd-border) hover:bg-(--nd-bg)'
                    }`}
                    variant="ghost"
                  >
                    {isDownloading ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                        Exporting…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Download className="h-3 w-3" />
                        .xlsx
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
