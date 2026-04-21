'use client'

import { useState } from 'react'
import { Download, ChevronDown, ChevronUp, Activity, TrendingUp, Users, BarChart3, Cpu, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'
import {
  createWorkbook,
  addSheet,
  downloadWorkbook,
} from '@/utils/excelExport'

interface ModuleEExportProps {
  jobId?: string
  sessionName?: string
}

// ── local transform helpers ──────────────────────────────────────────────────

function transformBrandAnalysis(data: any) {
  const ba = data?.brand_analysis
  if (!ba) return []
  return [
    {
      'Brand Name': ba.brand_name || '',
      'Total Mentions': ba.total_mentions ?? 0,
      'Positive Mentions': ba.sentiment?.counts?.positive ?? 0,
      'Negative Mentions': ba.sentiment?.counts?.negative ?? 0,
      'Neutral Mentions': ba.sentiment?.counts?.neutral ?? 0,
      'Sentiment Label': ba.sentiment?.label || '',
      'Top Source 1': ba.top_sources?.[0]?.domain || ba.top_sources?.[0]?.source || '',
      'Top Source 2': ba.top_sources?.[1]?.domain || ba.top_sources?.[1]?.source || '',
      'Top Source 3': ba.top_sources?.[2]?.domain || ba.top_sources?.[2]?.source || '',
    },
  ]
}

function transformBrandFrequencyTrend(data: any) {
  const trend = data?.brand_analysis?.frequency_trend ?? []
  return trend.map((t: any) => ({
    Date: t.date || '',
    Count: t.count ?? 0,
  }))
}

function transformCompetitorMentions(data: any) {
  const cm = data?.competitor_mentions
  if (!cm?.data) return []
  return cm.data.map((item: any) => ({
    Competitor: item.name || '',
    Mentions: item.mentions ?? 0,
    Sentiment: item.sentiment || '',
    'Overall SoV (%)': cm.overall_sov ?? 0,
  }))
}

function transformShareOfVoice(data: any) {
  const sov = data?.ai_share_of_voice
  if (!sov) return []
  const rows: any[] = []
  if (sov.by_model) {
    Object.entries(sov.by_model).forEach(([model, val]: [string, any]) => {
      rows.push({
        Model: model,
        'SoV (%)': val.sov ?? 0,
        'Brand Mentions': val.brand_mentions ?? 0,
        'Competitor Mentions': val.competitor_mentions ?? 0,
        'Brand Known': val.brand_known ? 'Yes' : 'No',
      })
    })
  }
  return rows
}

function transformSentimentTracking(data: any) {
  const st = data?.sentiment_tracking
  if (!st) return []
  const rows: any[] = []
  const byModel = st.sentiment?.by_model || {}
  const visByModel = st.visibility?.by_model || {}
  const allModels = new Set([...Object.keys(byModel), ...Object.keys(visByModel)])
  allModels.forEach((model) => {
    const s = byModel[model] || {}
    const v = visByModel[model] || {}
    rows.push({
      Model: model,
      'Sentiment Score': s.score ?? 0,
      'Positive (%)': s.distribution?.Positive ?? 0,
      'Neutral (%)': s.distribution?.Neutral ?? 0,
      'Negative (%)': s.distribution?.Negative ?? 0,
      'Visibility Score': v.visibility_score ?? 0,
      'Appearance Rate (%)': ((v.appearance_rate ?? 0) * 100).toFixed(1),
      Appearances: v.appearances ?? 0,
      'Total Prompts': v.total_prompts ?? 0,
    })
  })
  return rows
}

function transformRankingAnalysis(data: any) {
  const ranking = data?.ranking_analysis
  if (!ranking?.ranking_position_per_prompt) return []
  return ranking.ranking_position_per_prompt.map((row: any) => ({
    Prompt: row.prompt || '',
    Model: row.model || '',
    Position: row.position ?? 'N/A',
    'Total Cited': row.total_cited ?? 0,
    'Citation Count': row.citation_count ?? 0,
    'Source Diversity': row.source_diversity ?? 0,
    'Credibility Score': row.credibility_score ?? 0,
    'Percentile': row.percentile ?? 0,
    'Content Quality Score': row.content_quality_score ?? 0,
    'Accuracy Score': row.accuracy_score ?? 0,
    'Sentiment Score': row.sentiment_score ?? 0,
    'Brand Mentioned': row.brand_text_mentioned ? 'Yes' : 'No',
    'Mention Status': row.mention_status || '',
  }))
}

function transformModelComparison(data: any) {
  const mwc = data?.ranking_analysis?.model_wise_comparison ?? []
  return mwc.map((row: any) => {
    const { prompt, ...models } = row
    const out: any = { Prompt: prompt || '' }
    Object.entries(models).forEach(([model, val]) => {
      out[model] = val ?? 0
    })
    return out
  })
}

function transformMasterAnalysis(data: any) {
  const master = data?.master_analysis
  if (!master?.models) return []
  return master.models.map((m: any) => ({
    Model: m.model || '',
    'Accuracy Score': m.accuracy_of_generated_response ?? 0,
    'Content Consistency Score': m.content_consistency?.score ?? 0,
    'Topic Density': m.content_consistency?.topic_density ?? 0,
    'Audience Density': m.content_consistency?.audience_density ?? 0,
    'Brand Density': m.content_consistency?.brand_density ?? 0,
    'Entity Coverage Score': m.entity_coverage?.score ?? 0,
    'Found Entities': (m.entity_coverage?.found ?? []).join(', '),
    'Missing Entities': (m.entity_coverage?.missing ?? []).join(', '),
    'Total Expected Entities': m.entity_coverage?.total_expected ?? 0,
    'Completeness Score': m.completeness_score ?? 0,
    'Model Performance Score': m.model_wise_performance_score ?? 0,
  }))
}

// ────────────────────────────────────────────────────────────────────────────

interface ExportOption {
  id: string
  label: string
  description: string
  icon: React.ElementType
  color: string
  countKey: string
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'brand-analysis',
    label: 'Brand Analysis',
    description: 'Brand mentions, sentiment distribution and top sources.',
    icon: Activity,
    color: 'text-blue-600',
    countKey: 'brand_analysis',
  },
  {
    id: 'competitor-mentions',
    label: 'Competitor Mentions',
    description: 'Competitor mention counts, sentiment and share of voice.',
    icon: Users,
    color: 'text-orange-600',
    countKey: 'competitor_mentions',
  },
  {
    id: 'share-of-voice',
    label: 'AI Share of Voice',
    description: 'Brand vs competitor SoV per AI model.',
    icon: BarChart3,
    color: 'text-violet-600',
    countKey: 'ai_share_of_voice',
  },
  {
    id: 'sentiment-tracking',
    label: 'Sentiment Tracking',
    description: 'Sentiment scores and visibility rates per AI model.',
    icon: TrendingUp,
    color: 'text-emerald-600',
    countKey: 'sentiment_tracking',
  },
  {
    id: 'ranking-analysis',
    label: 'Ranking Analysis (Per Prompt)',
    description: 'Citation position, credibility and content quality per prompt & model.',
    icon: Cpu,
    color: 'text-amber-600',
    countKey: 'ranking_analysis',
  },
  {
    id: 'model-comparison',
    label: 'Model Comparison',
    description: 'Side-by-side model performance scores per prompt.',
    icon: TrendingUp,
    color: 'text-cyan-600',
    countKey: 'ranking_analysis',
  },
  {
    id: 'master-analysis',
    label: 'Master AI Analysis',
    description: 'Overall model accuracy, consistency, entity coverage and completeness.',
    icon: Cpu,
    color: 'text-pink-600',
    countKey: 'master_analysis',
  },
  {
    id: 'all',
    label: 'Full Brand Intelligence (All Sheets)',
    description: 'All brand and competitor AI analysis in one Excel workbook.',
    icon: FileSpreadsheet,
    color: 'text-indigo-600',
    countKey: '',
  },
]

