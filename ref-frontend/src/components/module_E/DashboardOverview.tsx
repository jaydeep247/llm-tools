'use client'

import { type ReactNode, useState, useMemo } from 'react'
import { useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'
import { useGetAllModuleCResultsQuery, useGetModuleCResultQuery } from '@/store/api/module_C/moduleCApi'
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
  Loader2,
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
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const MODEL_META: Record<string, { label: string; color: string }> = {
  chat_gpt: { label: 'ChatGPT', color: '#10a37f' },
  gemini:   { label: 'Gemini',  color: '#4285f4' },
  claude:   { label: 'Claude',  color: '#d97706' },
}
const MODEL_KEYS = ['chat_gpt', 'gemini', 'claude'] as const

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  negative: '#ef4444',
  neutral:  '#6b7280',
}

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

interface DashboardOverviewProps {
  jobId?: string | null
  url?: string
  onNavigate?: (tab: string) => void
  /** Rendered at the bottom when a background crawl is active */
  crawlStatusSlot?: ReactNode
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SentimentBadge({ label }: { label?: string }) {
  if (!label) return null
  const map: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    positive: { bg: 'bg-emerald-500/10 border border-emerald-500/20', text: 'text-emerald-400', icon: TrendingUp },
    negative: { bg: 'bg-rose-500/10 border border-rose-500/20',       text: 'text-rose-400',    icon: TrendingDown },
    neutral:  { bg: 'bg-zinc-500/10 border border-zinc-500/20',       text: 'text-zinc-400',    icon: Minus },
  }
  const s = map[label.toLowerCase()] ?? map.neutral
  const SIcon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      <SIcon className="h-3 w-3" />
      {label}
    </span>
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

  /* Module C — for AI Visibility Trend (per-model friendliness scores over time) */
  const { data: moduleCAllData } = useGetAllModuleCResultsQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  /* Module C — current single result (same source as Model Comparison tab) */
  const { data: moduleCCurrentData } = useGetModuleCResultQuery(
    { jobId: jobId ?? '', url },
    { skip: !jobId, refetchOnMountOrArgChange: true },
  )

  /** Which LLM line is highlighted in the trend chart (null = show all) */
  const [selectedModel, setSelectedModel] = useState<string | null>(null)

