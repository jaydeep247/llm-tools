'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  Search,
  Plus,
  Trash2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Zap,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Crown,
  FileText,
  HelpCircle,
  Image,
  Video,
  Newspaper,
  MapPin,
  Link2,
  ShoppingBag,
  MessageSquare,
  BookOpen,
  ArrowUpRight,
  Loader2,
  Target,
  Activity,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useGetSerpResultQuery,
  useGetSessionSerpResultsQuery,
  useRunSerpAnalyzerMutation,
  type SerpAnalyzerResult,
  type KeywordSerpResult,
  type ContentGap,
} from '@/store/api/module_A/moduleAApi'

// ── Constants ──────────────────────────────────────────────────────────────

const FEATURE_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  featured_snippet: {
    label: 'Featured Snippet',
    icon: <Crown className="w-3.5 h-3.5" />,
    color: 'text-amber-400',
  },
  answer_box: {
    label: 'Answer Box',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    color: 'text-emerald-400',
  },
  people_also_ask: {
    label: 'People Also Ask',
    icon: <HelpCircle className="w-3.5 h-3.5" />,
    color: 'text-blue-400',
  },
  knowledge_graph: {
    label: 'Knowledge Panel',
    icon: <BookOpen className="w-3.5 h-3.5" />,
    color: 'text-violet-400',
  },
  local_pack: {
    label: 'Local Pack',
    icon: <MapPin className="w-3.5 h-3.5" />,
    color: 'text-rose-400',
  },
  image_carousel: {
    label: 'Image Carousel',
    icon: <Image className="w-3.5 h-3.5" />,
    color: 'text-cyan-400',
  },
  video_carousel: {
    label: 'Video Carousel',
    icon: <Video className="w-3.5 h-3.5" />,
    color: 'text-orange-400',
  },
  news_box: {
    label: 'News Box',
    icon: <Newspaper className="w-3.5 h-3.5" />,
    color: 'text-sky-400',
  },
  sitelinks: {
    label: 'Sitelinks',
    icon: <Link2 className="w-3.5 h-3.5" />,
    color: 'text-indigo-400',
  },
  paid: {
    label: 'Ads',
    icon: <ShoppingBag className="w-3.5 h-3.5" />,
    color: 'text-yellow-400',
  },
  shopping: {
    label: 'Shopping',
    icon: <ShoppingBag className="w-3.5 h-3.5" />,
    color: 'text-lime-400',
  },
  twitter: {
    label: 'Twitter / X',
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    color: 'text-sky-300',
  },
  top_stories: {
    label: 'Top Stories',
    icon: <Newspaper className="w-3.5 h-3.5" />,
    color: 'text-sky-400',
  },
  find_results_on: {
    label: 'Find Results On',
    icon: <Globe className="w-3.5 h-3.5" />,
    color: 'text-zinc-400',
  },
}

const LOCATION_OPTIONS = [
  { value: 2840, label: '🇺🇸 United States' },
  { value: 2826, label: '🇬🇧 United Kingdom' },
  { value: 2036, label: '🇦🇺 Australia' },
  { value: 2124, label: '🇨🇦 Canada' },
  { value: 2276, label: '🇩🇪 Germany' },
  { value: 2250, label: '🇫🇷 France' },
  { value: 2356, label: '🇮🇳 India' },
]

const RANK_COLOR = (rank: number | null) => {
  if (!rank) return 'text-zinc-500'
  if (rank <= 3) return 'text-emerald-400'
  if (rank <= 10) return 'text-blue-400'
  if (rank <= 20) return 'text-amber-400'
  return 'text-zinc-400'
}

// ── Component ──────────────────────────────────────────────────────────────

interface SerpAnalyzerProps {
  jobId: string | null | undefined   // crawl job — used for POST /run
  sessionId: string                  // used to fetch existing results
}

type Tab = 'overview' | 'rankings' | 'features' | 'paa' | 'competitors' | 'gaps' | 'volatility'

