'use client'

import { type ReactNode, useState, useMemo } from 'react'
import { useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'
import { useGetAllModuleCResultsQuery, useGetModuleCResultQuery } from '@/store/api/module_C/moduleCApi'
import { useGetModuleFResultQuery } from '@/store/api/module_F/moduleFApi'
import { useGetOnboardingDataQuery } from '@/store/api/brandOnboardingApi'
import { StatCard } from '@/components/ui/StatCard'
import { SectionCard } from '@/components/ui/SectionCard'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Users,
  Award,
  Eye,
  MessageSquare,
  ArrowUpRight,
  Globe,
  Target,
  Zap,
  BarChart2,
  Calendar,
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const MODEL_META: Record<string, { label: string; color: string; hex: string }> = {
  chat_gpt: { label: 'ChatGPT', color: 'var(--nd-blue)',    hex: '#4896FE' },
  gemini:   { label: 'Gemini',  color: 'var(--nd-emerald)', hex: '#16C8C7' },
  claude:   { label: 'Claude',  color: 'var(--nd-purple)',  hex: '#5347CE' },
}
const MODEL_KEYS = ['chat_gpt', 'gemini', 'claude'] as const

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#059669',
  negative: '#dc2626',
  neutral:  '#6b7280',
}

const TOPIC_BAR_COLORS = [
  '#5347CE', '#4896FE', '#16C8C7', '#059669', '#8b5cf6',
  '#0ea5e9', '#10b981', '#7c3aed', '#0284c7', '#047857',
]

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