  const d = moduleEResponse?.data

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-48 mb-2 rounded-lg bg-zinc-800/50 animate-pulse" />
          <div className="h-4 w-72 rounded-lg bg-zinc-800/50 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-zinc-800 bg-[#111113] p-5">
              <div className="h-10 w-10 rounded-xl mb-4 bg-zinc-800/50 animate-pulse" />
              <div className="h-8 w-20 mb-2 rounded bg-zinc-800/50 animate-pulse" />
              <div className="h-3 w-full rounded bg-zinc-800/50 animate-pulse" />
              <div className="h-3 w-3/4 mt-1 rounded bg-zinc-800/50 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-[#111113] p-3 sm:p-4">
              <div className="h-3 w-16 mb-2 rounded bg-zinc-800/50 animate-pulse" />
              <div className="h-7 w-14 rounded bg-zinc-800/50 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
          <div className="p-5 border-b border-zinc-800">
            <div className="h-5 w-40 rounded bg-zinc-800/50 animate-pulse" />
          </div>
          <div className="h-55 bg-zinc-800/20 animate-pulse" />
        </div>
      </div>
    )
  }

  if (!d) {
    return (
      <AnalysisEmptyState
        icon={<Brain className="w-8 h-8 text-zinc-400" />}
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

  /* ── Per-model citation stats (mirrors TrendsByModelSection) ── */
  const perModelStats: Record<string, { citedRate: number; avgRank: number | null }> = {}
  for (const key of MODEL_KEYS) {
    const rows   = rankingRows.filter((r) => r.model === key)
    const cited  = rows.filter((r) => r.citation_matched).length
    const ranked = rows.filter((r) => typeof r.position === 'number' && r.position > 0)
    perModelStats[key] = {
      citedRate: rows.length > 0 ? (cited / rows.length) * 100 : 0,
      avgRank:   ranked.length > 0 ? ranked.reduce((s, r) => s + r.position!, 0) / ranked.length : null,
    }
  }

  /* ── Deltas ── */
  // SOV delta from the last two ai_sov_history entries
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

  /* ── Module C: current per-model scores (exact same data as Model Comparison page) ── */
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

  /* ── Most cited domains ── */
  const citedDomains  = compLandscape?.top_referring_domains ?? []
  const totalRefCount = citedDomains.reduce((sum, item) => sum + item.count, 0)

  const FIELD_DESCRIPTIONS: Record<string, string> = {
    'Brand Mentions':      'How many times your brand was mentioned across the prompts we checked.',
    'AI Share of Voice':   'How much of the AI conversation is about you vs competitors (higher is better).',
    'Competitors Tracked': 'How many competitor brands/domains were included in this run.',
    'Avg. Ranking':        'Average citation position when your URL was formally cited. Text-only mentions without a link do not count. Click to see per-model breakdown.',
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-white">Dashboard</h2>
        <p className="text-xs sm:text-sm text-zinc-500 mt-1">
          Quick overview of AI visibility for{' '}
          <span className="text-zinc-300 font-medium">{brandName}</span>
          {url && (
            <>
              {' · '}
              <span className="text-zinc-400">{url}</span>
            </>
          )}
        </p>
      </div>

      {/* ── 1. KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Brand Mentions"
          value={totalMentions}
          subtext={sentimentLabel ? `Sentiment: ${sentimentLabel}` : undefined}
          delta={mentionsDelta}
          deltaLabel="vs last period"
          description={FIELD_DESCRIPTIONS['Brand Mentions']}
          icon={MessageSquare}
          accent="blue"
          onClick={() => onNavigate?.('prompt-difficulty')}
        />
        <StatCard
          label="AI Share of Voice"
          value={`${overallSov}%`}
          subtext={visibilityTier}
          delta={sovDelta}
          deltaLabel="vs last snapshot"
          description={FIELD_DESCRIPTIONS['AI Share of Voice']}
          icon={Eye}
          accent="cyan"
          onClick={() => onNavigate?.('share-of-voice')}
        />
        <StatCard
          label="Competitors Tracked"
          value={competitorCount}
          subtext={competitors?.overall_sov != null ? `Market SOV: ${competitors.overall_sov}%` : undefined}
          delta={null}
          description={FIELD_DESCRIPTIONS['Competitors Tracked']}
          icon={Users}
          accent="amber"
          onClick={() => onNavigate?.('visibility-comparision')}
        />
        <StatCard
          label="Avg. Ranking"
          value={avgRankingValue}
          subtext={rankingSubtext}
          description={FIELD_DESCRIPTIONS['Avg. Ranking']}
          icon={Award}
          accent="emerald"
          onClick={() => onNavigate?.('trends-by-model')}
        />
      </div>

      {/* ── 2. Per-LLM Strip ── */}
      <div className="grid grid-cols-3 gap-3">
        {MODEL_KEYS.map((key) => {
          const meta      = MODEL_META[key]
          const modelData = byModel[key]
          const sovVal    = modelData?.sov ?? null
          const isActive  = selectedModel === key
          const modelDelta: number | null = sovHistory.length >= 2
            ? (sovHistory[sovHistory.length - 1].by_model?.[key]?.sov ?? 0) -
              (sovHistory[sovHistory.length - 2].by_model?.[key]?.sov ?? 0)
            : null
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedModel(selectedModel === key ? null : key)}
              className={cn(
                'rounded-xl border p-3 sm:p-4 text-left transition-all duration-200',
                'flex flex-col gap-1.5 min-w-0',
                isActive
                  ? 'border-zinc-600 bg-zinc-800/60 shadow-md'
                  : 'border-zinc-800 bg-[#111113] hover:border-zinc-700 hover:bg-zinc-900/60',
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider truncate">
                  {meta.label}
                </span>
                {isActive && <span className="text-[10px] text-zinc-600 shrink-0">filtered</span>}
              </div>

              {hasModuleCData ? (
                /* ── Module C view: mirrors Model Comparison per-model row ── */
                <>
                  {/* Avg of Accuracy + Completeness + Friendliness = primary big number */}
                  <p className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: meta.color }}>
                    {Math.round((moduleCPerModel[key].accuracy + moduleCPerModel[key].completeness + moduleCPerModel[key].friendliness) / 3)}
                  </p>
                  {/* Accuracy + Completeness + Friendliness row */}
                  <div className="flex items-center gap-1 mt-0.5">
                    {([
                      { label: 'Acc',  val: moduleCPerModel[key].accuracy,     color: '#3b82f6' },
                      { label: 'Comp', val: moduleCPerModel[key].completeness,  color: '#10b981' },
                      { label: 'Fri',  val: moduleCPerModel[key].friendliness,  color: '#8b5cf6' },
                    ] as const).map(({ label, val, color }) => (
                      <div key={label} className="flex-1 text-center bg-zinc-800/50 rounded-lg py-1 px-0.5">
                        <div className="text-[9px] text-zinc-500 mb-0.5">{label}</div>
                        <div className="text-[11px] font-bold tabular-nums" style={{ color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {/* SOV as a small secondary below */}
                  {sovVal != null && (
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
                      <span>SOV</span>
                      <span className="tabular-nums">{sovVal}%</span>
                    </div>
                  )}
                </>
              ) : (
                /* ── Fallback: SOV only (no Module C data yet) ── */
                <>
                  <p className="text-xl sm:text-2xl font-bold tabular-nums" style={{ color: meta.color }}>
                    {sovVal != null ? `${sovVal}%` : '—'}
                  </p>
                  {modelDelta !== null && (
                    <span
                      className={cn(
                        'text-[10px] font-medium',
                        modelDelta > 0 && 'text-emerald-400',
                        modelDelta < 0 && 'text-rose-400',
                        modelDelta === 0 && 'text-zinc-500',
                      )}
                    >
                      {modelDelta > 0 ? '↑' : modelDelta < 0 ? '↓' : '→'}
                      {modelDelta > 0 ? '+' : ''}{modelDelta.toFixed(1)}%
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* ── 3. AI Visibility by LLM (Module C Model Comparison — with SOV fallback) ── */}
      <SectionCard
        title="AI Visibility by LLM"
        description={
          trendSource === 'module_c'
            ? trendData.length >= 2
              ? 'Per-model AI visibility trend from AI Intelligence. Score = citation rate bucket (5–100). Run AI Intelligence again to add data points.'
              : 'Current per-model AI visibility from AI Intelligence. Run analysis multiple times to see trends over time.'
            : 'AI Share of Voice per LLM. Run AI Intelligence (Module C) for richer per-model visibility scores.'
        }
        onClick={() => onNavigate?.('model-comparison')}
        actionLabel="View details"
        actionIcon={ArrowUpRight}
      >
        {/* ── Chart area ── */}
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
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false} tickLine={false}
                      tickFormatter={fmtValue}
                      domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={44}
                    />
                    <RechartsTooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: 12, padding: '8px 12px' }}
                      labelStyle={{ color: '#a1a1aa', fontSize: 11, marginBottom: 4 }}
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
                          stroke={meta.color} strokeWidth={visible ? 3 : 1.5} strokeOpacity={visible ? 1 : 0.2}
                          dot={(props: any) => {
                            const { cx, cy, value } = props
                            if (value == null) return <g key={props.key} />
                            return <circle key={props.key} cx={cx} cy={cy} r={visible ? 5 : 3}
                              fill={meta.color} fillOpacity={visible ? 1 : 0.2}
                              stroke={visible ? '#18181b' : 'none'} strokeWidth={visible ? 2 : 0} />
                          }}
                          activeDot={{ r: 7, strokeWidth: 2, stroke: '#18181b' }}
                          connectNulls
                        />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
                {!selectedHasData && selectedModel && (
                  <p className="text-[11px] text-zinc-600 mt-1">
                    No data for {MODEL_META[selectedModel]?.label ?? selectedModel} — showing all models
                  </p>
                )}
              </div>
            )
          })()
        ) : trendData.length === 1 || hasModuleCData || snapshotBarData.some((d) => d.Friendliness > 0) ? (
          /* Snapshot grouped bar chart — mirrors Model Comparison "Per-Model Score Comparison" */
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={snapshotBarData}
                barCategoryGap="25%"
                barGap={4}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
                  tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => String(v)}
                  width={32}
                />
                <RechartsTooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: 12, padding: '8px 12px' }}
                  labelStyle={{ color: '#a1a1aa', fontSize: 11, marginBottom: 4 }}
                  formatter={(value: number, name: string) => [String(Math.round(Number(value))), name]}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
                <Bar key="Accuracy"     dataKey="Accuracy"     fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar key="Completeness" dataKey="Completeness" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar key="Friendliness" dataKey="Friendliness" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {trendData.length <= 1 && (
              <p className="text-[11px] text-zinc-600 mt-1 text-center">
                {hasModuleCData
                  ? 'Single snapshot — run AI Intelligence again to build a trend'
                  : 'Based on current SOV — run AI Intelligence for citation-based scores'}
              </p>
            )}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center">
            <p className="text-sm text-zinc-600 text-center max-w-70 leading-relaxed">
              Run AI Intelligence analysis to see per-model visibility scores here
            </p>
          </div>
        )}
        {/* Source badge */}
        <div className="flex justify-end mt-2">
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full border',
            trendSource === 'module_c'
              ? 'text-violet-400 border-violet-500/20 bg-violet-500/10'
              : 'text-zinc-500 border-zinc-700/50 bg-zinc-800/30',
          )}>
            {trendSource === 'module_c' ? 'AI Intelligence (C9)' : 'SOV History'}
          </span>
        </div>
      </SectionCard>

      {/* ── 4. Brand Analysis (donut) | Competitor Landscape ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Brand Analysis */}
        <SectionCard
          title="Brand Analysis"
          description="Understand how your brand is discussed across AI-visible sources, including mention volume, sentiment mix, and trend direction."
          onClick={() => onNavigate?.('prompt-difficulty')}
          actionLabel="View details"
          actionIcon={ArrowUpRight}
        >
          {brand ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">Overall Sentiment</span>
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
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: SENTIMENT_COLORS[key] }}
                          />
                          <span className="text-zinc-400 w-14">{label}</span>
                          <span className="text-white font-semibold tabular-nums">{val}</span>
                          <span className="text-zinc-600">({pct}%)</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(['positive', 'negative', 'neutral'] as const).map((key) => (
                    <div key={key} className="rounded-xl bg-zinc-800/30 border border-zinc-800/60 py-2.5">
                      <p className="text-base font-semibold text-white">
                        {brand.sentiment?.counts?.[key] ?? 0}
                      </p>
                      <p className="text-[10px] text-zinc-500 capitalize">{key}</p>
                    </div>
                  ))}
                </div>
              )}

              {brand.top_sources && brand.top_sources.length > 0 && (
                <div>
                  <p className="text-[11px] text-zinc-500 mb-1.5">Top Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {brand.top_sources.slice(0, 5).map((src, i) => (
                      <span
                        key={i}
                        className="rounded-lg bg-zinc-800/40 border border-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-400"
                      >
                        {src.domain}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">Not yet available</p>
          )}
        </SectionCard>

        {/* Competitor Landscape with rank deltas */}
        <SectionCard
          title="Competitor Landscape"
          description="Track which competitors are appearing in AI conversations, how often they are mentioned, and the tone around them."
          onClick={() => onNavigate?.('prompt-difficulty')}
          actionLabel="View details"
          actionIcon={ArrowUpRight}
        >
          {competitors?.data && competitors.data.length > 0 ? (
            <div className="space-y-2">
              {competitors.data.slice(0, 5).map((comp, i) => {
                const trend = (comp as any).trend as number[] | undefined
                const rankDelta: number | null =
                  trend && trend.length >= 2
                    ? trend[trend.length - 1] - trend[trend.length - 2]
                    : null
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl bg-zinc-900/20 border border-zinc-800/60 px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[10px] font-mono font-medium text-zinc-600 w-4">{i + 1}</span>
                      <span className="text-sm text-zinc-300 truncate">{comp.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rankDelta !== null && (
                        <span
                          className={cn(
                            'text-[10px] font-semibold tabular-nums',
                            rankDelta > 0 ? 'text-emerald-400' : rankDelta < 0 ? 'text-rose-400' : 'text-zinc-500',
                          )}
                        >
                          {rankDelta > 0 ? `↑${rankDelta}` : rankDelta < 0 ? `↓${Math.abs(rankDelta)}` : '—'}
                        </span>
                      )}
                      <span className="text-xs text-zinc-500">{comp.mentions} mentions</span>
                      <SentimentBadge label={comp.sentiment} />
                    </div>
                  </div>
                )
              })}
              {competitors.data.length > 5 && (
                <p className="text-[11px] text-zinc-600 text-center pt-1">
                  +{competitors.data.length - 5} more competitors
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">No competitor data yet</p>
          )}
        </SectionCard>
      </div>

      {/* ── 5. AI Share of Voice (3 labelled bars) | Most Cited Domains ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* AI Share of Voice */}
        <SectionCard
          title="AI Share of Voice"
          description="Compare your brand's mention share against competitors across OpenAI, Gemini, and Claude."
          onClick={() => onNavigate?.('share-of-voice')}
          actionLabel="View details"
          actionIcon={ArrowUpRight}
        >
          {sov ? (
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white tabular-nums">{overallSov}%</span>
                <span className="text-xs text-zinc-500">overall share of voice</span>
              </div>
              <div className="space-y-3.5">
                {MODEL_KEYS.map((key) => {
                  const meta      = MODEL_META[key]
                  const modelData = byModel[key]
                  if (!modelData) return null
                  const pct = modelData.sov ?? 0
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">{meta.label}</span>
                        <span className="font-semibold tabular-nums" style={{ color: meta.color }}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-800/60 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(pct, 100)}%`, background: meta.color }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {sov.brand_known_by_models && sov.brand_known_by_models.length > 0 && (
                <div>
                  <p className="text-[11px] text-zinc-500 mb-1.5">Known by</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sov.brand_known_by_models.map((model, i) => (
                      <span
                        key={i}
                        className="rounded-lg bg-zinc-800 border border-zinc-700/50 px-2.5 py-0.5 text-[11px] text-zinc-300"
                      >
                        {MODEL_META[model]?.label ?? model}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">Not yet available</p>
          )}
        </SectionCard>

        {/* Most Cited Domains */}
        <SectionCard
          title="Most Cited Domains"
          description="Top referring domains in your competitive landscape — a proxy for AI citation authority."
        >
          {citedDomains.length > 0 ? (
            <div className="space-y-2.5">
              {citedDomains.slice(0, 6).map((domain, i) => {
                const pct = totalRefCount > 0 ? Math.round((domain.count / totalRefCount) * 100) : 0
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-zinc-600 w-4 shrink-0 text-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-300 truncate">{domain.name}</span>
                        <span className="text-zinc-400 ml-2 shrink-0 tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-zinc-800/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500/60 transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Globe className="h-8 w-8 text-zinc-700 mb-3" />
              <p className="text-xs text-zinc-600 max-w-55 leading-relaxed">
                No citation data yet — citations appear once LLMs reference your tracked pages
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── 6. Background crawl panel — only when active ── */}
      {crawlStatusSlot && (
        <div>{crawlStatusSlot}</div>
      )}
    </div>
  )
}