export function SerpAnalyzer({ jobId, sessionId }: SerpAnalyzerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // ── New-run form state ──────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [newKeyword, setNewKeyword] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [newCompetitor, setNewCompetitor] = useState('')
  const [competitors, setCompetitors] = useState<string[]>([])
  const [locationCode, setLocationCode] = useState(2840)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null)

  // Track the new SERP job after dispatching, so we can poll for results
  const [pendingSerpJobId, setPendingSerpJobId] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  // ── RTK Query ──────────────────────────────────────────────────────────
  // 1. Load latest existing results for this session on mount
  const {
    data: sessionResults,
    isLoading: isLoadingSession,
    isFetching: isFetchingSession,
    refetch: refetchSession,
  } = useGetSessionSerpResultsQuery(sessionId, { skip: !sessionId })

  // 2. After running a new job, poll by jobId until result lands
  const { data: newJobResult } = useGetSerpResultQuery(pendingSerpJobId!, {
    skip: !pendingSerpJobId,
    pollingInterval: pendingSerpJobId ? 2000 : 0,
  })

  // Stop polling once result arrives
  useEffect(() => {
    if (isPolling && newJobResult?.data) {
      setIsPolling(false)
      refetchSession()
    }
  }, [newJobResult, isPolling, refetchSession])

  const [runSerpAnalyzer, { isLoading: isDispatching }] = useRunSerpAnalyzerMutation()

  // Fresh poll result takes priority over session history
  const result: SerpAnalyzerResult | null =
    newJobResult?.data ?? sessionResults?.data?.[0] ?? null

  const isLoadingInitial = isLoadingSession && !result
  const isJobRunning = isPolling && !newJobResult?.data

  // ── Derived data ───────────────────────────────────────────────────────
  const summary = result?.summary
  const gaps = result?.content_gaps ?? []
  const kwResults = result?.keyword_results ?? []

  const featurePresenceMap = useMemo(() => {
    const map: Record<string, number> = {}
    kwResults.forEach((kw) => {
      Object.entries(kw.features).forEach(([ft, feat]) => {
        if (feat.present) map[ft] = (map[ft] ?? 0) + 1
      })
    })
    return map
  }, [kwResults])

  // ── Handlers ───────────────────────────────────────────────────────────
  const addKeyword = () => {
    const kw = newKeyword.trim()
    if (kw && !keywords.includes(kw)) {
      setKeywords((prev) => [...prev, kw])
    }
    setNewKeyword('')
  }

  const removeKeyword = (kw: string) => setKeywords((prev) => prev.filter((k) => k !== kw))

  const addCompetitor = () => {
    const c = newCompetitor.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (c && !competitors.includes(c)) setCompetitors((prev) => [...prev, c])
    setNewCompetitor('')
  }

  const removeCompetitor = (c: string) =>
    setCompetitors((prev) => prev.filter((x) => x !== c))

  const handleRun = async () => {
    if (!jobId || !keywords.length) return
    setRunError(null)
    try {
      const res = await runSerpAnalyzer({
        jobId,
        sessionId,
        body: { keywords, competitors, locationCode, device },
      }).unwrap()
      setPendingSerpJobId(res.data?.jobId ?? null)
      setIsPolling(true)
      setShowForm(false)
      setKeywords([])
      setCompetitors([])
    } catch (err: any) {
      setRunError(err?.data?.message ?? 'Failed to start analysis. Please try again.')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (!jobId) {
    return (
      <EmptyState message="No crawl job found. Run a crawl first, then come back to analyze your SERP rankings." />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-rose-400" />
            SERP Analyzer
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Track keyword rankings, SERP features, and competitor positions via DataForSEO
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {result && (
            <button
              onClick={() => refetchSession()}
              disabled={isFetchingSession || isJobRunning}
              title="Refresh"
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={cn('w-3 h-3', isFetchingSession && 'animate-spin')} />
              Refresh
            </button>
          )}
          <button
            onClick={() => { setShowForm((v) => !v); setRunError(null) }}
            className="flex items-center gap-1.5 text-xs font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Analysis
          </button>
        </div>
      </div>

      {/* Job-running banner */}
      {isJobRunning && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-300">Analysis in progress…</p>
            <p className="text-xs text-zinc-500 mt-0.5">DataForSEO is fetching SERP data. This usually takes 15–30 seconds.</p>
          </div>
        </div>
      )}

      {/* Error banner */}
      {runError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 flex-1">{runError}</p>
          <button onClick={() => setRunError(null)} className="cursor-pointer text-zinc-500 hover:text-zinc-300">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* New-run form */}
      {showForm && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-5">
          <h3 className="text-sm font-semibold text-white">Configure SERP Analysis</h3>

          {/* Keywords */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Keywords to Track <span className="text-rose-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                placeholder="e.g. best seo tools"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-600 px-3 py-2 focus:outline-none focus:border-rose-500/50 transition-colors"
              />
              <button
                onClick={addKeyword}
                disabled={!newKeyword.trim()}
                className="cursor-pointer bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm transition-colors shrink-0"
              >
                Add
              </button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {keywords.map((kw) => (
                  <span
                    key={kw}
                    className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-full px-2.5 py-1"
                  >
                    {kw}
                    <button
                      onClick={() => removeKeyword(kw)}
                      className="cursor-pointer text-zinc-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {!keywords.length && (
              <p className="text-xs text-zinc-600">Press Enter or click Add after each keyword</p>
            )}
          </div>

          {/* Competitors */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Competitor Domains <span className="text-zinc-600 normal-case font-normal">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                value={newCompetitor}
                onChange={(e) => setNewCompetitor(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCompetitor())}
                placeholder="e.g. ahrefs.com"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-600 px-3 py-2 focus:outline-none focus:border-rose-500/50 transition-colors"
              />
              <button
                onClick={addCompetitor}
                disabled={!newCompetitor.trim()}
                className="cursor-pointer bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm transition-colors shrink-0"
              >
                Add
              </button>
            </div>
            {competitors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {competitors.map((c) => (
                  <span
                    key={c}
                    className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-full px-2.5 py-1"
                  >
                    {c}
                    <button
                      onClick={() => removeCompetitor(c)}
                      className="cursor-pointer text-zinc-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Options row */}
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Location
              </label>
              <select
                value={locationCode}
                onChange={(e) => setLocationCode(Number(e.target.value))}
                className="cursor-pointer bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-rose-500/50 transition-colors"
              >
                {LOCATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Device
              </label>
              <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-sm">
                {(['desktop', 'mobile'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDevice(d)}
                    className={cn(
                      'cursor-pointer px-4 py-2 capitalize transition-colors',
                      device === d
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-2"
            >
              Cancel
            </button>
            <button
              onClick={handleRun}
              disabled={!keywords.length || isDispatching}
              className="cursor-pointer flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-5 py-2 transition-colors ml-auto"
            >
              {isDispatching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {isDispatching ? 'Dispatching…' : 'Run Analysis'}
            </button>
          </div>
        </div>
      )}

      {/* Initial loading */}
      {isLoadingInitial && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-8 h-8 text-rose-400 animate-spin" />
          <p className="text-sm text-zinc-400">Loading SERP data…</p>
        </div>
      )}

      {/* No results + not running */}
      {!isLoadingInitial && !isJobRunning && !result && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-zinc-800/60 flex items-center justify-center">
            <Search className="w-7 h-7 text-zinc-600" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <p className="text-base font-semibold text-zinc-300">No SERP analysis yet</p>
            <p className="text-sm text-zinc-500">
              Click <span className="text-rose-400 font-medium">New Analysis</span> above to start tracking your keyword rankings, SERP features, and competitor positions.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="cursor-pointer mt-2 flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Start Your First Analysis
          </button>
        </div>
      )}

      {/* Main content */}
      {result && (
        <>
          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" />
              {result.target_domain}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" />
              {result.keywords.length} keyword{result.keywords.length !== 1 ? 's' : ''}
            </span>
            <span>·</span>
            <span className="capitalize">{result.device}</span>
            <span>·</span>
            <span>
              {LOCATION_OPTIONS.find((l) => l.value === result.location_code)?.label ?? `Location ${result.location_code}`}
            </span>
            <span>·</span>
            <span>Updated {new Date(result.timestamp).toLocaleString()}</span>
          </div>

          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'Keywords', value: summary?.total_keywords ?? 0, icon: <Search className="w-4 h-4" />, color: 'text-zinc-300' },
              { label: 'Ranked', value: summary?.ranked_keywords ?? 0, icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400' },
              { label: 'Top 3', value: summary?.top3 ?? 0, icon: <Crown className="w-4 h-4" />, color: 'text-amber-400' },
              { label: 'Top 10', value: summary?.top10 ?? 0, icon: <Target className="w-4 h-4" />, color: 'text-blue-400' },
              { label: 'Top 20', value: summary?.top20 ?? 0, icon: <BarChart2 className="w-4 h-4" />, color: 'text-violet-400' },
              { label: 'Avg Rank', value: summary?.avg_rank != null ? `#${summary.avg_rank}` : '—', icon: <TrendingUp className="w-4 h-4" />, color: 'text-rose-400' },
              { label: 'Not Ranked', value: summary?.unranked_keywords ?? 0, icon: <AlertTriangle className="w-4 h-4" />, color: 'text-zinc-500' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 space-y-1"
              >
                <div className={cn('flex items-center gap-1.5', stat.color)}>{stat.icon}</div>
                <div className={cn('text-xl font-bold', stat.color)}>{stat.value}</div>
                <div className="text-[11px] text-zinc-500 uppercase tracking-wide">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="border-b border-zinc-800">
            <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  { id: 'rankings', label: 'Rankings' },
                  { id: 'features', label: 'SERP Features' },
                  { id: 'paa', label: 'People Also Ask' },
                  { id: 'competitors', label: 'Competitors' },
                  { id: 'gaps', label: 'Content Gaps' },
                  { id: 'volatility', label: 'Volatility' },
                ] as { id: Tab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'cursor-pointer whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                    activeTab === tab.id
                      ? 'border-rose-500 text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab panels */}
          <div className="min-h-100">
            {activeTab === 'overview' && <OverviewTab result={result} />}
            {activeTab === 'rankings' && (
              <RankingsTab
                kwResults={kwResults}
                expandedKeyword={expandedKeyword}
                setExpandedKeyword={setExpandedKeyword}
              />
            )}
            {activeTab === 'features' && (
              <FeaturesTab kwResults={kwResults} featurePresenceMap={featurePresenceMap} />
            )}
            {activeTab === 'paa' && <PaaTab kwResults={kwResults} />}
            {activeTab === 'competitors' && <CompetitorsTab kwResults={kwResults} />}
            {activeTab === 'gaps' && <GapsTab gaps={gaps} />}
            {activeTab === 'volatility' && <VolatilityTab result={result} kwResults={kwResults} />}
          </div>
        </>
      )}
    </div>
  )
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function OverviewTab({ result }: { result: SerpAnalyzerResult }) {
  const summary = result.summary
  const topRanked = [...result.keyword_results]
    .filter((k) => k.target_rank !== null)
    .sort((a, b) => (a.target_rank ?? 999) - (b.target_rank ?? 999))
    .slice(0, 5)

  const featureEntries = Object.entries(summary.feature_frequency || {})
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
      {/* Best ranking keywords */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" /> Best Ranking Keywords
        </h3>
        {topRanked.length === 0 ? (
          <p className="text-sm text-zinc-500">No keywords in top positions yet.</p>
        ) : (
          <div className="space-y-2">
            {topRanked.map((kw) => (
              <div key={kw.keyword} className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-300 truncate">{kw.keyword}</span>
                <span
                  className={cn(
                    'text-sm font-bold shrink-0',
                    RANK_COLOR(kw.target_rank)
                  )}
                >
                  #{kw.target_rank}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SERP features detected */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Zap className="w-4 h-4 text-violet-400" /> SERP Features Detected
        </h3>
        {featureEntries.length === 0 ? (
          <p className="text-sm text-zinc-500">No SERP features detected yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {featureEntries.map(([ft, count]) => {
              const meta = FEATURE_META[ft]
              return (
                <div
                  key={ft}
                  className="flex items-center gap-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs"
                >
                  <span className={meta?.color ?? 'text-zinc-400'}>{meta?.icon}</span>
                  <span className="text-zinc-300">{meta?.label ?? ft}</span>
                  <span className="text-zinc-500 ml-0.5">×{count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Content Gaps preview */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" /> Content Gap Opportunities (
          {result.content_gaps.length})
        </h3>
        {result.content_gaps.length === 0 ? (
          <p className="text-sm text-zinc-500">All tracked keywords are ranking in top 10.</p>
        ) : (
          <div className="space-y-2">
            {result.content_gaps.slice(0, 5).map((gap) => (
              <div key={gap.keyword} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-300">{gap.keyword}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    Best: {gap.top_ranking_domain}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                  {gap.opportunity_type === 'not_ranking' ? 'Not ranking' : `#${gap.target_rank}`}
                </span>
              </div>
            ))}
            {result.content_gaps.length > 5 && (
              <p className="text-xs text-zinc-500">+{result.content_gaps.length - 5} more gaps</p>
            )}
          </div>
        )}
      </div>

      {/* Volatility */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Activity className="w-4 h-4 text-rose-400" /> SERP Volatility
        </h3>
        <div className="flex items-end gap-4">
          <div>
            <div
              className={cn(
                'text-4xl font-bold',
                result.volatility.level === 'stable'
                  ? 'text-emerald-400'
                  : result.volatility.level === 'medium'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              )}
            >
              {result.volatility.score}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">out of 100</div>
          </div>
          <div className="pb-1">
            <span
              className={cn(
                'text-sm font-medium capitalize',
                result.volatility.level === 'stable'
                  ? 'text-emerald-400'
                  : result.volatility.level === 'medium'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              )}
            >
              {result.volatility.level}
            </span>
            <p className="text-xs text-zinc-500">
              Rank σ = {result.volatility.rank_std_dev}
            </p>
          </div>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-2">
          <div
            className={cn(
              'h-2 rounded-full transition-all',
              result.volatility.level === 'stable'
                ? 'bg-emerald-500'
                : result.volatility.level === 'medium'
                ? 'bg-amber-500'
                : 'bg-rose-500'
            )}
            style={{ width: `${result.volatility.score}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function RankingsTab({
  kwResults,
  expandedKeyword,
  setExpandedKeyword,
}: {
  kwResults: KeywordSerpResult[]
  expandedKeyword: string | null
  setExpandedKeyword: (k: string | null) => void
}) {
  const sorted = [...kwResults].sort(
    (a, b) => (a.target_rank ?? 999) - (b.target_rank ?? 999)
  )

  if (!sorted.length)
    return <EmptyState message="No keyword ranking data available." />

  return (
    <div className="mt-4 space-y-2">
      {/* Table header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">
        <span className="col-span-5">Keyword</span>
        <span className="col-span-2 text-center">Rank</span>
        <span className="col-span-3 truncate">URL</span>
        <span className="col-span-2 text-right">Features</span>
      </div>
      {sorted.map((kw) => {
        const isExpanded = expandedKeyword === kw.keyword
        const featureCount = Object.values(kw.features).filter((f) => f.present).length
        return (
          <div
            key={kw.keyword}
            className="border border-zinc-800 rounded-xl overflow-hidden"
          >
            <button
              onClick={() =>
                setExpandedKeyword(isExpanded ? null : kw.keyword)
              }
              className="cursor-pointer w-full grid grid-cols-12 gap-2 items-center px-4 py-3 hover:bg-zinc-800/30 transition-colors text-left"
            >
              <span className="col-span-5 text-sm text-zinc-200 font-medium truncate pr-2">
                {kw.keyword}
              </span>
              <span
                className={cn(
                  'col-span-2 text-center text-sm font-bold',
                  RANK_COLOR(kw.target_rank)
                )}
              >
                {kw.target_rank != null ? `#${kw.target_rank}` : '—'}
              </span>
              <span className="col-span-3 text-xs text-zinc-500 truncate">
                {kw.target_url
                  ? new URL(kw.target_url).pathname.slice(0, 30) || '/'
                  : '—'}
              </span>
              <div className="col-span-2 flex items-center justify-end gap-1.5">
                {featureCount > 0 && (
                  <span className="text-xs bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-full px-2 py-0.5">
                    {featureCount} features
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-zinc-800 px-4 pb-4 pt-3 space-y-4 bg-zinc-900/40">
                {/* Title + Description */}
                {kw.target_title && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Title tag</p>
                    <p className="text-sm text-white">{kw.target_title}</p>
                  </div>
                )}
                {kw.target_description && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Meta description</p>
                    <p className="text-sm text-zinc-300">{kw.target_description}</p>
                  </div>
                )}
                {kw.target_url && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Ranking URL</p>
                    <a
                      href={kw.target_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline flex items-center gap-1 truncate cursor-pointer"
                    >
                      {kw.target_url}
                      <ArrowUpRight className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                )}

                {/* Active SERP features */}
                {Object.values(kw.features).some((f) => f.present) && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">Active SERP Features</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(kw.features)
                        .filter(([, f]) => f.present)
                        .map(([ft]) => {
                          const meta = FEATURE_META[ft]
                          return (
                            <span
                              key={ft}
                              className={cn(
                                'flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-zinc-800 border border-zinc-700',
                                meta?.color ?? 'text-zinc-400'
                              )}
                            >
                              {meta?.icon}
                              {meta?.label ?? ft}
                            </span>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Top 3 organic */}
                {kw.organic_results.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">Top Organic Results</p>
                    <div className="space-y-2">
                      {kw.organic_results.slice(0, 5).map((r) => (
                        <div key={r.url} className="flex items-start gap-3">
                          <span className="text-xs font-bold text-zinc-600 w-5 shrink-0 mt-0.5">
                            {r.rank_absolute}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-zinc-300 truncate">{r.title}</p>
                            <p className="text-xs text-zinc-600 truncate">{r.domain}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FeaturesTab({
  kwResults,
  featurePresenceMap,
}: {
  kwResults: KeywordSerpResult[]
  featurePresenceMap: Record<string, number>
}) {
  const total = kwResults.length

  const entries = Object.entries(featurePresenceMap)
    .sort(([, a], [, b]) => b - a)

  if (!entries.length)
    return <EmptyState message="No SERP features detected in your tracked keywords." />

  return (
    <div className="mt-4 space-y-6">
      {/* Feature summary grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {entries.map(([ft, count]) => {
          const meta = FEATURE_META[ft]
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div
              key={ft}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-2"
            >
              <div className={cn('flex items-center gap-2', meta?.color ?? 'text-zinc-400')}>
                {meta?.icon}
                <span className="text-xs font-medium">{meta?.label ?? ft}</span>
              </div>
              <div className="text-2xl font-bold text-white">{count}</div>
              <div className="text-xs text-zinc-500">{pct}% of keywords</div>
              <div className="w-full bg-zinc-800 rounded-full h-1">
                <div
                  className="h-1 rounded-full bg-rose-500/60"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Feature ↔ keyword breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Feature Breakdown by Keyword</h3>
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60">
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Keyword</th>
                {entries.slice(0, 8).map(([ft]) => (
                  <th key={ft} className="px-3 py-2.5 text-zinc-500 font-medium">
                    <div className={cn('flex items-center justify-center gap-1', FEATURE_META[ft]?.color ?? 'text-zinc-400')}>
                      {FEATURE_META[ft]?.icon}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kwResults.map((kw) => (
                <tr key={kw.keyword} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                  <td className="px-4 py-2 text-zinc-300 truncate max-w-45">
                    {kw.keyword}
                  </td>
                  {entries.slice(0, 8).map(([ft]) => (
                    <td key={ft} className="px-3 py-2 text-center">
                      {kw.features[ft]?.present ? (
                        <CheckCircle2 className={cn('w-3.5 h-3.5 mx-auto', FEATURE_META[ft]?.color ?? 'text-zinc-400')} />
                      ) : (
                        <Minus className="w-3.5 h-3.5 mx-auto text-zinc-700" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PaaTab({ kwResults }: { kwResults: KeywordSerpResult[] }) {
  const paaKeywords = kwResults.filter((k) => k.paa_questions.length > 0)

  if (!paaKeywords.length)
    return <EmptyState message="No People Also Ask questions found in your tracked keywords." />

  return (
    <div className="mt-4 space-y-4">
      {paaKeywords.map((kw) => (
        <div
          key={kw.keyword}
          className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-3"
        >
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-400" />
            {kw.keyword}
            <span className="text-xs text-zinc-600 ml-auto">
              {kw.paa_questions.length} questions
            </span>
          </h3>
          <div className="space-y-2">
            {kw.paa_questions.map((q, idx) => (
              <div
                key={idx}
                className="border border-zinc-800/80 rounded-lg p-3 space-y-1"
              >
                <p className="text-sm text-zinc-200 font-medium">{q.question}</p>
                {q.answer && (
                  <p className="text-xs text-zinc-500 line-clamp-2">{q.answer}</p>
                )}
                {q.answer_url && (
                  <a
                    href={q.answer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer text-xs text-blue-400 hover:underline flex items-center gap-0.5"
                  >
                    Source <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CompetitorsTab({ kwResults }: { kwResults: KeywordSerpResult[] }) {
  // Build aggregate: competitor domain → list of ranks per keyword
  const compMap: Record<string, { keyword: string; rank: number }[]> = {}
  kwResults.forEach((kw) => {
    Object.entries(kw.competitor_ranks).forEach(([domain, rank]) => {
      if (!compMap[domain]) compMap[domain] = []
      compMap[domain].push({ keyword: kw.keyword, rank })
    })
  })

  const competitors = Object.entries(compMap).sort(
    ([, a], [, b]) =>
      (b.reduce((s, r) => s + r.rank, 0) / b.length) -
      (a.reduce((s, r) => s + r.rank, 0) / a.length)
  )

  if (!competitors.length)
    return <EmptyState message="No competitors are ranking for your tracked keywords (or no competitors were specified)." />

  return (
    <div className="mt-4 space-y-4">
      {competitors.map(([domain, ranks]) => {
        const avgRank = Math.round(ranks.reduce((s, r) => s + r.rank, 0) / ranks.length)
        const top10 = ranks.filter((r) => r.rank <= 10).length
        return (
          <div
            key={domain}
            className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-zinc-500 shrink-0" />
                <span className="text-sm font-semibold text-zinc-200">{domain}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-zinc-500">
                  Avg rank <span className="text-amber-400 font-bold">#{avgRank}</span>
                </span>
                <span className="text-zinc-500">
                  Top 10{' '}
                  <span className="text-emerald-400 font-bold">{top10}/{ranks.length}</span>
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {ranks.sort((a, b) => a.rank - b.rank).map((r) => (
                <div
                  key={r.keyword}
                  className="flex items-center justify-between gap-2 bg-zinc-800/50 rounded-lg px-3 py-2"
                >
                  <span className="text-xs text-zinc-400 truncate">{r.keyword}</span>
                  <span
                    className={cn('text-xs font-bold shrink-0', RANK_COLOR(r.rank))}
                  >
                    #{r.rank}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GapsTab({ gaps }: { gaps: ContentGap[] }) {
  if (!gaps.length)
    return (
      <EmptyState message="No content gaps found — your site is ranking in top 10 for all tracked keywords. Great job!" />
    )

  const notRanking = gaps.filter((g) => g.opportunity_type === 'not_ranking')
  const lowRanking = gaps.filter((g) => g.opportunity_type === 'low_ranking')

  return (
    <div className="mt-4 space-y-6">
      {notRanking.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-rose-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Not Ranking ({notRanking.length})
          </h3>
          <div className="space-y-2">
            {notRanking.map((gap) => <GapRow key={gap.keyword} gap={gap} />)}
          </div>
        </section>
      )}
      {lowRanking.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4" /> Low Ranking — Positions 11-100 ({lowRanking.length})
          </h3>
          <div className="space-y-2">
            {lowRanking
              .sort((a, b) => (a.target_rank ?? 999) - (b.target_rank ?? 999))
              .map((gap) => <GapRow key={gap.keyword} gap={gap} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function GapRow({ gap }: { gap: ContentGap }) {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-200">{gap.keyword}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Top result: <span className="text-zinc-400">{gap.top_ranking_domain}</span>
          </p>
        </div>
        <span
          className={cn(
            'text-xs px-2 py-0.5 rounded-full shrink-0',
            gap.opportunity_type === 'not_ranking'
              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          )}
        >
          {gap.opportunity_type === 'not_ranking' ? 'Not ranking' : `Position #${gap.target_rank}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {gap.has_featured_snippet && (
          <Badge color="amber" icon={<Crown className="w-3 h-3" />} label="Featured Snippet" />
        )}
        {gap.has_paa && (
          <Badge color="blue" icon={<HelpCircle className="w-3 h-3" />} label="Has PAA" />
        )}
        {gap.paa_questions.slice(0, 2).map((q) => (
          <span key={q} className="text-xs text-zinc-500 bg-zinc-800 border border-zinc-700 rounded-full px-2 py-0.5 truncate max-w-50">
            {q}
          </span>
        ))}
      </div>
      {gap.top_ranking_url && (
        <a
          href={gap.top_ranking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:underline flex items-center gap-0.5 truncate"
        >
          {gap.top_ranking_url.slice(0, 80)}
          <ArrowUpRight className="w-3 h-3 shrink-0" />
        </a>
      )}
    </div>
  )
}

function VolatilityTab({
  result,
  kwResults,
}: {
  result: SerpAnalyzerResult
  kwResults: KeywordSerpResult[]
}) {
  const volatility = result.volatility

  return (
    <div className="mt-4 space-y-6">
      {/* Score card */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 flex items-center gap-8">
        <div className="text-center">
          <div
            className={cn(
              'text-6xl font-bold',
              volatility.level === 'stable'
                ? 'text-emerald-400'
                : volatility.level === 'medium'
                ? 'text-amber-400'
                : 'text-rose-400'
            )}
          >
            {volatility.score}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Volatility Score</div>
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-base font-semibold capitalize',
                volatility.level === 'stable'
                  ? 'text-emerald-400'
                  : volatility.level === 'medium'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              )}
            >
              {volatility.level}
            </span>
            <span className="text-sm text-zinc-500">SERP stability</span>
          </div>
          <p className="text-sm text-zinc-400">
            Standard deviation of ranks across keywords:{' '}
            <strong className="text-white">{volatility.rank_std_dev}</strong>.{' '}
            {volatility.level === 'stable'
              ? 'Your rankings are consistent across keywords.'
              : volatility.level === 'medium'
              ? 'Some variation in rankings — consider consolidating content.'
              : 'High variation — focus on a smaller set of high-priority keywords first.'}
          </p>
          <div className="w-full bg-zinc-800 rounded-full h-3">
            <div
              className={cn(
                'h-3 rounded-full transition-all',
                volatility.level === 'stable'
                  ? 'bg-emerald-500'
                  : volatility.level === 'medium'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              )}
              style={{ width: `${volatility.score}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-600">
            <span>Stable</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>
      </div>

      {/* Rank distribution */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300">Rank Distribution</h3>
        <div className="space-y-2">
          {[
            { label: 'Positions 1–3', count: kwResults.filter((k) => k.target_rank != null && k.target_rank <= 3).length, color: 'bg-emerald-500' },
            { label: 'Positions 4–10', count: kwResults.filter((k) => k.target_rank != null && k.target_rank > 3 && k.target_rank <= 10).length, color: 'bg-blue-500' },
            { label: 'Positions 11–20', count: kwResults.filter((k) => k.target_rank != null && k.target_rank > 10 && k.target_rank <= 20).length, color: 'bg-amber-500' },
            { label: 'Positions 21–100', count: kwResults.filter((k) => k.target_rank != null && k.target_rank > 20).length, color: 'bg-zinc-600' },
            { label: 'Not ranking', count: kwResults.filter((k) => k.target_rank == null).length, color: 'bg-rose-500/50' },
          ].map((row) => {
            const pct = kwResults.length > 0 ? Math.round((row.count / kwResults.length) * 100) : 0
            return (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-32 shrink-0">{row.label}</span>
                <div className="flex-1 bg-zinc-800 rounded-full h-2">
                  <div className={cn('h-2 rounded-full', row.color)} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-zinc-400 w-8 text-right">{row.count}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Shared small pieces ────────────────────────────────────────────────────

function Badge({
  color,
  icon,
  label,
}: {
  color: 'amber' | 'blue' | 'rose' | 'emerald'
  icon: React.ReactNode
  label: string
}) {
  const colors = {
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  }
  return (
    <span className={cn('flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border', colors[color])}>
      {icon}
      {label}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
      <FileText className="w-10 h-10 text-zinc-700" />
      <p className="text-sm text-zinc-500 max-w-xs">{message}</p>
    </div>
  )
}
