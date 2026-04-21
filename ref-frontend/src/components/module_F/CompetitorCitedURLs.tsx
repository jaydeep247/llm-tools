'use client'

import { useMemo, useState, useRef, useEffect, type FormEvent } from 'react'
import Link from 'next/link'
import { 
  AlertCircle, 
  Globe, 
  Link2, 
  ShieldCheck, 
  TrendingUp, 
  Search, 
  Info,
  Activity,
  Zap,
  Swords,
  Trophy,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Lock,
  Star,
  Shield,
  Layout,
  FileText,
  BarChart3,
  MessageSquare
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatCard } from '@/components/ui/StatCard'
import { 
  type ModuleFMetricRecommendation, 
  useGetModuleFResultQuery, 
  resolveFeatureFlags,
  normaliseMetricRec,
  useAskModuleFAIMutation,
  ModuleFResult
} from '@/store/api/module_F/moduleFApi'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleFAskAiChatShell } from '@/components/module_F/ModuleFAskAiChatShell'

interface CompetitorCitedURLsProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
  jobId?: string | null
}

type ChatTurn = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

function chatMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Scoped Ask AI targets for Cited URLs */
type CitedUrlsAskTarget =
  | 'influence_score'
  | 'domain_authority'
  | 'total_citations'
  | 'top_performer'
  | 'source_domain_analysis'

function buildCitedUrlsAskPrompt(
  target: CitedUrlsAskTarget,
  data: ModuleFResult | null | undefined,
  brandName: string,
): string {
  const recommendations = data?.metric_recommendations
  const sourceData = data?.source_analysis?.competitor_source_analysis || []

  const base = `You are answering from the user's latest Module F "Competitor Cited URLs" run for brand "${brandName}".
Answer immediately — do not ask the user for clarification. Focus ONLY on the metric/section named in the title below.
Use the glossary in PROJECT DATA. Use markdown with short headings and bullets where helpful.`

  switch (target) {
    case 'influence_score':
      return `${base}

**Title: Influence Score Analysis**

Explain what the Influence Score means and interpret the overall source quality (JSON). How reliable are the sources associated with competitors?
${JSON.stringify({
        recommendation: recommendations?.source_influence,
        total_competitors: sourceData.length,
      })}`
    case 'domain_authority':
      return `${base}

**Title: Domain Authority**

Explain the importance of Domain Authority in this source analysis (JSON). How authoritative are the domains being cited for competitors?
${JSON.stringify({
        recommendation: recommendations?.avg_domain_authority,
      })}`
    case 'total_citations':
      return `${base}

**Title: Total Citations**

Analyze the volume and diversity of citations identified (JSON). What does the citation frequency tell us about competitor visibility?
${JSON.stringify({
        recommendation: recommendations?.total_citations,
        total_sources: sourceData.reduce((sum, r) => sum + r.citation_count, 0),
      })}`
    case 'top_performer':
      return `${base}

**Title: Top Performer (Sources)**

Identify and explain why this competitor has the highest quality citation profile (JSON). What makes their source base stronger than others?
${JSON.stringify({
        top_competitor: sourceData.sort((a, b) => b.source_domain_influence_score - a.source_domain_influence_score)[0],
      })}`
    case 'source_domain_analysis':
      return `${base}

**Title: Source Domain Analysis**

Summarize the source domain analysis for the competitors (JSON). Which domains are most frequently cited and what is their typical authority level?
${JSON.stringify({
        source_summary: sourceData.slice(0, 5).map(s => ({
          competitor: s.competitor,
          influence: s.source_domain_influence_score,
          authority: s.average_domain_authority,
          citations: s.citation_count,
        })),
      })}`
  }
}

function MetricAskButton({
  disabled,
  onClick,
}: {
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onClick()
      }}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ borderColor: 'var(--nd-purple)', background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' }}
    >
      <MessageSquare className="size-3 shrink-0" aria-hidden />
      Ask AI
    </button>
  )
}

interface CompetitorCitedURLsProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
  jobId?: string | null
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function formatPercentFromRatio(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (!Number.isFinite(value)) return '—'
  return `${round1(value * 100)}%`
}