export default function ModuleEExport({ jobId, sessionName = 'session' }: ModuleEExportProps) {
  const [expanded, setExpanded] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data: moduleEData, isLoading } = useGetModuleEResultQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const eData = moduleEData?.data

  const getCount = (key: string): number => {
    if (!eData) return 0
    if (key === 'brand_analysis') return eData.brand_analysis ? 1 : 0
    if (key === 'competitor_mentions') return eData.competitor_mentions?.data?.length ?? 0
    if (key === 'ai_share_of_voice') return Object.keys(eData.ai_share_of_voice?.by_model ?? {}).length
    if (key === 'sentiment_tracking') return Object.keys(eData.sentiment_tracking?.sentiment?.by_model ?? {}).length
    if (key === 'ranking_analysis') return eData.ranking_analysis?.ranking_position_per_prompt?.length ?? 0
    if (key === 'master_analysis') return eData.master_analysis?.models?.length ?? 0
    return 0
  }

  const handleDownload = async (optionId: string) => {
    if (!eData) return
    setDownloading(optionId)
    try {
      const wb = createWorkbook()
      const date = new Date().toISOString().split('T')[0]
      const filename = `${sessionName}_module-E_${optionId}_${date}`

      if (optionId === 'brand-analysis' || optionId === 'all') {
        addSheet(wb, transformBrandAnalysis(eData), 'Brand Analysis')
        const trend = transformBrandFrequencyTrend(eData)
        if (trend.length > 0) addSheet(wb, trend, 'Brand Freq Trend')
      }
      if (optionId === 'competitor-mentions' || optionId === 'all') {
        addSheet(wb, transformCompetitorMentions(eData), 'Competitor Mentions')
      }
      if (optionId === 'share-of-voice' || optionId === 'all') {
        addSheet(wb, transformShareOfVoice(eData), 'AI Share of Voice')
      }
      if (optionId === 'sentiment-tracking' || optionId === 'all') {
        addSheet(wb, transformSentimentTracking(eData), 'Sentiment Tracking')
      }
      if (optionId === 'ranking-analysis' || optionId === 'all') {
        addSheet(wb, transformRankingAnalysis(eData), 'Ranking Per Prompt')
      }
      if (optionId === 'model-comparison' || optionId === 'all') {
        addSheet(wb, transformModelComparison(eData), 'Model Comparison')
      }
      if (optionId === 'master-analysis' || optionId === 'all') {
        addSheet(wb, transformMasterAnalysis(eData), 'Master AI Analysis')
      }

      downloadWorkbook(wb, filename)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setDownloading(null)
    }
  }

  const hasData = !!eData

  return (
    <div className="rounded-2xl border border-(--nd-border) bg-white overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-(--nd-bg) transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
            <Activity className="h-4 w-4 text-violet-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-(--nd-text-primary)">Brand Intelligence (Module E)</p>
            <p className="text-[11px] text-(--nd-text-muted) mt-0.5">
              Brand analysis, competitor mentions, share of voice, ranking analysis
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
            const count = getCount(opt.countKey)
            const isDownloading = downloading === opt.id
            const disabled = isLoading || !hasData || !!downloading

            return (
              <div
                key={opt.id}
                className={`flex items-center justify-between px-5 py-3.5 gap-4 ${
                  opt.id === 'all' ? 'bg-(--nd-bg)' : ''
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
                    {opt.id === 'all' ? '7 sheets' : `${count.toLocaleString()} rows`}
                  </span>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => handleDownload(opt.id)}
                    className={`h-8 px-3 text-xs rounded-xl cursor-pointer ${
                      opt.id === 'all'
                        ? 'text-white border-transparent hover:opacity-90'
                        : 'bg-white text-(--nd-text-secondary) border border-(--nd-border) hover:bg-(--nd-bg)'
                    }`}
                    style={opt.id === 'all' ? { background: 'var(--nd-purple)' } : undefined}
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
