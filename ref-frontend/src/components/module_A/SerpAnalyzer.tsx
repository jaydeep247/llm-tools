'use client'

import { useState, useMemo, useEffect, useRef, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Search,
  Plus,
  Trash2,
  RefreshCw,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Crown,
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
  XCircle,
  Lightbulb,
  Zap,
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleAAskAiChatShell, type ModuleAAskAiChatTurn } from './ModuleAAskAiChatShell'
import {
  useGetSerpResultQuery,
  useGetSessionSerpResultsQuery,
  useRunSerpAnalyzerMutation,
  useAskModuleAAIMutation,
  useLazyGetModuleASuggestedQuestionsQuery,
  type SerpAnalyzerResult,
  type KeywordSerpResult,
  type ContentGap,
} from '@/store/api/module_A/moduleAApi'

// ── Constants ──────────────────────────────────────────────────────────────

const LOCATION_OPTIONS = [
  { value: 2840, label: '🇺🇸 United States' },
  { value: 2826, label: '🇬🇧 United Kingdom' },
  { value: 2036, label: '🇦🇺 Australia' },
  { value: 2124, label: '🇨🇦 Canada' },
  { value: 2276, label: '🇩🇪 Germany' },
  { value: 2250, label: '🇫🇷 France' },
  { value: 2356, label: '🇮🇳 India' },
]

const FEATURE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  featured_snippet: { label: 'Featured Snippet',  icon: <Crown      className="w-3 h-3" />, color: 'text-amber-400' },
  answer_box:       { label: 'Answer Box',        icon: <CheckCircle2 className="w-3 h-3" />, color: 'text-emerald-400' },
  people_also_ask:  { label: 'PAA',               icon: <HelpCircle className="w-3 h-3" />, color: 'text-blue-400' },
  knowledge_graph:  { label: 'Knowledge Panel',   icon: <BookOpen   className="w-3 h-3" />, color: 'text-violet-400' },
  local_pack:       { label: 'Local Pack',        icon: <MapPin     className="w-3 h-3" />, color: 'text-rose-400' },
  image_carousel:   { label: 'Images',            icon: <Image      className="w-3 h-3" />, color: 'text-cyan-400' },
  video_carousel:   { label: 'Videos',            icon: <Video      className="w-3 h-3" />, color: 'text-orange-400' },
  news_box:         { label: 'News',              icon: <Newspaper  className="w-3 h-3" />, color: 'text-sky-400' },
  sitelinks:        { label: 'Sitelinks',         icon: <Link2      className="w-3 h-3" />, color: 'text-indigo-400' },
  paid:             { label: 'Ads',               icon: <ShoppingBag className="w-3 h-3" />, color: 'text-yellow-400' },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function rankBadgeClass(rank: number | null): string {
  if (!rank) return 'bg-zinc-100 text-zinc-500 border-zinc-300'
  if (rank <= 3)  return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  if (rank <= 10) return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
  if (rank <= 20) return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  return 'bg-zinc-100 text-zinc-500 border-zinc-300'
}

function rankLabel(rank: number | null): string {
  return rank ? `#${rank}` : '—'
}

// ── Main component ─────────────────────────────────────────────────────────

interface SerpAnalyzerProps {
  jobId: string | null | undefined
  sessionId: string
}

type Filter = 'all' | 'ranking' | 'top10' | 'not-ranking'

function chatMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function SerpAnalyzer({ jobId, sessionId }: SerpAnalyzerProps) {
  const [showForm, setShowForm]                 = useState(false)
  const [newKeyword, setNewKeyword]             = useState('')
  const [keywords, setKeywords]                 = useState<string[]>([])
  const [newCompetitor, setNewCompetitor]       = useState('')
  const [competitors, setCompetitors]           = useState<string[]>([])
  const [locationCode, setLocationCode]         = useState(2840)
  const [device, setDevice]                     = useState<'desktop' | 'mobile'>('desktop')
  const [filter, setFilter]                     = useState<Filter>('all')
  const [expandedKeyword, setExpandedKeyword]   = useState<string | null>(null)
  const [pendingSerpJobId, setPendingSerpJobId] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ModuleAAskAiChatTurn[]>([])
  const [chatSuggestions, setChatSuggestions] = useState<string[]>([])
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Close modal on Escape
  useEffect(() => {
    if (!showForm) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowForm(false); setRunError(null) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showForm])

  // ── Data fetching ──────────────────────────────────────────────────────
  const {
    data: sessionResults,
    isLoading: isLoadingSession,
    isFetching: isFetchingSession,
    refetch: refetchSession,
  } = useGetSessionSerpResultsQuery(sessionId, { skip: !sessionId })

  const { data: newJobResult } = useGetSerpResultQuery(pendingSerpJobId!, {
    skip: !pendingSerpJobId,
    pollingInterval: pendingSerpJobId ? 2000 : 0,
  })

  useEffect(() => {
    if (isPolling && newJobResult?.data) {
      setIsPolling(false)
      refetchSession()
    }
  }, [newJobResult, isPolling, refetchSession])

  const [runSerpAnalyzer, { isLoading: isDispatching }] = useRunSerpAnalyzerMutation()
  const [askModuleAAI, { isLoading: isAskingAI, error: askAIError, reset: resetAskAI }] =
    useAskModuleAAIMutation()
  const [fetchSuggestedQuestions] = useLazyGetModuleASuggestedQuestionsQuery()

  const result: SerpAnalyzerResult | null =
    newJobResult?.data ?? sessionResults?.data?.[0] ?? null

  const isLoadingInitial = isLoadingSession && !result
  const isJobRunning     = isPolling && !newJobResult?.data

  // ── Derived ────────────────────────────────────────────────────────────
  const allKw   = result?.keyword_results ?? []
  const summary = result?.summary
  const gaps    = result?.content_gaps ?? []

  const filteredKw = allKw.filter((kw) => {
    if (filter === 'ranking')     return kw.target_rank !== null
    if (filter === 'top10')       return kw.target_rank !== null && kw.target_rank <= 10
    if (filter === 'not-ranking') return kw.target_rank === null
    return true
  })

  // ── Handlers ──────────────────────────────────────────────────────────
  const addKeyword = () => {
    const kw = newKeyword.trim()
    if (kw && !keywords.includes(kw)) setKeywords((p) => [...p, kw])
    setNewKeyword('')
  }

  const addCompetitor = () => {
    const c = newCompetitor.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (c && !competitors.includes(c)) setCompetitors((p) => [...p, c])
    setNewCompetitor('')
  }

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
      setRunError(err?.data?.message ?? 'Failed to start analysis.')
    }
  }

  const openAskAiDialog = async () => {
    if (!jobId) return
    resetAskAI()
    setChatMessages([])
    setChatInput('')
    setAskDialogOpen(true)
    try {
      const suggested = await fetchSuggestedQuestions(jobId).unwrap()
      setChatSuggestions(suggested?.questions ?? [])
    } catch {
      setChatSuggestions([])
    }
  }

  const submitAskAi = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!jobId || !chatInput.trim() || isAskingAI) return

    const question = chatInput.trim()
    setChatInput('')

    const priorHistory = chatMessages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const userTurn: ModuleAAskAiChatTurn = { id: chatMessageId(), role: 'user', content: question }
    setChatMessages((prev) => [...prev, userTurn])

    try {
      const res = await askModuleAAI({
        jobId,
        body: {
          question,
          conversationHistory: priorHistory.length ? priorHistory : undefined,
        },
      }).unwrap()

      const text = (res?.data?.answer ?? res?.answer ?? '').trim()
      const sources = res?.data?.sources ?? res?.sources
      if (!text) {
        setChatMessages((prev) => prev.filter((m) => m.id !== userTurn.id))
        setChatInput(question)
        return
      }

      setChatMessages((prev) => [
        ...prev,
        { id: chatMessageId(), role: 'assistant', content: text, sources },
      ])
    } catch {
      setChatMessages((prev) => prev.filter((m) => m.id !== userTurn.id))
      setChatInput(question)
    }
  }

  useEffect(() => {
    if (!askDialogOpen || !chatScrollRef.current) return
    const el = chatScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [askDialogOpen, chatMessages, isAskingAI])

  // ── Render ─────────────────────────────────────────────────────────────
  if (!jobId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <Search className="w-10 h-10 text-(--nd-text-muted)" />
        <p className="text-sm text-(--nd-text-muted) max-w-xs">
          No crawl job found. Run a crawl first, then come back to analyze SERP rankings.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Dialog
        open={askDialogOpen}
        onOpenChange={(open) => {
          setAskDialogOpen(open)
          if (!open) {
            resetAskAI()
            setChatMessages([])
            setChatInput('')
            setChatSuggestions([])
          }
        }}
      >
        <DialogContent
          className={cn(
            'w-[calc(100vw-1rem)] max-h-[95vh] gap-0 overflow-visible border-0 bg-transparent p-0 pt-10 shadow-none sm:max-w-3xl lg:max-w-5xl',
            'data-[state=open]:zoom-in-[0.98]',
          )}
          showCloseButton
        >
          <ModuleAAskAiChatShell
            chatScrollRef={chatScrollRef}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            isAskingAI={isAskingAI}
            askAIError={askAIError}
            onSubmit={submitAskAi}
            onSuggestionClick={(text: string) => setChatInput(text)}
            suggestions={chatSuggestions}
          />
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-(--nd-text-primary) flex items-center gap-2">
            <Search className="w-4 h-4 text-rose-500" />
            SERP Analyzer
          </h2>
          <p className="text-xs text-(--nd-text-muted) mt-0.5">
            See where your keywords rank on Google and discover opportunities to climb higher.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={openAskAiDialog}
            disabled={!jobId || isAskingAI}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border-0 px-5 py-2.5 text-sm font-extrabold uppercase tracking-wider text-black shadow-lg shadow-fuchsia-950/30',
              'bg-linear-to-r from-purple-500 via-pink-500 to-amber-300 hover:opacity-95',
              'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <MessageSquare className="size-4 shrink-0" />
            Ask AI
          </button>
          {result && (
            <button
              onClick={() => refetchSession()}
              disabled={isFetchingSession || isJobRunning}
              className="flex items-center gap-1.5 text-xs text-(--nd-text-secondary) hover:text-(--nd-text-primary) border border-(--nd-border) hover:border-(--nd-text-secondary) rounded-lg px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
            {showForm ? 'Cancel' : 'New Analysis'}
          </button>
        </div>
      </div>

      {/* Running banner */}
      {isJobRunning && (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-700">Fetching SERP data…</p>
            <p className="text-xs text-(--nd-text-muted) mt-0.5">This usually takes 15–30 seconds per keyword.</p>
          </div>
        </div>
      )}

      {/* New analysis modal */}
      {showForm && (
        <NewAnalysisForm
          newKeyword={newKeyword}
          setNewKeyword={setNewKeyword}
          keywords={keywords}
          addKeyword={addKeyword}
          removeKeyword={(kw) => setKeywords((p) => p.filter((k) => k !== kw))}
          newCompetitor={newCompetitor}
          setNewCompetitor={setNewCompetitor}
          competitors={competitors}
          addCompetitor={addCompetitor}
          removeCompetitor={(c) => setCompetitors((p) => p.filter((x) => x !== c))}
          locationCode={locationCode}
          setLocationCode={setLocationCode}
          device={device}
          setDevice={setDevice}
          onCancel={() => { setShowForm(false); setRunError(null) }}
          onRun={handleRun}
          isDispatching={isDispatching}
          runError={runError}
          onClearError={() => setRunError(null)}
        />
      )}

      {/* Loading */}
      {isLoadingInitial && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-7 h-7 text-rose-500 animate-spin" />
          <p className="text-sm text-(--nd-text-muted)">Loading analysis data…</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoadingInitial && !isJobRunning && !result && (
        <AnalysisEmptyState
          icon={<Search className="w-8 h-8 text-(--nd-text-muted)" />}
          title="No SERP Analysis Yet"
          description="Run an analysis to see where your keywords rank on Google and discover opportunities to improve."
          onRunAnalysis={() => setShowForm(true)}
          isAnalyzing={false}
          buttonLabel="Start Analysis"
        />
      )}

      {/* Results */}
      {result && !isLoadingInitial && (
        <div className="space-y-6">

          {/* Meta strip */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-(--nd-text-muted)">
            <span className="flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" />
              {result.target_domain}
            </span>
            <span>·</span>
            <span className="capitalize">{result.device}</span>
            <span>·</span>
            <span>
              {LOCATION_OPTIONS.find((l) => l.value === result.location_code)?.label ??
                `Location ${result.location_code}`}
            </span>
            <span>·</span>
            <span>{new Date(result.timestamp).toLocaleDateString()}</span>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Keywords Tracked" value={summary?.total_keywords ?? 0}        icon={<Search className="w-4 h-4" />}       color="text-(--nd-text-secondary)" />
            <StatCard label="Ranking"           value={summary?.ranked_keywords ?? 0}       icon={<CheckCircle2 className="w-4 h-4" />} color="text-emerald-400" sub={summary?.total_keywords ? `of ${summary.total_keywords}` : undefined} />
            <StatCard label="Avg Position"      value={summary?.avg_rank != null ? `#${summary.avg_rank}` : '—'} icon={<TrendingUp className="w-4 h-4" />}   color="text-rose-400" />
            <StatCard label="Top 10"            value={summary?.top10 ?? 0}                 icon={<Target className="w-4 h-4" />}       color="text-blue-400" sub={summary?.top3 ? `${summary.top3} in top 3` : undefined} />
          </div>

          {/* Keyword rankings table */}
          <div className="rounded-2xl border border-(--nd-border) bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-(--nd-border)">
              <h3 className="text-sm font-semibold text-(--nd-text-primary) flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-500" />
                Keyword Rankings
                <span className="text-xs font-normal text-(--nd-text-muted)">({allKw.length})</span>
              </h3>
              <div className="flex gap-1 flex-wrap">
                {(
                  [
                    { id: 'all',         label: 'All' },
                    { id: 'top10',       label: 'Top 10' },
                    { id: 'ranking',     label: 'Ranking' },
                    { id: 'not-ranking', label: 'Not Ranking' },
                  ] as { id: Filter; label: string }[]
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'cursor-pointer text-xs px-2.5 py-1 rounded-md transition-colors',
                      filter === f.id
                        ? 'bg-rose-50 text-rose-600 border border-rose-200'
                        : 'text-(--nd-text-muted) hover:text-(--nd-text-secondary) border border-transparent hover:border-(--nd-border)'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredKw.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <AlertTriangle className="w-8 h-8 text-(--nd-text-muted)" />
                <p className="text-sm text-(--nd-text-muted)">No keywords match this filter.</p>
              </div>
            ) : (
              <div className="divide-y divide-(--nd-border)">
                {filteredKw
                  .slice()
                  .sort((a, b) => (a.target_rank ?? 999) - (b.target_rank ?? 999))
                  .map((kw) => (
                    <KeywordRow
                      key={kw.keyword}
                      kw={kw}
                      isExpanded={expandedKeyword === kw.keyword}
                      onToggle={() =>
                        setExpandedKeyword((prev) =>
                          prev === kw.keyword ? null : kw.keyword
                        )
                      }
                    />
                  ))}
              </div>
            )}
          </div>

          {/* What to improve */}
          {gaps.length > 0 && <WhatToImprove gaps={gaps} />}

          {/* SERP features summary */}
          {summary && Object.keys(summary.feature_frequency || {}).length > 0 && (
            <SerpFeaturesSummary featureFreq={summary.feature_frequency} total={allKw.length} />
          )}

        </div>
      )}
    </div>
  )
}

// ── KeywordRow ─────────────────────────────────────────────────────────────

function KeywordRow({
  kw,
  isExpanded,
  onToggle,
}: {
  kw: KeywordSerpResult
  isExpanded: boolean
  onToggle: () => void
}) {
  const activeFeatures = Object.entries(kw.features)
    .filter(([, f]) => f.present)
    .slice(0, 5)

  const competitorEntries = Object.entries(kw.competitor_ranks)
  const hasPaa = kw.paa_questions.length > 0

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 hover:bg-(--nd-bg) transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">

          <span
            className={cn(
              'shrink-0 min-w-10.5 text-center text-xs font-bold px-2 py-0.5 rounded-md border',
              rankBadgeClass(kw.target_rank)
            )}
          >
            {rankLabel(kw.target_rank)}
          </span>

          <span className="flex-1 text-sm text-(--nd-text-primary) font-medium truncate min-w-0">
            {kw.keyword}
          </span>

          {kw.target_url && (
            <span className="hidden sm:block text-xs text-(--nd-text-muted) truncate max-w-48 lg:max-w-64 shrink-0">
              {kw.target_url.replace(/^https?:\/\//, '').slice(0, 60)}
            </span>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {activeFeatures.map(([ft]) => {
              const meta = FEATURE_META[ft]
              if (!meta) return null
              return (
                <span key={ft} title={meta.label} className={cn(meta.color, 'opacity-80')}>
                  {meta.icon}
                </span>
              )
            })}
          </div>

          <span className="text-(--nd-text-muted) shrink-0">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 bg-(--nd-bg) border-t border-(--nd-border)">

          {(kw.target_url || kw.target_title) && (
            <div className="pt-3 space-y-1">
              <p className="text-xs font-medium text-(--nd-text-secondary) uppercase tracking-wide">Your Page</p>
              {kw.target_title && <p className="text-sm text-(--nd-text-primary)">{kw.target_title}</p>}
              {kw.target_description && (
                <p className="text-xs text-(--nd-text-muted) line-clamp-2">{kw.target_description}</p>
              )}
              {kw.target_url && (
                <a
                  href={kw.target_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {kw.target_url.slice(0, 70)}
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {competitorEntries.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-(--nd-text-secondary) uppercase tracking-wide">Competitor Ranks</p>
              <div className="flex flex-wrap gap-2">
                {competitorEntries
                  .sort(([, a], [, b]) => a - b)
                  .map(([domain, rank]) => (
                    <span
                      key={domain}
                      className="flex items-center gap-1.5 bg-(--nd-bg) border border-(--nd-border) rounded-lg px-2.5 py-1 text-xs"
                    >
                      <Globe className="w-3 h-3 text-(--nd-text-muted)" />
                      <span className="text-(--nd-text-secondary)">{domain}</span>
                      <span className={cn('font-bold', rankBadgeClass(rank).split(' ')[1])}>
                        #{rank}
                      </span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {hasPaa && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-(--nd-text-secondary) uppercase tracking-wide flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                People Also Ask ({kw.paa_questions.length})
              </p>
              <div className="space-y-1.5">
                {kw.paa_questions.slice(0, 4).map((q, i) => (
                  <div key={i} className="bg-(--nd-bg) border border-(--nd-border) rounded-lg px-3 py-2 space-y-0.5">
                    <p className="text-xs text-(--nd-text-primary)">{q.question}</p>
                    {q.answer && <p className="text-xs text-(--nd-text-muted) line-clamp-1">{q.answer}</p>}
                  </div>
                ))}
                {kw.paa_questions.length > 4 && (
                  <p className="text-xs text-(--nd-text-muted)">+{kw.paa_questions.length - 4} more questions</p>
                )}
              </div>
            </div>
          )}

          {kw.organic_results.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-(--nd-text-secondary) uppercase tracking-wide">Top Results on Google</p>
              <div className="space-y-1">
                {kw.organic_results.slice(0, 5).map((r) => (
                  <div key={r.url} className="flex items-start gap-2 text-xs">
                    <span className={cn('font-bold shrink-0 mt-0.5', rankBadgeClass(r.rank_absolute).split(' ')[1])}>
                      #{r.rank_absolute}
                    </span>
                    <div className="min-w-0">
                      <p className="text-(--nd-text-secondary) truncate">{r.title || r.domain}</p>
                      <p className="text-(--nd-text-muted) truncate">{r.domain}</p>
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
}

// ── What to Improve ────────────────────────────────────────────────────────

function WhatToImprove({ gaps }: { gaps: ContentGap[] }) {
  const notRanking = gaps.filter((g) => g.opportunity_type === 'not_ranking')
  const lowRanking = gaps.filter((g) => g.opportunity_type === 'low_ranking')

  return (
    <div className="rounded-2xl border border-(--nd-border) bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-(--nd-border)">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-(--nd-text-primary)">What to Improve</h3>
        <span className="text-xs text-(--nd-text-muted) ml-0.5">({gaps.length} opportunities)</span>
      </div>

      <div className="divide-y divide-(--nd-border)">
        {notRanking.map((gap) => (
          <div key={gap.keyword} className="px-4 py-3 flex items-start gap-3">
            <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
              <XCircle className="w-3 h-3 text-rose-600" />
            </span>
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-(--nd-text-primary)">
                <span className="text-rose-600">{gap.keyword}</span> — not ranking
              </p>
              <p className="text-xs text-(--nd-text-muted)">
                {gap.top_ranking_domain
                  ? `${gap.top_ranking_domain} is ranking #1. Create a dedicated page for this topic.`
                  : 'Consider creating content targeting this keyword.'}
              </p>
              {gap.has_featured_snippet && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <Crown className="w-3 h-3" />
                  A featured snippet exists — structured content could win it.
                </p>
              )}
              {gap.has_paa && gap.paa_questions.length > 0 && (
                <p className="text-xs text-blue-400 flex items-center gap-1">
                  <HelpCircle className="w-3 h-3" />
                  Answer: {gap.paa_questions.slice(0, 2).join(' · ')}
                </p>
              )}
            </div>
          </div>
        ))}

        {lowRanking
          .sort((a, b) => (a.target_rank ?? 999) - (b.target_rank ?? 999))
          .map((gap) => (
            <div key={gap.keyword} className="px-4 py-3 flex items-start gap-3">
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                <TrendingUp className="w-3 h-3 text-amber-600" />
              </span>
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-(--nd-text-primary)">
                  <span className="text-amber-600">{gap.keyword}</span>
                  <span className="text-(--nd-text-muted) text-xs ml-1.5">position #{gap.target_rank}</span>
                </p>
                <p className="text-xs text-(--nd-text-muted)">
                  {gap.top_ranking_domain
                    ? `${gap.top_ranking_domain} leads. Improve content depth, add internal links, and build backlinks.`
                    : "You're on page 2+. Strengthen your content to break into page 1."}
                </p>
                {gap.has_featured_snippet && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <Crown className="w-3 h-3" />
                    Add a direct answer paragraph to target the featured snippet.
                  </p>
                )}
              </div>
              {gap.top_ranking_url && (
                <a
                  href={gap.top_ranking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-(--nd-text-muted) hover:text-blue-600 transition-colors"
                  title="View top result"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

// ── SERP Features Summary ──────────────────────────────────────────────────

function SerpFeaturesSummary({
  featureFreq,
  total,
}: {
  featureFreq: Record<string, number>
  total: number
}) {
  const entries = Object.entries(featureFreq)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  if (!entries.length) return null

  return (
    <div className="rounded-2xl border border-(--nd-border) bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-(--nd-border)">
        <Zap className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-(--nd-text-primary)">SERP Features Detected</h3>
        <span className="text-xs text-(--nd-text-muted) ml-0.5">across your keywords</span>
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {entries.map(([ft, count]) => {
          const meta = FEATURE_META[ft]
          const pct  = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div
              key={ft}
              className="flex items-center gap-2 bg-(--nd-bg) border border-(--nd-border) rounded-xl px-3 py-2 text-xs"
            >
              <span className={meta?.color ?? 'text-(--nd-text-muted)'}>{meta?.icon}</span>
              <span className="text-(--nd-text-secondary) font-medium">{meta?.label ?? ft}</span>
              <span className="text-(--nd-text-muted)">{count}×</span>
              <span className="text-(--nd-text-muted)">({pct}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── New analysis form ──────────────────────────────────────────────────────

interface NewAnalysisFormProps {
  newKeyword: string
  setNewKeyword: (v: string) => void
  keywords: string[]
  addKeyword: () => void
  removeKeyword: (kw: string) => void
  newCompetitor: string
  setNewCompetitor: (v: string) => void
  competitors: string[]
  addCompetitor: () => void
  removeCompetitor: (c: string) => void
  locationCode: number
  setLocationCode: (v: number) => void
  device: 'desktop' | 'mobile'
  setDevice: (v: 'desktop' | 'mobile') => void
  onCancel: () => void
  onRun: () => void
  isDispatching: boolean
  runError: string | null
  onClearError: () => void
}

function NewAnalysisForm({
  newKeyword, setNewKeyword, keywords, addKeyword, removeKeyword,
  newCompetitor, setNewCompetitor, competitors, addCompetitor, removeCompetitor,
  locationCode, setLocationCode, device, setDevice,
  onCancel, onRun, isDispatching, runError, onClearError,
}: NewAnalysisFormProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return createPortal(
    /* Backdrop */
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      {/* Modal panel */}
      <div className="w-full max-w-lg rounded-2xl border border-(--nd-border) bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Modal header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-(--nd-border)">
          <div>
            <h3 className="text-base font-semibold text-(--nd-text-primary)">New SERP Analysis</h3>
            <p className="text-xs text-(--nd-text-muted) mt-0.5">
              Add keywords to track and optionally your competitors' domains.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="cursor-pointer shrink-0 text-(--nd-text-muted) hover:text-(--nd-text-secondary) transition-colors mt-0.5"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">

          {/* Error */}
          {runError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 flex-1">{runError}</p>
              <button onClick={onClearError} className="cursor-pointer text-(--nd-text-muted) hover:text-(--nd-text-secondary)">
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Keywords */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-(--nd-text-secondary)">
              Keywords to track <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                placeholder="e.g. best seo tools"
                autoFocus
                className="flex-1 bg-white border border-(--nd-border) rounded-lg text-sm text-(--nd-text-primary) placeholder:text-(--nd-text-muted) px-3 py-2 focus:outline-none focus:border-rose-500/50 transition-colors"
              />
              <button
                onClick={addKeyword}
                disabled={!newKeyword.trim()}
                className="cursor-pointer bg-(--nd-bg) hover:bg-(--nd-border) border border-(--nd-border) disabled:opacity-40 disabled:cursor-not-allowed text-(--nd-text-primary) rounded-lg px-4 py-2 text-sm transition-colors shrink-0"
              >
                Add
              </button>
            </div>
            {keywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw) => (
                  <span key={kw} className="flex items-center gap-1 bg-(--nd-bg) border border-(--nd-border) text-(--nd-text-secondary) text-xs rounded-full px-2.5 py-1">
                    {kw}
                    <button onClick={() => removeKeyword(kw)} className="cursor-pointer text-(--nd-text-muted) hover:text-rose-500 transition-colors ml-0.5">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-(--nd-text-muted)">Press Enter or click Add after each keyword.</p>
            )}
          </div>

          {/* Competitors */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-(--nd-text-secondary)">
              Competitor domains <span className="text-(--nd-text-muted) font-normal">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                value={newCompetitor}
                onChange={(e) => setNewCompetitor(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCompetitor())}
                placeholder="e.g. ahrefs.com"
                className="flex-1 bg-white border border-(--nd-border) rounded-lg text-sm text-(--nd-text-primary) placeholder:text-(--nd-text-muted) px-3 py-2 focus:outline-none focus:border-rose-500/50 transition-colors"
              />
              <button
                onClick={addCompetitor}
                disabled={!newCompetitor.trim()}
                className="cursor-pointer bg-(--nd-bg) hover:bg-(--nd-border) border border-(--nd-border) disabled:opacity-40 disabled:cursor-not-allowed text-(--nd-text-primary) rounded-lg px-4 py-2 text-sm transition-colors shrink-0"
              >
                Add
              </button>
            </div>
            {competitors.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {competitors.map((c) => (
                  <span key={c} className="flex items-center gap-1 bg-(--nd-bg) border border-(--nd-border) text-(--nd-text-secondary) text-xs rounded-full px-2.5 py-1">
                    {c}
                    <button onClick={() => removeCompetitor(c)} className="cursor-pointer text-(--nd-text-muted) hover:text-rose-500 transition-colors ml-0.5">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Location + Device — always side-by-side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-(--nd-text-secondary)">Location</label>
              <div className="relative">
                <select
                  value={locationCode}
                  onChange={(e) => setLocationCode(Number(e.target.value))}
                  className="cursor-pointer w-full appearance-none bg-white border border-(--nd-border) rounded-lg text-sm text-(--nd-text-primary) pl-3 pr-8 py-2 focus:outline-none focus:border-rose-500/50 transition-colors"
                >
                  {LOCATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--nd-text-muted)" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-(--nd-text-secondary)">Device</label>
              <div className="flex rounded-lg border border-(--nd-border) overflow-hidden text-sm h-9.5">
                {(['desktop', 'mobile'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDevice(d)}
                    className={cn(
                      'cursor-pointer flex-1 capitalize transition-colors text-sm',
                      device === d
                        ? 'bg-rose-500/20 text-rose-600'
                        : 'bg-white text-(--nd-text-secondary) hover:text-(--nd-text-primary)'
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-(--nd-border) bg-(--nd-bg)">
          <button
            onClick={onCancel}
            className="cursor-pointer text-sm text-(--nd-text-muted) hover:text-(--nd-text-secondary) transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onRun}
            disabled={!keywords.length || isDispatching}
            className="cursor-pointer flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-5 py-2 transition-colors"
          >
            {isDispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {isDispatching
              ? 'Starting…'
              : `Run Analysis (${keywords.length} keyword${keywords.length !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, sub,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  sub?: string
}) {
  return (
    <div className="bg-white border border-(--nd-border) rounded-2xl p-4 space-y-1">
      <div className={cn('flex items-center gap-1.5', color)}>{icon}</div>
      <div className={cn('text-2xl font-bold', color)}>{value}</div>
      <div className="text-[11px] text-(--nd-text-muted) leading-tight">{label}</div>
      {sub && <div className="text-[10px] text-(--nd-text-muted)">{sub}</div>}
    </div>
  )
}