export default function CompetitorCitedURLs({ moduleFData, isLoading, jobId }: CompetitorCitedURLsProps) {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null)
  const [searchDomain, setSearchDomain] = useState('')
  const { toast } = useToast()

  const { data: fetched, isLoading: isFetchingModuleF } = useGetModuleFResultQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const effectiveData: ModuleFResult | null | undefined = fetched?.data ?? moduleFData
  const brandName = effectiveData?.compare_visibility_against_competitors?.brand?.name || 'Brand'
  
  const [askModuleFAI, { isLoading: isAskingAI, error: askAIError, reset: resetAskAI }] =
    useAskModuleFAIMutation()

  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatTurn[]>([])
  const [chatFocusBadge, setChatFocusBadge] = useState<string | undefined>(undefined)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!askDialogOpen || !chatScrollRef.current) return
    const el = chatScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [askDialogOpen, chatMessages, isAskingAI])

  const openAskAiDialog = () => {
    if (!jobId) {
      toast({
        title: 'Job not ready yet',
        description: 'Run Module F first so Ask AI can use your stored analysis.',
        variant: 'destructive',
      })
      return
    }
    resetAskAI()
    setChatFocusBadge(undefined)
    setChatMessages([])
    setChatInput('')
    setAskDialogOpen(true)
  }

  const runMetricAskAi = async (target: CitedUrlsAskTarget, displayLabel: string) => {
    if (!jobId) {
      toast({
        title: 'Job not ready yet',
        description: 'Run Module F first so Ask AI can use your stored analysis.',
        variant: 'destructive',
      })
      return
    }
    resetAskAI()
    setChatFocusBadge(displayLabel)
    setChatInput('')
    const userDisplay = `Explain: ${displayLabel}`
    const userTurn: ChatTurn = { id: chatMessageId(), role: 'user', content: userDisplay }
    setChatMessages([userTurn])
    setAskDialogOpen(true)

    const fullPrompt = buildCitedUrlsAskPrompt(target, effectiveData, brandName)

    try {
      const res = await askModuleFAI({
        jobId,
        body: { question: fullPrompt },
      }).unwrap()
      const text = res?.data?.answer?.trim() ?? ''
      const sources = res?.data?.sources
      if (!text) {
        toast({
          title: 'Empty response',
          description: 'The model returned no text. Try again.',
          variant: 'destructive',
        })
        setChatMessages([])
        setAskDialogOpen(false)
        return
      }
      setChatMessages((prev) => [
        ...prev,
        { id: chatMessageId(), role: 'assistant', content: text, sources },
      ])
    } catch (err: unknown) {
      const msg =
        (err as { data?: { message?: string; error?: string } })?.data?.message ||
        (err as { data?: { error?: string } })?.data?.error ||
        (err as Error)?.message ||
        'Please try again.'
      toast({
        title: 'Ask AI failed',
        description: msg,
        variant: 'destructive',
      })
      setChatMessages([])
      setAskDialogOpen(false)
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

    const userTurn: ChatTurn = { id: chatMessageId(), role: 'user', content: question }
    setChatMessages((prev) => [...prev, userTurn])

    try {
      const res = await askModuleFAI({
        jobId,
        body: { question, conversationHistory: priorHistory.length ? priorHistory : undefined },
      }).unwrap()
      const text = res?.data?.answer?.trim() ?? ''
      const sources = res?.data?.sources
      if (!text) {
        toast({
          title: 'Empty response',
          description: 'The model returned no text. Try again or shorten your question.',
          variant: 'destructive',
        })
        return
      }
      setChatMessages((prev) => [
        ...prev,
        { id: chatMessageId(), role: 'assistant', content: text, sources },
      ])
    } catch (err: unknown) {
      const msg =
        (err as { data?: { message?: string; error?: string } })?.data?.message ||
        (err as { data?: { error?: string } })?.data?.error ||
        (err as Error)?.message ||
        'Please try again.'
      toast({
        title: 'Ask AI failed',
        description: msg,
        variant: 'destructive',
      })
      setChatMessages((prev) => prev.filter((m) => m.id !== userTurn.id))
      setChatInput(question)
    }
  }

  const flags = resolveFeatureFlags(effectiveData)

  const sourceData = effectiveData?.source_analysis?.competitor_source_analysis || []
  
  const overall = useMemo(() => {
    if (!sourceData.length) {
      return {
        avgInfluenceScore: 0,
        avgDomainAuthority: 0,
        totalCitations: 0,
        topCompetitor: null as { competitor: string; score: number } | null,
      }
    }

    const avgInfluenceScore = round1(sourceData.reduce((sum, r) => sum + r.source_domain_influence_score, 0) / sourceData.length)
    const avgDomainAuthority = round1(sourceData.reduce((sum, r) => sum + r.average_domain_authority, 0) / sourceData.length)
    const totalCitations = sourceData.reduce((sum, r) => sum + r.citation_count, 0)
    const top = [...sourceData].sort((a, b) => b.source_domain_influence_score - a.source_domain_influence_score)[0]

    return {
      avgInfluenceScore,
      avgDomainAuthority,
      totalCitations,
      topCompetitor: top ? { competitor: top.competitor, score: top.source_domain_influence_score } : null,
    }
  }, [sourceData])

  const activeCompetitor = selectedCompetitor || sourceData[0]?.competitor || null
  const activeRow = sourceData.find((r) => r.competitor === activeCompetitor) || null

  const filteredCitations = useMemo(() => {
    if (!activeRow) return []
    const needle = searchDomain.trim().toLowerCase()
    const base = activeRow.top_citations
    if (!needle) return base
    return base.filter((c) => c.domain.toLowerCase().includes(needle))
  }, [activeRow, searchDomain])

  if (isLoading || isFetchingModuleF) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-32 rounded-3xl border" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-border)' }} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl p-5 border h-32" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-border)' }} />
          ))}
        </div>
        <div className="h-96 rounded-2xl border" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-border)' }} />
      </div>
    )
  }

  const hasData = sourceData.length > 0
  const sourceRec = normaliseMetricRec(effectiveData?.metric_recommendations?.source_influence)
  const domainAuthorityRec = normaliseMetricRec(effectiveData?.metric_recommendations?.avg_domain_authority)
  const citationsRec = normaliseMetricRec(effectiveData?.metric_recommendations?.total_citations)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Dialog
        open={askDialogOpen}
        onOpenChange={(open) => {
          setAskDialogOpen(open)
          if (!open) {
            resetAskAI()
            setChatMessages([])
            setChatInput('')
            setChatFocusBadge(undefined)
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
          <ModuleFAskAiChatShell
            brandName={brandName}
            focusBadge={chatFocusBadge}
            chatScrollRef={chatScrollRef}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            isAskingAI={isAskingAI}
            askAIError={askAIError}
            onSubmit={submitAskAi}
            onSuggestionClick={(text) => setChatInput(text)}
          />
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl border shrink-0" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
              <Globe className="w-6 h-6" style={{ color: 'var(--nd-purple)' }} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="nd-page-title">Competitor Cited URLs</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--nd-purple)', background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' }}>Source Analysis</span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>
                Evaluate the authority and influence of domains cited by or associated with competitors in AI responses.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 md:self-start shrink-0">
            <div className="flex flex-col items-end gap-0.5 px-4 py-2 rounded-xl border" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>Tracking</span>
              <span className="text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>{sourceData.length} Competitors</span>
            </div>
            <Button
              type="button"
              onClick={openAskAiDialog}
              disabled={isAskingAI}
              className="rounded-xl text-xs font-bold uppercase tracking-wider px-4 py-2 border-0"
              style={{ background: 'var(--nd-purple)', color: '#fff' }}
            >
              <MessageSquare className="size-4 shrink-0 mr-1.5" strokeWidth={2.25} aria-hidden />
              Ask AI
            </Button>
          </div>
        </div>
      </div>

      {!flags.competitor_cited_urls ? (
        <div className="rounded-2xl border p-16 text-center" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
          <div className="w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto mb-5" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
            <Lock className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />
          </div>
          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--nd-text-primary)' }}>Source Authority Tracking</h3>
          <p className="text-sm max-w-sm mx-auto leading-relaxed mb-6" style={{ color: 'var(--nd-text-secondary)' }}>
            Upgrade to Agency or Enterprise to unlock source analysis, domain authority tracking, and citation frequency data.
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl border" style={{ borderColor: 'var(--nd-purple)', background: 'var(--nd-purple-subtle)' }}>
              <Shield className="w-4 h-4" style={{ color: 'var(--nd-purple)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-purple)' }}>Agency</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-200 bg-amber-50">
              <Zap className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">Enterprise</span>
            </div>
          </div>
        </div>
      ) : !hasData ? (
        <AnalysisEmptyState
          icon={<Link2 className="w-8 h-8 text-zinc-400" />}
          title="No Source Analysis Data"
          description="Run Module F from the Visibility Comparison tab to generate source analysis data for competitors."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Avg Influence Score"
              value={overall.avgInfluenceScore}
              subtext="Overall source quality"
              icon={ShieldCheck}
              accent="violet"
              progress={overall.avgInfluenceScore}
              description={sourceRec?.why || "Overall quality and reliability of sources cited for competitors."}
              labelAction={
                <MetricAskButton
                  disabled={!jobId || isAskingAI}
                  onClick={() => runMetricAskAi('influence_score', 'Avg Influence Score')}
                />
              }
            />

            <StatCard
              label="Avg Domain Authority"
              value={overall.avgDomainAuthority}
              subtext="Authority of cited sources"
              icon={Globe}
              accent="blue"
              progress={overall.avgDomainAuthority}
              description={domainAuthorityRec?.why || "Average Moz Domain Authority score of domains cited in AI results."}
              labelAction={
                <MetricAskButton
                  disabled={!jobId || isAskingAI}
                  onClick={() => runMetricAskAi('domain_authority', 'Avg Domain Authority')}
                />
              }
            />

            <StatCard
              label="Total Citations"
              value={overall.totalCitations}
              subtext="Sources identified"
              icon={Link2}
              accent="emerald"
              description={citationsRec?.why || "Total number of unique URLs and domains cited across all analyzed prompts."}
              labelAction={
                <MetricAskButton
                  disabled={!jobId || isAskingAI}
                  onClick={() => runMetricAskAi('total_citations', 'Total Citations')}
                />
              }
            />

            <StatCard
              label="Top Performer"
              value={overall.topCompetitor?.competitor ?? '—'}
              subtext={`Score: ${overall.topCompetitor?.score ?? 0}/100`}
              icon={Trophy}
              accent="amber"
              progress={overall.topCompetitor?.score}
              description="Competitor with the highest quality and most authoritative citation profile."
              labelAction={
                <MetricAskButton
                  disabled={!jobId || isAskingAI}
                  onClick={() => runMetricAskAi('top_performer', 'Top Performer')}
                />
              }
            />
          </div>

          <SectionCard
            title="Source Domain Analysis"
            description="Deep dive into the domains and specific URLs cited by AI models for each competitor."
            actionSlot={
              <MetricAskButton
                disabled={!jobId || isAskingAI}
                onClick={() => runMetricAskAi('source_domain_analysis', 'Source Domain Analysis')}
              />
            }
          >
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Sidebar / Selector */}
              <div className="w-full lg:w-72 shrink-0 space-y-6">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4" style={{ color: 'var(--nd-text-muted)' }}>Competitors</div>
                  <div className="flex flex-col gap-2">
                    {sourceData.map((row) => (
                      <button
                        key={row.competitor}
                        onClick={() => setSelectedCompetitor(row.competitor)}
                        className="flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 text-left group"
                        style={activeCompetitor === row.competitor
                          ? { background: 'var(--nd-purple-subtle)', borderColor: 'var(--nd-purple)', color: 'var(--nd-text-primary)' }
                          : { background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-2 h-2 rounded-full shrink-0 transition-all"
                            style={{ background: activeCompetitor === row.competitor ? 'var(--nd-purple)' : 'var(--nd-border)' }}
                          />
                          <span className="font-bold truncate text-sm">{row.competitor}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 shrink-0 transition-transform" style={{ color: activeCompetitor === row.competitor ? 'var(--nd-purple)' : 'var(--nd-text-muted)' }} />
                      </button>
                    ))}
                  </div>
                </div>

                {activeRow && (
                  <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border-b pb-3" style={{ color: 'var(--nd-text-muted)', borderColor: 'var(--nd-border)' }}>
                      <BarChart3 className="w-3.5 h-3.5" style={{ color: 'var(--nd-purple)' }} /> Performance
                    </div>
                    <div className="space-y-3">
                      {[['Credibility Score', `${activeRow.credibility_score}/100`], ['Unique Domains', String(activeRow.unique_domains)], ['Source Diversity', `${Math.round((activeRow.source_diversity ?? 0) * 100)}%`]].map(([label, val]) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>{label}</span>
                          <span className="text-sm font-bold font-mono" style={{ color: 'var(--nd-text-primary)' }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-3 border-t" style={{ borderColor: 'var(--nd-border)' }}>
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--nd-text-muted)' }}>Top Domains</div>
                      <div className="space-y-2">
                        {(activeRow.citation_frequency ?? []).slice(0, 3).map((freq, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
                            <span className="text-[11px] truncate max-w-[120px]" style={{ color: 'var(--nd-text-secondary)' }} title={freq.domain}>{freq.domain}</span>
                            <Badge className="text-[9px] h-4" style={{ background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)', border: '1px solid var(--nd-purple)' }}>{freq.count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Main Content Area */}
              <div className="flex-1 min-w-0 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl border" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                      <Link2 className="w-5 h-5" style={{ color: 'var(--nd-purple)' }} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold leading-tight" style={{ color: 'var(--nd-text-primary)' }}>{activeCompetitor} Citations</h3>
                      <p className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>Showing {filteredCitations.length} cited sources</p>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--nd-text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Filter by domain..."
                      className="rounded-xl pl-10 pr-4 py-2 text-sm w-full md:w-64 outline-none border transition-all"
                      style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
                      value={searchDomain}
                      onChange={(e) => setSearchDomain(e.target.value)}
                    />
                  </div>
                </div>

                <ScrollArea className="h-[600px] pr-4 -mr-2">
                  <div className="space-y-3 pb-4">
                    {filteredCitations.map((citation, idx) => (
                      <div key={idx} className="group relative border rounded-xl p-4 transition-all duration-200 hover:shadow-sm" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
                        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-colors" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                              <Globe className="w-4 h-4" style={{ color: 'var(--nd-purple)' }} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold truncate" style={{ color: 'var(--nd-text-primary)' }}>{citation.domain}</span>
                                <Badge className="text-[9px] font-bold h-4 bg-blue-50 text-blue-700 border-blue-200">DA {citation.authority_score}</Badge>
                                {citation.content_type && (
                                  <Badge className="text-[9px] h-4 uppercase" style={{ background: 'var(--nd-bg)', color: 'var(--nd-text-muted)', border: '1px solid var(--nd-border)' }}>{citation.content_type}</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] font-mono truncate" style={{ color: 'var(--nd-text-muted)' }}>
                                <Link2 className="w-3 h-3 shrink-0" />
                                <a href={citation.url || '#'} target="_blank" rel="noopener noreferrer" className="truncate hover:underline transition-colors" style={{ color: 'var(--nd-blue)' }}>
                                  {citation.url || citation.domain}
                                </a>
                                <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 border px-4 py-2 rounded-xl w-full md:w-auto" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                            <div className="flex flex-col items-center border-r pr-4" style={{ borderColor: 'var(--nd-border)' }}>
                              <span className="text-[9px] font-bold uppercase tracking-tighter" style={{ color: 'var(--nd-text-muted)' }}>Frequency</span>
                              <span className="text-sm font-bold font-mono" style={{ color: 'var(--nd-text-primary)' }}>
                                {activeRow?.citation_frequency?.find(f => f.domain === citation.domain)?.count ?? 1}x
                              </span>
                            </div>
                            <div className="flex flex-col items-end flex-1 md:flex-none">
                              <Link
                                href={`/dashboard/module_C/generate?url=${encodeURIComponent(citation.url || citation.domain)}`}
                                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors group/link"
                                style={{ color: 'var(--nd-purple)' }}
                              >
                                Create Competing Content
                                <ChevronRight className="w-3 h-3 group-hover/link:translate-x-1 transition-transform" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {filteredCitations.length === 0 && (
                      <div className="text-center py-16 border rounded-2xl border-dashed" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                        <div className="w-12 h-12 rounded-xl border flex items-center justify-center mx-auto mb-4" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
                          <Search className="w-6 h-6" style={{ color: 'var(--nd-text-muted)' }} />
                        </div>
                        <h3 className="font-bold mb-1" style={{ color: 'var(--nd-text-primary)' }}>No domains found</h3>
                        <p className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>Try adjusting your search filter.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  )
}
