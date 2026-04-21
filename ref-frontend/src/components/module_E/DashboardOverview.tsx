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

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const MODEL_META: Record<string, { label: string; color: string; bg: string }> = {
  chat_gpt: { label: 'ChatGPT', color: 'var(--nd-blue)', bg: 'var(--nd-purple-subtle)' },
  gemini:   { label: 'Gemini',  color: 'var(--nd-emerald)', bg: 'var(--nd-purple-subtle)' },
  claude:   { label: 'Claude',  color: 'var(--nd-purple)', bg: 'var(--nd-purple-subtle)' },
}
const MODEL_KEYS = ['chat_gpt', 'gemini', 'claude'] as const

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#059669', // Emerald-600
  negative: '#dc2626', // Rose-600
  neutral:  '#6b7280', // Gray-500
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
          <div className="h-7 w-48 mb-2 rounded-lg animate-pulse" style={{ background: 'var(--nd-border)' }} />
          <div className="h-4 w-72 rounded-lg animate-pulse" style={{ background: 'var(--nd-border)' }} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border p-5" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
              <div className="h-10 w-10 rounded-xl mb-4 animate-pulse" style={{ background: 'var(--nd-border)' }} />
              <div className="h-8 w-20 mb-2 rounded animate-pulse" style={{ background: 'var(--nd-border)' }} />
              <div className="h-3 w-full rounded animate-pulse" style={{ background: 'var(--nd-border)' }} />
              <div className="h-3 w-3/4 mt-1 rounded animate-pulse" style={{ background: 'var(--nd-border)' }} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border p-3 sm:p-4" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
              <div className="h-3 w-16 mb-2 rounded animate-pulse" style={{ background: 'var(--nd-border)' }} />
              <div className="h-7 w-14 rounded animate-pulse" style={{ background: 'var(--nd-border)' }} />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
          <div className="p-5 border-b" style={{ borderColor: 'var(--nd-border)' }}>
            <div className="h-5 w-40 rounded animate-pulse" style={{ background: 'var(--nd-border)' }} />
          </div>
          <div className="h-55 animate-pulse" style={{ background: 'var(--nd-bg)' }} />
        </div>
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
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
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
              className="rounded-xl border p-3 sm:p-4 text-left transition-all duration-200 flex flex-col gap-2 min-w-0 cursor-pointer"
              style={{
                borderColor: isActive ? 'var(--nd-purple)' : 'var(--nd-border)',
                background: isActive ? 'var(--nd-purple-subtle)' : 'var(--nd-card-bg)',
                boxShadow: isActive ? '0 1px 4px rgba(83,71,206,0.08)' : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-1">
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--nd-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="truncate">
                  {meta.label}
                </span>
                {isActive && <span style={{ fontSize: 10, color: 'var(--nd-purple)' }} className="shrink-0">filtered</span>}
              </div>

              {hasModuleCData ? (
                <>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--nd-text-primary)' }}>
                    {Math.round((moduleCPerModel[key].accuracy + moduleCPerModel[key].completeness + moduleCPerModel[key].friendliness) / 3)}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {([
                      { label: 'Acc',  val: moduleCPerModel[key].accuracy,     color: 'var(--nd-blue)' },
                      { label: 'Comp', val: moduleCPerModel[key].completeness,  color: '#059669' },
                      { label: 'Fri',  val: moduleCPerModel[key].friendliness,  color: 'var(--nd-purple)' },
                    ] as const).map(({ label, val, color }) => (
                      <div key={label} className="flex-1 text-center rounded-lg py-1.5 px-1" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--nd-text-primary)', marginBottom: 2 }}>{label}</div>
                        <div className="font-semibold tabular-nums" style={{ fontSize: 13, color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {sovVal != null && (
                    <div className="flex items-center justify-between" style={{ fontSize: 12, color: 'var(--nd-text-primary)' }}>
                      <span style={{ fontWeight: 500 }}>SOV</span>
                      <span className="tabular-nums font-bold" style={{ color: 'var(--nd-text-primary)' }}>{sovVal}%</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--nd-text-primary)' }}>
                    {sovVal != null ? `${sovVal}%` : '—'}
                  </p>
                  {modelDelta !== null && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: modelDelta > 0 ? '#059669' : modelDelta < 0 ? '#ef4444' : 'var(--nd-text-muted)',
                      }}
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
                          stroke={meta.color} strokeWidth={visible ? 3 : 1.5} strokeOpacity={visible ? 1 : 0.2}
                          dot={(props: any) => {
                            const { cx, cy, value } = props
                            if (value == null) return <g key={props.key} />
                            return <circle key={props.key} cx={cx} cy={cy} r={visible ? 5 : 3}
                              fill={meta.color} fillOpacity={visible ? 1 : 0.2}
                              stroke={visible ? '#ffffff' : 'none'} strokeWidth={visible ? 2 : 0} />
                          }}
                          activeDot={{ r: 7, strokeWidth: 2, stroke: '#ffffff' }}
                          connectNulls
                        />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
                {!selectedHasData && selectedModel && (
                  <p style={{ fontSize: 12, color: 'var(--nd-text-secondary)', marginTop: 4 }}>
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
        {/* Source badge */}
        <div className="flex justify-end mt-2">
          <span
            className="px-2 py-0.5 rounded-full border"
            style={{
              fontSize: 11,
              color: trendSource === 'module_c' ? 'var(--nd-purple)' : 'var(--nd-text-secondary)',
              borderColor: trendSource === 'module_c' ? 'rgba(83,71,206,0.2)' : 'var(--nd-border)',
              background: trendSource === 'module_c' ? 'var(--nd-purple-subtle)' : 'var(--nd-bg)',
            }}
          >
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
                    className="flex items-center justify-between rounded-xl px-3.5 py-3"
                    style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono font-medium w-5 shrink-0" style={{ fontSize: 11, color: 'var(--nd-text-muted)' }}>{i + 1}</span>
                      <span className="truncate font-medium" style={{ fontSize: 'var(--font-base)', color: 'var(--nd-text-primary)' }}>{comp.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rankDelta !== null && (
                        <span
                          className="font-semibold tabular-nums"
                          style={{
                            fontSize: 11,
                            color: rankDelta > 0 ? '#059669' : rankDelta < 0 ? '#ef4444' : 'var(--nd-text-muted)',
                          }}
                        >
                          {rankDelta > 0 ? `↑${rankDelta}` : rankDelta < 0 ? `↓${Math.abs(rankDelta)}` : '—'}
                        </span>
                      )}
                      <span style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>{comp.mentions} mentions</span>
                      <SentimentBadge label={comp.sentiment} />
                    </div>
                  </div>
                )
              })}
              {competitors.data.length > 5 && (
                <p style={{ fontSize: 12, color: 'var(--nd-text-secondary)', textAlign: 'center', paddingTop: 4 }}>
                  +{competitors.data.length - 5} more competitors
                </p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>No competitor data yet</p>
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
                <span className="text-3xl font-bold tabular-nums" style={{ color: 'var(--nd-text-primary)' }}>{overallSov}%</span>
                <span style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>overall share of voice</span>
              </div>
              <div className="space-y-3.5">
                {MODEL_KEYS.map((key) => {
                  const meta      = MODEL_META[key]
                  const modelData = byModel[key]
                  if (!modelData) return null
                  const pct = modelData.sov ?? 0
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between" style={{ fontSize: 'var(--font-sm)' }}>
                        <span style={{ color: 'var(--nd-text-primary)', fontWeight: 500 }}>{meta.label}</span>
                        <span className="font-bold tabular-nums" style={{ color: 'var(--nd-text-primary)' }}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(pct, 100)}%`, background: 'var(--nd-purple)' }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {sov.brand_known_by_models && sov.brand_known_by_models.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--nd-text-secondary)', marginBottom: 6 }}>Known by</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sov.brand_known_by_models.map((model, i) => (
                      <span
                        key={i}
                        className="rounded-lg px-2.5 py-0.5"
                        style={{ fontSize: 12, background: 'var(--nd-bg)', border: '1px solid var(--nd-border)', color: 'var(--nd-text-secondary)', fontWeight: 500 }}
                      >
                        {MODEL_META[model]?.label ?? model}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>Not yet available</p>
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
                    <span className="font-mono w-5 shrink-0 text-right" style={{ fontSize: 12, color: 'var(--nd-text-secondary)' }}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5" style={{ fontSize: 'var(--font-sm)' }}>
                        <span className="truncate font-medium" style={{ color: 'var(--nd-text-primary)' }}>{domain.name}</span>
                        <span className="ml-2 shrink-0 tabular-nums font-medium" style={{ color: 'var(--nd-text-secondary)' }}>{pct}%</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: 'var(--nd-purple)' }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Globe className="h-8 w-8 mb-3" style={{ color: 'var(--nd-text-muted)' }} />
              <p className="max-w-55 leading-relaxed" style={{ fontSize: 'var(--font-sm)', color: 'var(--nd-text-secondary)' }}>
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