interface DashboardOverviewProps {
  jobId?: string | null
  url?: string
  onNavigate?: (tab: string) => void
  crawlStatusSlot?: ReactNode
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SentimentBadge({ label }: { label?: string }) {
  if (!label) return null
  const map: Record<string, { bg: string; border: string; text: string; icon: React.ElementType }> = {
    positive: { bg: '#ecfdf5', border: '#a7f3d0', text: '#059669', icon: TrendingUp },
    negative: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', icon: TrendingDown },
    neutral:  { bg: 'var(--nd-bg)', border: 'var(--nd-border)', text: 'var(--nd-text-secondary)', icon: Minus },
  }
  const s = map[label.toLowerCase()] ?? map.neutral
  const SIcon = s.icon
  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 font-bold uppercase tracking-tight"
      style={{ fontSize: 10, background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
    >
      <SIcon className="h-3 w-3" />
      {label}
    </span>
  )
}

function PresenceGauge({ rate }: { rate: number }) {
  const r      = 40
  const circ   = 2 * Math.PI * r
  const filled = circ * Math.min(Math.max(rate, 0), 100) / 100
  return (
    <svg width={100} height={100} viewBox="0 0 100 100" className="shrink-0">
      <circle cx={50} cy={50} r={r} fill="none" stroke="var(--nd-border)" strokeWidth={8} />
      <circle
        cx={50} cy={50} r={r} fill="none"
        stroke="#5347CE" strokeWidth={8}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text
        x={50} y={50} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 17, fontWeight: 700, fill: 'var(--nd-text-primary)' }}
      >
        {rate}%
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
export default function DashboardOverview({
  jobId,
  url,
  onNavigate,
  crawlStatusSlot,
}: DashboardOverviewProps) {
  const { data: moduleEResponse, isLoading } = useGetModuleEResultQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  /* Module C — AI Visibility Trend */
  const { data: moduleCAllData } = useGetAllModuleCResultsQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const { data: moduleCCurrentData } = useGetModuleCResultQuery(
    { jobId: jobId ?? '', url },
    { skip: !jobId, refetchOnMountOrArgChange: true },
  )

  /* Module F — Competitor visibility comparison */
  const { data: moduleFResponse } = useGetModuleFResultQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  /* Brand Onboarding — brand presence + topic analysis */
  const { data: onboardingData } = useGetOnboardingDataQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const [selectedModel, setSelectedModel] = useState<string | null>(null)

  const d    = moduleEResponse?.data
  const modF = moduleFResponse?.data

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-48 mb-2 rounded-lg animate-pulse" style={{ background: 'var(--nd-border)' }} />
          <div className="h-4 w-72 rounded-lg animate-pulse" style={{ background: 'var(--nd-border)' }} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border p-5" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
              <div className="h-10 w-10 rounded-xl mb-4 animate-pulse" style={{ background: 'var(--nd-border)' }} />
              <div className="h-8 w-20 mb-2 rounded animate-pulse" style={{ background: 'var(--nd-border)' }} />
              <div className="h-3 w-full rounded animate-pulse" style={{ background: 'var(--nd-border)' }} />
            </div>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
            <div className="p-5 border-b" style={{ borderColor: 'var(--nd-border)' }}>
              <div className="h-5 w-40 rounded animate-pulse" style={{ background: 'var(--nd-border)' }} />
            </div>
            <div className="h-48 animate-pulse m-5 rounded-xl" style={{ background: 'var(--nd-bg)' }} />
          </div>
        ))}
      </div>
    )
  }

  if (!d) {
    return (
      <AnalysisEmptyState
        icon={<Brain className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />}
        title="No Analysis Data Available"
        description="Run a Quick Start analysis to populate the dashboard."
      />
    )
  }

  /* ── Extract data ── */
  const brand         = d.brand_analysis
  const competitors   = d.competitor_mentions
  const sov           = d.ai_share_of_voice
  const ranking       = d.ranking_analysis
  const sovHistory    = d.ai_sov_history ?? []
  const compLandscape = d.competitor_landscape

  const brandName       = brand?.brand_name ?? '—'
  const totalMentions   = brand?.total_mentions ?? 0
  const sentimentLabel  = brand?.sentiment?.label
  const overallSov      = sov?.overall_sov ?? 0
  const visibilityTier  = sov?.visibility_tier ?? '—'
  const competitorCount = competitors?.data?.length ?? 0
  const compCount = competitorCount
  const byModel         = sov?.by_model ?? {}

  /* ── Avg. Ranking — NaN-safe ── */
  const rankingRows      = ranking?.ranking_position_per_prompt ?? []
  // Only rows where the brand URL was actually cited (position > 0)
  const citedPrompts     = rankingRows.filter((r) => typeof r.position === 'number' && r.position > 0)
  const citedCount       = rankingRows.filter((r) => r.mention_status === 'Cited').length
  const mentionedOnlyCount = rankingRows.filter((r) => r.mention_status === 'Mentioned (No Link)').length
  const totalPrompts     = ranking?.generated_prompts?.length ?? rankingRows.length
  // avgRankingValue: '#2.3' when cited, 'Mentioned' when text-only, 'Not Found' when neither, '—' when no data yet
  const avgRankingValue: string = (() => {
    if (!rankingRows.length) return '—'
    if (citedPrompts.length > 0)
      return `#${(citedPrompts.reduce((sum, r) => sum + r.position!, 0) / citedPrompts.length).toFixed(1)}`
    if (mentionedOnlyCount > 0) return 'Mentioned'
    return 'Not Found'
  })()

  // Human-readable subtext for the Avg. Ranking card
  const rankingSubtext = (() => {
    if (!totalPrompts) return undefined
    if (citedCount > 0) return `${citedCount}/${totalPrompts} URLs cited — lower is better`
    if (mentionedOnlyCount > 0) return `${mentionedOnlyCount}/${totalPrompts} text-only — no link citation yet`
    return `0/${totalPrompts} not mentioned`
  })()

  /* ── Deltas ── */
  const sovDelta: number | null = sovHistory.length >= 2
    ? sovHistory[sovHistory.length - 1].overall_sov - sovHistory[sovHistory.length - 2].overall_sov
    : null

  // Brand mentions % delta from frequency_trend (last two calendar months)
  const freqTrend = brand?.frequency_trend ?? []
  const mentionsDelta: number | null = freqTrend.length >= 2
    ? (() => {
        const prev = freqTrend[freqTrend.length - 2].count ?? 0
        const curr = freqTrend[freqTrend.length - 1].count ?? 0
        return prev === 0 ? null : ((curr - prev) / prev) * 100
      })()
    : null

  /* ── Module F — most mentioned brands & top competitor ── */
  const fCompetitors    = modF?.compare_visibility_against_competitors?.competitors ?? []
  const fBrand          = modF?.compare_visibility_against_competitors?.brand ?? null
  const topCompetitor   = fCompetitors.length > 0
    ? [...fCompetitors].sort((a, b) => a.rank_position - b.rank_position)[0]
    : null
  const brandBarEntry   = fBrand ? [{ name: fBrand.name ?? brandName, mentions: fBrand.mentions_total, isBrand: true }] : []
  const mentionBarsData = [
    ...brandBarEntry,
    ...fCompetitors.slice(0, 6).map((c) => ({ name: c.name, mentions: c.mentions_total, isBrand: false })),
  ].sort((a, b) => b.mentions - a.mentions)

  /* ── Onboarding — Brand Presence ── */
  const aggregate        = onboardingData?.aggregate
  const presenceRate     = Math.round((aggregate?.brand_presence_rate ?? 0) * 100)
  const presenceCount    = aggregate?.brand_presence_count ?? 0
  const presenceTotal    = aggregate?.brand_presence_total ?? 0
  const positiveMentions = aggregate?.positive_mentions ?? 0
  const negativeMentions = aggregate?.negative_mentions ?? 0
  const neutralMentions  = aggregate?.neutral_mentions  ?? 0
  const allBrandMentions = aggregate?.all_brand_mentions ?? []

  /* ── Onboarding — Brand Presence by Topics ── */
  const topicPresence = useMemo(() => {
    const results = onboardingData?.prompt_results ?? []
    const map: Record<string, { total: number; present: number }> = {}
    for (const pr of results) {
      const topic = pr.topic ?? 'General'
      if (!map[topic]) map[topic] = { total: 0, present: 0 }
      map[topic].total++
      const mentioned = (['openai', 'gemini', 'claude'] as const).some(
        (p) => pr.results?.[p]?.analysis?.brand_mentioned,
      )
      if (mentioned) map[topic].present++
    }
    return Object.entries(map)
      .map(([topic, { total, present }]) => ({
        topic, total, present,
        rate: total > 0 ? Math.round((present / total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingData?.prompt_results])

  /* ── Module C: current per-model scores ── */
  const moduleCPerModel: Record<string, { accuracy: number; completeness: number; friendliness: number }> = useMemo(() => {
    const mods   = moduleCCurrentData?.data?.modules as any
    const llmSim = mods?.llm_simulator
    const multiM = mods?.multi_model
    const acc  = llmSim?.accuracy?.per_model     ?? {}
    const comp = llmSim?.completeness?.per_model ?? {}
    const fri  = multiM?.model_friendliness?.per_model ?? {}
    // Python keys: openai, gemini, claude — map openai → chat_gpt to match MODEL_META
    const resolve = (obj: Record<string, number>, chatGptKey: string) =>
      obj[chatGptKey] ?? obj['openai'] ?? obj['chat_gpt'] ?? 0
    return {
      chat_gpt: {
        accuracy:     Math.round(resolve(acc,  'openai')),
        completeness: Math.round(resolve(comp, 'openai')),
        friendliness: Math.round(resolve(fri,  'openai')),
      },
      gemini: {
        accuracy:     Math.round(acc['gemini']  ?? 0),
        completeness: Math.round(comp['gemini'] ?? 0),
        friendliness: Math.round(fri['gemini']  ?? 0),
      },
      claude: {
        accuracy:     Math.round(acc['claude']  ?? 0),
        completeness: Math.round(comp['claude'] ?? 0),
        friendliness: Math.round(fri['claude']  ?? 0),
      },
    }
  }, [moduleCCurrentData])

  // Keep the single-key map for backward-compat with trend chart
  const moduleCCurrentFriendliness: Record<string, number> = useMemo(() =>
    Object.fromEntries(Object.entries(moduleCPerModel).map(([k, v]) => [k, v.friendliness]))
  , [moduleCPerModel])

  const hasModuleCData = Object.values(moduleCPerModel).some(
    (v) => v.accuracy > 0 || v.completeness > 0 || v.friendliness > 0,
  )
  // keep alias used in chart section
  const hasCModuleCFriendliness = hasModuleCData

  /* ── Trend chart data: primary = Module C per-model friendliness, fallback = ai_sov_history ── */

  // normalise a URL for comparison: strip scheme, www, trailing slash
  const normaliseUrl = (u: string) =>
    u.toLowerCase().replace(/^https?:\/\//, '').replace(/^\/\//, '').replace(/^www\./, '').replace(/\/$/, '')

  const normTargetUrl = url ? normaliseUrl(url) : null

  // Module C: each AEO_ANALYSIS run's multi_model.model_friendliness.per_model (0–100 citation bucket)
  // Keys from Python c7_llm_simulator: 'openai', 'gemini', 'claude'
  // We map 'openai' → 'chat_gpt' to match MODEL_META
  // Filter to the specific URL being analysed so we don’t mix results from different pages
  const moduleCTrendData = useMemo(() => {
    const runs = moduleCAllData?.data?.data ?? []
    if (!runs.length) return []
    const filtered = normTargetUrl
      ? runs.filter((r) => normaliseUrl(r.url ?? '') === normTargetUrl)
      : runs
    if (!filtered.length) return []
    return [...filtered]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((r) => {
        const pm = (r.modules?.multi_model as any)?.model_friendliness?.per_model ?? {}
        return {
          date: new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          chat_gpt: pm['chat_gpt'] ?? pm['openai'] ?? null,
          gemini:   pm['gemini']  ?? null,
          claude:   pm['claude']  ?? null,
        }
      })
      // only keep runs that have at least one model value
      .filter((r) => r.chat_gpt != null || r.gemini != null || r.claude != null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleCAllData, normTargetUrl])

  // SOV history fallback (from module E)
  const sovTrendData = useMemo(() => {
    if (!sovHistory.length) return []
    return sovHistory.map((entry) => ({
      date: entry.date
        ? new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '—',
      chat_gpt: entry.by_model?.chat_gpt?.sov ?? null,
      gemini:   entry.by_model?.gemini?.sov   ?? null,
      claude:   entry.by_model?.claude?.sov   ?? null,
    }))
  }, [sovHistory])

  const trendData   = moduleCTrendData.length > 0 ? moduleCTrendData : sovTrendData
  const trendSource = moduleCTrendData.length > 0 ? 'module_c' : 'sov'
  // Snapshot grouped bar data: 3 metrics per model — matches Model Comparison exactly
  // When Module C data exists use Acc/Comp/Fri; otherwise fall back to SOV as single metric
  const snapshotBarData = MODEL_KEYS.map((key) => ({
    name:         MODEL_META[key].label,
    key,
    Accuracy:     hasModuleCData ? moduleCPerModel[key].accuracy     : (byModel[key]?.sov ?? 0),
    Completeness: hasModuleCData ? moduleCPerModel[key].completeness  : (byModel[key]?.sov ?? 0),
    Friendliness: hasModuleCData ? moduleCPerModel[key].friendliness  : (byModel[key]?.sov ?? 0),
  }))

  /* ── Sentiment donut ── */
  const sentimentCounts = brand?.sentiment?.counts ?? {}
  const positive       = sentimentCounts.positive ?? 0
  const negative       = sentimentCounts.negative ?? 0
  const neutral        = sentimentCounts.neutral  ?? 0
  const totalSentiment = positive + negative + neutral
  const donutData = [
    { name: 'Positive', value: positive, color: SENTIMENT_COLORS.positive },
    { name: 'Negative', value: negative, color: SENTIMENT_COLORS.negative },
    { name: 'Neutral',  value: neutral,  color: SENTIMENT_COLORS.neutral  },
  ].filter((entry) => entry.value > 0)

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h2 className="nd-page-title">Dashboard</h2>
        <p className="mt-1.5" style={{ fontSize: 'var(--font-base)', color: 'var(--nd-text-secondary)' }}>
          Quick overview of AI visibility for{' '}
          <span style={{ color: 'var(--nd-text-primary)', fontWeight: 600 }}>{brandName}</span>
          {url && (
            <>
              {' · '}
              <a
                href={url.startsWith('http') ? url : `https://${url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors"
                style={{ color: 'var(--nd-purple)' }}
              >
                {url}
              </a>
            </>
          )}
        </p>
      </div>

      {/* ── 1. KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label="Brand Mentions"
          value={totalMentions}
          subtext={sentimentLabel ? `Sentiment: ${sentimentLabel}` : undefined}
          delta={mentionsDelta}
          deltaLabel="vs last period"
          description="How many times your brand was mentioned across the prompts we checked."
          icon={MessageSquare}
          accent="blue"
          onClick={() => onNavigate?.('prompt-difficulty')}
        />
        <StatCard
          label="Competitors Tracked"
          value={compCount}
          subtext={competitors?.overall_sov != null ? `Market SOV: ${competitors.overall_sov}%` : undefined}
          delta={null}
          description="How many competitor brands were included in this run."
          icon={Users}
          accent="amber"
          onClick={() => onNavigate?.('visibility-comparision')}
        />
        <StatCard
          label="Avg. Ranking"
          value={avgRankingValue}
          subtext={rankingSubtext}
          description="Average citation position when your URL was formally cited."
          icon={Award}
          accent="emerald"
          onClick={() => onNavigate?.('trends-by-model')}
        />
      </div>

      {/* ── 2. AI Visibility by LLM ── */}
      <SectionCard
        title="AI Visibility by LLM"
        description={
          trendSource === 'module_c'
            ? trendData.length >= 2
              ? 'Per-model AI visibility trend from AI Intelligence. Score = citation rate bucket (5–100). Run AI Intelligence again to add data points.'
              : 'Current per-model AI visibility snapshot. Run analysis multiple times to see a trend.'
            : 'AI Share of Voice per LLM. Run AI Intelligence (Module C) for richer per-model scores.'
        }
        onClick={() => onNavigate?.('model-comparison')}
        actionLabel="View details"
        actionIcon={ArrowUpRight}
      >
        {trendData.length >= 2 ? (
          /* Trend line chart — 2+ runs */
          (() => {
            const selectedHasData = selectedModel
              ? trendData.some((d) => (d as any)[selectedModel] != null && (d as any)[selectedModel] > 0)
              : true
            const effectiveSelected = selectedHasData ? selectedModel : null
            const fmtValue = trendSource === 'module_c'
              ? (v: number) => String(Math.round(v))
              : (v: number) => `${v}%`
            return (
              <>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nd-border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'var(--nd-text-muted)', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fill: 'var(--nd-text-muted)', fontSize: 10, fontWeight: 700 }}
                      axisLine={false} tickLine={false}
                      tickFormatter={fmtValue}
                      domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={44}
                    />
                    <RechartsTooltip
                      contentStyle={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)', borderRadius: '12px', fontSize: 12, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      labelStyle={{ color: 'var(--nd-text-muted)', fontSize: 10, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
                      formatter={(value: number, name: string) =>
                        trendSource === 'module_c'
                          ? [String(Math.round(Number(value))), MODEL_META[name]?.label ?? name]
                          : [`${Number(value).toFixed(1)}%`, MODEL_META[name]?.label ?? name]
                      }
                    />
                    {MODEL_KEYS.map((key) => {
                      const meta    = MODEL_META[key]
                      const visible = !effectiveSelected || effectiveSelected === key
                      return (
                        <Line
                          key={key} type="monotone" dataKey={key} name={key}
                          stroke={meta.hex} strokeWidth={visible ? 3 : 1.5} strokeOpacity={visible ? 1 : 0.2}
                          dot={(props: any) => {
                            const { cx, cy, value } = props
                            if (value == null) return <g key={props.key} />
                            return <circle key={props.key} cx={cx} cy={cy} r={visible ? 5 : 3}
                              fill={meta.hex} fillOpacity={visible ? 1 : 0.2}
                              stroke={visible ? '#ffffff' : 'none'} strokeWidth={visible ? 2 : 0} />
                          }}
                          activeDot={{ r: 7, strokeWidth: 2, stroke: '#ffffff' }}
                          connectNulls
                        />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {MODEL_KEYS.map((key) => {
                  const m = MODEL_META[key]; const active = selectedModel === key
                  return (
                    <button key={key} type="button" onClick={() => setSelectedModel(selectedModel === key ? null : key)}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1 transition-all"
                      style={{ fontSize: 11, fontWeight: 600, background: active ? m.hex + '18' : 'var(--nd-bg)', border: `1.5px solid ${active ? m.hex : 'var(--nd-border)'}`, color: active ? m.hex : 'var(--nd-text-secondary)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: m.hex }} />{m.label}
                    </button>
                  )
                })}
                <span className="ml-auto rounded-full border px-2 py-0.5" style={{ fontSize: 10, color: trendSource === 'module_c' ? 'var(--nd-purple)' : 'var(--nd-text-secondary)', borderColor: trendSource === 'module_c' ? 'rgba(83,71,206,0.2)' : 'var(--nd-border)', background: trendSource === 'module_c' ? 'var(--nd-purple-subtle)' : 'var(--nd-bg)' }}>{trendSource === 'module_c' ? 'AI Intelligence (C9)' : 'SOV History'}</span>
              </div>
              </>
            )
          })()
        ) : hasModuleCData || snapshotBarData.some((d) => d.Friendliness > 0) ? (
          /* Snapshot grouped bar chart — mirrors Model Comparison "Per-Model Score Comparison" */
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={snapshotBarData}
                barCategoryGap="25%"
                barGap={4}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--nd-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--nd-text-muted)', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
                  tick={{ fill: 'var(--nd-text-muted)', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => String(v)}
                  width={32}
                />
                <RechartsTooltip
                  contentStyle={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)', borderRadius: '12px', fontSize: 12, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  labelStyle={{ color: 'var(--nd-text-muted)', fontSize: 10, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
                  formatter={(value: number, name: string) => [String(Math.round(Number(value))), name]}
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                />
                <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700, color: 'var(--nd-text-muted)', textTransform: 'uppercase' }} />
                <Bar key="Accuracy"     dataKey="Accuracy"     fill="var(--nd-blue)" radius={[3, 3, 0, 0]} />
                <Bar key="Completeness" dataKey="Completeness" fill="#059669" radius={[3, 3, 0, 0]} />
                <Bar key="Friendliness" dataKey="Friendliness" fill="var(--nd-purple)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {trendData.length <= 1 && (
              <p style={{ fontSize: 12, color: 'var(--nd-text-secondary)', marginTop: 4, textAlign: 'center' }}>
                {hasModuleCData
                  ? 'Single snapshot — run AI Intelligence again to build a trend'
                  : 'Based on current SOV — run AI Intelligence for citation-based scores'}
              </p>
            )}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center">
            <p className="max-w-70 leading-relaxed text-center" style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>
              Run AI Intelligence analysis to see per-model visibility scores here
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── 3. Brand Analysis | Competitor Landscape ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Brand Analysis */}
        <SectionCard
          title="Brand Analysis"
          description="Mention volume, sentiment mix, and how your brand is discussed across AI-visible sources."
          onClick={() => onNavigate?.('prompt-difficulty')}
          actionLabel="View details"
          actionIcon={ArrowUpRight}
        >
          {brand ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 'var(--font-base)', color: 'var(--nd-text-secondary)', fontWeight: 500 }}>Overall Sentiment</span>
                <SentimentBadge label={sentimentLabel} />
              </div>

              {totalSentiment > 0 ? (
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Donut */}
                  <div className="shrink-0 -ml-1">
                    <PieChart width={108} height={108}>
                      <Pie
                        data={donutData}
                        cx={50}
                        cy={50}
                        innerRadius={32}
                        outerRadius={50}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {donutData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </div>
                  {/* Legend */}
                  <div className="flex flex-col gap-2 min-w-0">
                    {[
                      { key: 'positive', label: 'Positive', val: positive },
                      { key: 'negative', label: 'Negative', val: negative },
                      { key: 'neutral',  label: 'Neutral',  val: neutral  },
                    ].map(({ key, label, val }) => {
                      const pct = totalSentiment ? Math.round((val / totalSentiment) * 100) : 0
                      return (
                        <div key={key} className="flex items-center gap-2" style={{ fontSize: 'var(--font-sm)' }}>
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: SENTIMENT_COLORS[key] }}
                          />
                          <span className="w-14" style={{ color: 'var(--nd-text-secondary)' }}>{label}</span>
                          <span className="font-semibold tabular-nums" style={{ color: 'var(--nd-text-primary)' }}>{val}</span>
                          <span style={{ color: 'var(--nd-text-muted)' }}>({pct}%)</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(['positive', 'negative', 'neutral'] as const).map((key) => (
                    <div key={key} className="rounded-xl py-3" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                      <p className="text-lg font-bold" style={{ color: 'var(--nd-text-primary)' }}>
                        {brand.sentiment?.counts?.[key] ?? 0}
                      </p>
                      <p className="capitalize mt-0.5" style={{ fontSize: 12, color: 'var(--nd-text-secondary)' }}>{key}</p>
                    </div>
                  ))}
                </div>
              )}

              {brand.top_sources && brand.top_sources.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--nd-text-secondary)', marginBottom: 6 }}>Top Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {brand.top_sources.slice(0, 5).map((src, i) => (
                      <a
                        key={i}
                        href={src.url || `https://${src.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg px-2.5 py-0.5 truncate max-w-37.5 transition-colors"
                        style={{ fontSize: 12, background: 'var(--nd-purple-subtle)', border: '1px solid rgba(83,71,206,0.15)', color: 'var(--nd-purple)' }}
                        title={src.title || src.domain}
                      >
                        {src.domain}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>Not yet available</p>
          )}
        </SectionCard>

        {/* Monthly Mention Frequency */}
        {(() => {
          const freqData = (brand?.frequency_trend ?? []).map((entry: any) => ({
            month: entry.date
              ? new Date(entry.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
              : '—',
            count: entry.count ?? 0,
          }))
          const maxCount = Math.max(...freqData.map((d: any) => d.count), 1)
          return (
            <SectionCard
              title="Monthly Mention Frequency"
              description="How often your brand was mentioned across AI-visible sources each month."
              onClick={() => onNavigate?.('prompt-difficulty')}
              actionLabel="View details"
              actionIcon={ArrowUpRight}
            >
              {freqData.length > 0 ? (
                <div>
                  {/* Chart */}
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={freqData}
                        margin={{ top: 6, right: 8, left: -18, bottom: 0 }}
                        barSize={Math.max(8, Math.min(24, Math.floor(200 / freqData.length)))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--nd-border)" vertical={false} />
                        <XAxis
                          dataKey="month"
                          tick={{ fill: 'var(--nd-text-muted)', fontSize: 10, fontWeight: 700 }}
                          axisLine={false}
                          tickLine={false}
                          interval={freqData.length > 8 ? Math.floor(freqData.length / 7) : 0}
                        />
                        <YAxis
                          tick={{ fill: 'var(--nd-text-muted)', fontSize: 10, fontWeight: 700 }}
                          axisLine={false}
                          tickLine={false}
                          width={36}
                          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            background: 'var(--nd-card-bg)',
                            border: '1px solid var(--nd-border)',
                            borderRadius: 12,
                            fontSize: 12,
                            padding: '8px 12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          }}
                          labelStyle={{ color: 'var(--nd-text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}
                          formatter={(value: number) => [value.toLocaleString(), 'Mentions']}
                          cursor={{ fill: 'rgba(83,71,206,0.05)' }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={32}
                        >
                          {freqData.map((_: any, idx: number) => {
                            const opacity = 0.45 + 0.55 * (freqData[idx].count / maxCount)
                            return (
                              <Cell
                                key={idx}
                                fill="var(--nd-blue)"
                                fillOpacity={opacity}
                              />
                            )
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Index row — month labels + counts */}
                  <div
                    className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t pt-3"
                    style={{ borderColor: 'var(--nd-border)' }}
                  >
                    {freqData.slice(-6).map((entry: any, i: number) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ background: 'var(--nd-blue)', opacity: 0.45 + 0.55 * (entry.count / maxCount) }}
                        />
                        <span style={{ fontSize: 10, color: 'var(--nd-text-muted)', fontWeight: 600 }}>
                          {entry.month}
                        </span>
                        <span
                          className="tabular-nums font-bold"
                          style={{ fontSize: 11, color: 'var(--nd-text-primary)' }}
                        >
                          {entry.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {freqData.length > 6 && (
                      <span style={{ fontSize: 10, color: 'var(--nd-text-muted)', alignSelf: 'center' }}>
                        +{freqData.length - 6} more months
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10">
                  <Calendar className="w-8 h-8 mb-3" style={{ color: 'var(--nd-text-muted)' }} />
                  <p className="text-center" style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>
                    No frequency data yet — run Brand &amp; Competitor Mention analysis
                  </p>
                </div>
              )}
            </SectionCard>
          )
        })()}
      </div>

      {/* ── 4. Most Mentioned Brands | Top Competitor (Module F) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Most Mentioned Brands */}
        <SectionCard
          title="Most Mentioned Brands"
          description="Brand vs competitor mention volume across all AI model responses."
          onClick={() => onNavigate?.('visibility-comparision')}
          actionLabel="View comparison"
          actionIcon={ArrowUpRight}
        >
          {mentionBarsData.length > 0 ? (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mentionBarsData} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--nd-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--nd-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--nd-text-secondary)', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} width={90} tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + '…' : v} />
                  <RechartsTooltip contentStyle={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)', borderRadius: '10px', fontSize: 12, padding: '6px 10px' }} formatter={(value: number) => [value, 'Mentions']} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                  <Bar dataKey="mentions" radius={[0, 3, 3, 0]}>
                    {mentionBarsData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.isBrand ? '#5347CE' : '#4896FE'} fillOpacity={entry.isBrand ? 0.9 : 0.6} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--nd-text-secondary)' }}>
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#5347CE' }} />Your brand
                </span>
                <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--nd-text-secondary)' }}>
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#4896FE', opacity: 0.6 }} />Competitors
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10">
              <BarChart2 className="w-8 h-8 mb-3" style={{ color: 'var(--nd-text-muted)' }} />
              <p className="text-center" style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>
                Run Competitor Intelligence to see brand mention comparison
              </p>
            </div>
          )}
        </SectionCard>

        {/* Top Competitor */}
        <SectionCard
          title="Top Competitor"
          description="Your highest-ranked competitor by AI visibility score from the latest intelligence run."
          onClick={() => onNavigate?.('visibility-comparision')}
          actionLabel="Full comparison"
          actionIcon={ArrowUpRight}
        >
          {topCompetitor ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{topCompetitor.name}</p>
                  <p style={{ fontSize: 13, color: 'var(--nd-text-secondary)', marginTop: 2 }}>Top competitor by visibility score</p>
                </div>
                <div className="rounded-xl px-3 py-2 text-center shrink-0" style={{ background: 'var(--nd-purple-subtle)', border: '1px solid rgba(83,71,206,0.2)' }}>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--nd-purple)' }}>{topCompetitor.visibility_score}</p>
                  <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--nd-purple)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vis. Score</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { label: 'SOV',          value: `${topCompetitor.share_of_voice ?? 0}%`,                                         icon: Eye },
                  { label: 'Market Share', value: `${topCompetitor.market_share_percent ?? 0}%`,                                    icon: Target },
                  { label: 'Mentions',     value: String(topCompetitor.mentions_total ?? 0),                                        icon: MessageSquare },
                  { label: 'Avg Rank',     value: topCompetitor.avg_rank != null ? `#${topCompetitor.avg_rank.toFixed(1)}` : '—',   icon: Award },
                ] as { label: string; value: string; icon: any }[]).map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-xl p-3" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="w-3.5 h-3.5" style={{ color: 'var(--nd-text-muted)' }} />
                      <span style={{ fontSize: 11, color: 'var(--nd-text-muted)', fontWeight: 500 }}>{label}</span>
                    </div>
                    <p className="font-bold tabular-nums" style={{ fontSize: 16, color: 'var(--nd-text-primary)' }}>{value}</p>
                  </div>
                ))}
              </div>
              {topCompetitor.per_model && Object.keys(topCompetitor.per_model).length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--nd-text-secondary)', marginBottom: 6 }}>Mentions by Model</p>
                  <div className="flex gap-2 flex-wrap">
                    {MODEL_KEYS.map((key) => {
                      const m = topCompetitor.per_model[key]
                      if (!m) return null
                      const meta = MODEL_META[key]
                      return (
                        <div key={key} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.hex }} />
                          <span style={{ fontSize: 11, color: 'var(--nd-text-secondary)', fontWeight: 500 }}>{meta.label}</span>
                          <span className="font-semibold tabular-nums" style={{ fontSize: 12, color: 'var(--nd-text-primary)' }}>{m.mentions}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10">
              <Zap className="w-8 h-8 mb-3" style={{ color: 'var(--nd-text-muted)' }} />
              <p className="text-center" style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>
                Run Competitor Intelligence to identify your top competitor
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── 5. Brand Presence | Competitor Presence ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Brand Presence gauge */}
        <SectionCard
          title="Brand Presence"
          description="How often your brand appeared across all AI-generated prompt responses during onboarding analysis."
          onClick={() => onNavigate?.('visibility-comparision')}
          actionLabel="Details"
          actionIcon={ArrowUpRight}
        >
          {presenceTotal > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-6">
                <PresenceGauge rate={presenceRate} />
                <div className="space-y-2">
                  <div>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--nd-text-primary)' }}>
                      {presenceCount}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--nd-text-muted)' }}>/{presenceTotal}</span>
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--nd-text-secondary)' }}>Prompts where brand appeared</p>
                  </div>
                  {(positiveMentions + negativeMentions + neutralMentions) > 0 && (
                    <div className="flex gap-3">
                      {[
                        { label: 'Pos', val: positiveMentions, color: '#059669' },
                        { label: 'Neg', val: negativeMentions, color: '#dc2626' },
                        { label: 'Neu', val: neutralMentions,  color: '#6b7280' },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="text-center">
                          <p className="font-bold tabular-nums" style={{ fontSize: 15, color }}>{val}</p>
                          <p style={{ fontSize: 10, color: 'var(--nd-text-muted)', fontWeight: 600 }}>{label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {allBrandMentions.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--nd-text-secondary)', marginBottom: 8 }}>Brand Mention Comparison</p>
                  <div className="space-y-2.5">
                    {allBrandMentions.slice(0, 5).map((bm, i) => {
                      const maxCount = allBrandMentions[0]?.count ?? 1
                      const pct      = maxCount > 0 ? Math.round((bm.count / maxCount) * 100) : 0
                      const isOurs   = bm.name.toLowerCase() === brandName.toLowerCase()
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-24 truncate text-right shrink-0" style={{ fontSize: 11, color: isOurs ? 'var(--nd-purple)' : 'var(--nd-text-secondary)', fontWeight: isOurs ? 600 : 400 }}>{bm.name}</span>
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: isOurs ? '#5347CE' : '#4896FE', opacity: isOurs ? 1 : 0.55 }} />
                          </div>
                          <span className="w-6 text-right shrink-0 tabular-nums font-semibold" style={{ fontSize: 11, color: 'var(--nd-text-secondary)' }}>{bm.count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10">
              <Globe className="w-8 h-8 mb-3" style={{ color: 'var(--nd-text-muted)' }} />
              <p className="text-center" style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>
                Complete brand onboarding to see brand presence data
              </p>
            </div>
          )}
        </SectionCard>

        {/* Competitor Presence */}
        <SectionCard
          title="Competitor Presence"
          description="How frequently each tracked competitor appeared in AI model responses during onboarding analysis."
          onClick={() => onNavigate?.('visibility-comparision')}
          actionLabel="Full comparison"
          actionIcon={ArrowUpRight}
        >
          {(() => {
            const compPresence = (aggregate?.competitors_presence ?? []).length > 0
              ? aggregate!.competitors_presence
              : allBrandMentions.filter((bm) => bm.name.toLowerCase() !== brandName.toLowerCase())
            if (compPresence.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-10">
                  <Users className="w-8 h-8 mb-3" style={{ color: 'var(--nd-text-muted)' }} />
                  <p className="text-center" style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>
                    No competitor presence data yet — complete brand onboarding
                  </p>
                </div>
              )
            }
            return (
              <div className="space-y-2.5">
                {compPresence.slice(0, 7).map((cp, i) => {
                  const maxCount = compPresence[0]?.count ?? 1
                  const pct      = maxCount > 0 ? Math.round((cp.count / maxCount) * 100) : 0
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="font-mono w-4 shrink-0 text-right" style={{ fontSize: 11, color: 'var(--nd-text-muted)' }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1" style={{ fontSize: 'var(--font-sm)' }}>
                          <span className="truncate font-medium" style={{ color: 'var(--nd-text-primary)' }}>{cp.name}</span>
                          <span className="ml-2 shrink-0 tabular-nums font-medium" style={{ color: 'var(--nd-text-secondary)' }}>{cp.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `hsl(${220 + i * 20}, 70%, 55%)`, opacity: 0.75 }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </SectionCard>
      </div>

      {/* ── 6. Brand Presence by Topics ── */}
      <SectionCard
        title="Brand Presence by Topics"
        description="Your brand's mention rate per content topic — how visible you are in each area of your market."
        onClick={() => onNavigate?.('visibility-comparision')}
        actionLabel="Explore topics"
        actionIcon={ArrowUpRight}
      >
        {topicPresence.length > 0 ? (
          <div>
            <div style={{ height: Math.max(180, topicPresence.length * 36) }} className="w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topicPresence}
                  layout="vertical"
                  margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
                  barSize={18}
                  onClick={() => onNavigate?.('visibility-comparision')}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--nd-border)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--nd-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                  <YAxis type="category" dataKey="topic" tick={{ fill: 'var(--nd-text-secondary)', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} width={130} tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + '…' : v} />
                  <RechartsTooltip
                    contentStyle={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)', borderRadius: '10px', fontSize: 12, padding: '6px 12px' }}
                    formatter={(value: number, _name: string, props: any) => [`${value}% (${props.payload?.present ?? 0}/${props.payload?.total ?? 0} prompts)`, 'Brand Presence']}
                    labelStyle={{ color: 'var(--nd-text-secondary)', fontSize: 11, fontWeight: 600 }}
                    cursor={{ fill: 'rgba(83,71,206,0.04)' }}
                  />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, fill: 'var(--nd-text-muted)', formatter: (v: number) => `${v}%` }}>
                    {topicPresence.map((_, idx) => (
                      <Cell key={idx} fill={TOPIC_BAR_COLORS[idx % TOPIC_BAR_COLORS.length]} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-center" style={{ fontSize: 11, color: 'var(--nd-text-muted)' }}>
              Click chart to explore topic-level visibility in the full comparison view
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10">
            <BarChart2 className="w-8 h-8 mb-3" style={{ color: 'var(--nd-text-muted)' }} />
            <p className="text-center" style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>
              No topic data yet — complete brand onboarding with topics &amp; prompts
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── 7. Background Crawl panel ── */}
      {crawlStatusSlot && crawlStatusSlot}
    </div>
  )
}

