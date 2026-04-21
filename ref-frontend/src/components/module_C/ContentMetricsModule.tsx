'use client'

import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Loader2, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  Brain, 
  Search, 
  Shield, 
  Database, 
  Activity,
  Zap,
  List,
  BarChart,
  Eye,
  MessageSquare,
  BookOpen,
  ShoppingBag,
  Scale,
  CreditCard,
  Bot,
  HelpCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetContentMetricsQuery, useStartContentMetricsMutation } from '@/store/api/contentMetricsApi'
import { useGetSessionJobsQuery } from '@/store/api/jobApi'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RecommendationEnginePanel, RecommendationEnginePayload } from '@/components/module_D/RecommendationEnginePanel'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleDAskAiChatShell, type ModuleDAskAiChatTurn } from '@/components/module_D/ModuleDAskAiChatShell'
import { useAskModuleDAIMutation, useGetModuleDSuggestedQuestionsMutation } from '@/store/api/module_D/moduleDApi'
import { useToast } from '@/hooks/use-toast'

// Score Card Component - Adapted from AIVisibilityScorecards
interface ScoreCardProps {
  title: string
  score?: number | null
  value?: string | number | React.ReactNode
  icon: React.ReactNode
  color: string
  trend?: number
  subStats?: { label: string; value: string | number | React.ReactNode }[]
  error?: string
  isLoading?: boolean
  description?: string
  footer?: React.ReactNode
  suffix?: string
  help?: { meaning?: string; improve?: string } | null
  labelAction?: React.ReactNode
}

function ScoreCard({ title, score, value, icon, color, trend, subStats, error, isLoading, description, footer, suffix = '/100', help, labelAction }: ScoreCardProps) {
  const getScoreLabel = (s: number) => {
    if (s >= 80) return { text: 'Excellent', color: 'text-[var(--nd-positive-text)] bg-[var(--nd-positive-bg)] border-emerald-500/20' }
    if (s >= 60) return { text: 'Good', color: 'text-amber-600 bg-amber-50 border-amber-500/20' }
    if (s >= 40) return { text: 'Fair', color: 'text-orange-600 bg-orange-50 border-orange-500/20' }
    return { text: 'Needs Work', color: 'text-[var(--nd-negative-text)] bg-[var(--nd-negative-bg)] border-rose-500/20' }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl p-5 border animate-pulse h-full" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl" style={{ background: 'var(--nd-bg)' }} />
          <div className="h-4 w-24 rounded" style={{ background: 'var(--nd-bg)' }} />
        </div>
        <div className="h-12 w-20 rounded mt-4" style={{ background: 'var(--nd-bg)' }} />
      </div>
    )
  }

  return (
    <div className="rounded-xl p-5 border transition-all duration-300 group h-full flex flex-col" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className={cn("p-2.5 rounded-xl shrink-0 border", color)}>
            {icon}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="min-w-0">
              <span className="text-sm font-medium block" style={{ color: 'var(--nd-text-primary)' }}>{title}</span>
              {description && !help && <span className="text-xs block mt-0.5 leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>{description}</span>}
            </div>
            {help && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center transition-colors focus:outline-none shrink-0 cursor-help"
                    style={{ color: 'var(--nd-text-muted)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nd-text-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nd-text-muted)'}
                    aria-label={`${title} help`}
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  sideOffset={10}
                  className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5"
                  style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
                >
                  <div className="space-y-1.5">
                    {help.meaning && <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{help.meaning}</span></div>}
                    {help.improve && <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{help.improve}</span></div>}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {labelAction && <div className="ml-1">{labelAction}</div>}
          </div>
        </div>
        {score !== undefined && score !== null && !error && (
          <span className={cn(
            "text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider shrink-0 ml-2 border",
            getScoreLabel(score).color
          )}>
            {getScoreLabel(score).text}
          </span>
        )}
      </div>

      {/* Score/Value */}
      <div className="flex items-end justify-between mb-4">
        <div>
          {error ? (
            <div className="flex items-center gap-2" style={{ color: 'var(--nd-negative-text)' }}>
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">Error</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              {value !== undefined ? (
                <span className="text-4xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{value}</span>
              ) : score !== undefined && score !== null ? (
                <>
                  <span className="text-4xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{score}</span>
                  <span className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>{suffix}</span>
                </>
              ) : (
                <span className="text-3xl font-bold" style={{ color: 'var(--nd-text-muted)' }}>--</span>
              )}
            </div>
          )}
          
          {/* Trend */}
          {trend !== undefined && !error && (
            <div className={cn(
              "flex items-center gap-1 mt-2 text-xs font-bold",
              trend >= 0 ? "text-[var(--nd-positive-text)]" : "text-[var(--nd-negative-text)]"
            )}>
              {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{trend >= 0 ? '+' : ''}{trend.toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Mini Stats / Content */}
      <div className="mt-auto space-y-3">
        {subStats && subStats.length > 0 && !error && (
          <div className={cn(
            "grid gap-3 pt-3 border-t",
            subStats.length === 1 ? "grid-cols-1" : "grid-cols-2"
          )} style={{ borderColor: 'var(--nd-border)' }}>
            {subStats.map((stat, i) => (
              <div key={i}>
                <div className="text-xs mb-1" style={{ color: 'var(--nd-text-muted)' }}>{stat.label}</div>
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--nd-text-primary)' }}>{stat.value}</div>
              </div>
            ))}
          </div>
        )}
        {footer}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-xs mt-2 line-clamp-2 text-rose-500">{error}</p>
      )}
    </div>
  )
}

interface ContentMetricsModuleProps {
  url: string
  sessionId?: string
  projectId?: string
  initialTab?: 'content-analysis' | 'intent-clusters' | 'entity-detection' | 'recommendations'
  /** When set, renders only this single section without the internal tab switcher. */
  section?: 'content-analysis' | 'intent-clusters' | 'entity-detection' | 'recommendations'
}

/** Scoped Ask AI targets for Module D (Content Analysis) */
type ModuleDMetricAskTarget =
  | 'content_type_accuracy'
  | 'prompt_intent_match'
  | 'visibility_impact'
  | 'clustering_accuracy'
  | 'total_prompts'
  | 'categorized'
  | 'intent_cluster_distribution'
  | 'entities_detected'
  | 'coverage_score'
  | 'entity_relevance'
  | 'visibility_score_breakdown'

function buildModuleDAskPrompt(
  target: ModuleDMetricAskTarget,
  metrics: any,
  entityMetrics: any,
  trackingIntel: any,
): string {
  const base = `You are answering from the user's latest "Content Analysis" run.
Answer immediately — do not ask the user for clarification. Focus ONLY on the metric/section named in the title below.
Use markdown with short headings and bullets where helpful.`

  switch (target) {
    case 'content_type_accuracy':
      return `${base}

**Title: Content Type Accuracy**

Explain what this accuracy score means for the content. Interpret why the system suggested "${metrics?.suggested_content_type}" as the type.
${JSON.stringify({
        accuracy: metrics?.content_type_accuracy,
        suggested_type: metrics?.suggested_content_type,
        help: metrics?.metric_help?.content_type_accuracy,
      })}`

    case 'prompt_intent_match':
      return `${base}

**Title: Prompt Intent Match**

Analyze how well this content matches user search intent. Interpret the matched intents and the confidence level.
${JSON.stringify({
        match_score: metrics?.prompt_intent_match,
        intents: metrics?.prompt_intent_details?.matched_intents,
        confidence: metrics?.prompt_intent_details?.confidence,
        help: metrics?.metric_help?.prompt_intent_match,
      })}`

    case 'visibility_impact':
      return `${base}

**Title: Visibility Impact**

Explain the potential impact on search visibility. What are the key factors driving this score?
${JSON.stringify({
        impact_score: metrics?.visibility_impact,
        factors: metrics?.visibility_factors?.factors,
        help: metrics?.metric_help?.visibility_impact,
      })}`

    case 'clustering_accuracy':
      return `${base}

**Title: Clustering Accuracy**

Explain the precision of the intent classification for these prompts.
${JSON.stringify({
        accuracy: metrics?.prompt_intent_details?.cluster_metrics?.clustering_accuracy,
        help: metrics?.metric_help?.clustering_accuracy,
      })}`

    case 'total_prompts':
      return `${base}

**Title: Total Prompts Analyzed**

Explain the volume of prompts analyzed in this session and what it represents for the site's visibility coverage.
${JSON.stringify({
        total: metrics?.prompt_intent_details?.cluster_metrics?.total_prompts,
        help: metrics?.metric_help?.total_prompts,
      })}`

    case 'categorized':
      return `${base}

**Title: Categorized Coverage**

Explain the percentage of prompts successfully mapped to intent clusters and why coverage matters.
${JSON.stringify({
        coverage: metrics?.prompt_intent_details?.cluster_metrics?.coverage_percentage,
        help: metrics?.metric_help?.coverage_percentage,
      })}`

    case 'intent_cluster_distribution':
      return `${base}

**Title: Intent Cluster Distribution**

Analyze the distribution of prompts across different intent categories (Informational, Commercial, etc.). What does this mix tell us about the user journey?
${JSON.stringify({
        distribution: metrics?.prompt_intent_details?.intent_clusters,
        tracking_distribution: trackingIntel?.intent_cluster_distribution,
      })}`

    case 'entities_detected':
      return `${base}

**Title: Entities Detected**

Explain the significance of the number of required entities found in the content.
${JSON.stringify({
        count: entityMetrics?.entities_detected_count,
        help: metrics?.metric_help?.entities_detected_count,
      })}`

    case 'coverage_score':
      return `${base}

**Title: Entity Coverage Score**

Analyze the percentage of required entities included. How does this impact the content's authority?
${JSON.stringify({
        coverage: entityMetrics?.entity_coverage_score,
        help: metrics?.metric_help?.entity_coverage_score,
      })}`

    case 'entity_relevance':
      return `${base}

**Title: Entity Relevance**

Explain how relevant the detected entities are to the target search intent.
${JSON.stringify({
        relevance: entityMetrics?.entity_relevance_score,
        relevant_entities: entityMetrics?.entity_relevance_details?.relevant_entities,
        irrelevant_entities: entityMetrics?.entity_relevance_details?.irrelevant_entities,
        help: metrics?.metric_help?.entity_relevance_score,
      })}`

    case 'visibility_score_breakdown':
      return `${base}

**Title: Visibility Score Breakdown**

Provide a detailed breakdown of the visibility score components. What are the strongest and weakest areas?
${JSON.stringify({
        breakdown: metrics?.visibility_factors?.score_breakdown,
        help: metrics?.metric_help?.visibility_score_breakdown,
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
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--nd-purple)]/30 bg-[var(--nd-purple)]/5',
        'px-2 py-0.5 text-xs font-bold uppercase tracking-wider',
        'hover:bg-[var(--nd-purple)]/10 transition-colors cursor-pointer shrink-0',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
      style={{ color: 'var(--nd-purple)' }}
    >
      <MessageSquare className="size-3 shrink-0" aria-hidden />
      Ask AI
    </button>
  )
}

function chatMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function ContentMetricsModule({ url, sessionId, projectId, initialTab, section }: ContentMetricsModuleProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const subtab = searchParams.get('subtab') || initialTab || 'content-analysis'
  const [activeTab, setActiveTab] = useState<'content-analysis' | 'intent-clusters' | 'entity-detection' | 'recommendations'>(
    section ? section :
    subtab === 'intent-clusters' ? 'intent-clusters' : 
    subtab === 'entity-detection' ? 'entity-detection' : 
    subtab === 'recommendations' ? 'recommendations' :
    'content-analysis'
  )
  
  // When section is set, always lock to that section
  useEffect(() => {
    if (section && activeTab !== section) {
      setActiveTab(section)
    }
  }, [section, activeTab])

  useEffect(() => {
    if (!section && !searchParams.get('subtab') && initialTab) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('subtab', initialTab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }, [searchParams, pathname, router, initialTab, section])
  
  // Update URL when tab changes
  const handleTabChange = (tab: 'content-analysis' | 'intent-clusters' | 'entity-detection') => {
    if (section) return // locked to a single section
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('subtab', tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  
  // Resolve latest job for this session
  const sessionIdStr = sessionId ? String(sessionId) : undefined
  const { data: jobsData } = useGetSessionJobsQuery(sessionIdStr!, {
    skip: !sessionIdStr,
  })
  const jobs = jobsData?.data || []
  const sortedJobs = [...jobs].sort((a: any, b: any) => {
    const aTime = new Date(a.createdAt || 0).getTime()
    const bTime = new Date(b.createdAt || 0).getTime()
    return bTime - aTime
  })

  // Resolve job that actually owns raw HTML in S3.
  // For normal sessions it's CRAWL; for Quick Start it's MODULE_E_QUICK_START.
  const getJobType = (j: any) => String(j?.jobType || j?.type || '').toUpperCase()
  const crawlJob = sortedJobs.find((j: any) => getJobType(j) === 'CRAWL')
  const quickStartJob = sortedJobs.find((j: any) => {
    const t = getJobType(j)
    return t === 'MODULE_E_QUICK_START' || t.includes('QUICK_START')
  })
  const htmlSourceJob = crawlJob || quickStartJob || null
  const latestJob = sortedJobs.length > 0 ? sortedJobs[0] : null

  // Always read/write content metrics against the HTML-source job when available.
  const jobId = (htmlSourceJob?.id || latestJob?.id) as string | undefined
  const sourceJobId = htmlSourceJob?.id as string | undefined

  const [hasTriggeredAnalysis, setHasTriggeredAnalysis] = useState(false)

  // Fetch content metrics from database for the latest job
  // Poll every 5s while waiting for analysis results after user triggers it
  const {
    data: contentMetricsData,
    isLoading: isLoadingMetrics,
    error: metricsError,
    refetch,
  } = useGetContentMetricsQuery(jobId || '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const [startContentMetrics, { isLoading: isStartingAnalysis }] = useStartContentMetricsMutation()
  const [askModuleDAI, { isLoading: isAskingAI, error: askAIError, reset: resetAskAI }] = useAskModuleDAIMutation()
  const [getSuggestedQuestions] = useGetModuleDSuggestedQuestionsMutation()
  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ModuleDAskAiChatTurn[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [chatFocusBadge, setChatFocusBadge] = useState<string | undefined>(undefined)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Extract metrics from response
  const metricsResult = contentMetricsData?.success ? contentMetricsData.data : null
  
  const contentMetrics = metricsResult?.content_metrics
  const entityMetrics = metricsResult?.entity_metrics
  const recommendations = metricsResult?.recommendations as RecommendationEnginePayload | undefined
  const trackingPromptIntel = (metricsResult as any)?.prompt_intelligence

  // Stop polling once data arrives
  useEffect(() => {
    if (hasTriggeredAnalysis && (contentMetrics || entityMetrics)) {
      setHasTriggeredAnalysis(false)
    }
  }, [hasTriggeredAnalysis, contentMetrics, entityMetrics])

  // Whether we're in a waiting state (analysis triggered, no data yet)
  const isWaitingForAnalysis = hasTriggeredAnalysis && !contentMetrics && !entityMetrics && !metricsError

  const handleStartAnalysis = async () => {
    if (!jobId) return
    try {
      setHasTriggeredAnalysis(true)
      await startContentMetrics({ jobId, sourceJobId }).unwrap()
    } catch (e) {
      // no-op: error will surface via metricsError on next fetch
    }
  }

  useEffect(() => {
    if (!jobId) return
    let timer: any
    if (isWaitingForAnalysis) {
      timer = setInterval(() => {
        refetch()
      }, 5000)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isWaitingForAnalysis, jobId, refetch])

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600'
    if (score >= 60) return 'text-amber-600'
    if (score >= 40) return 'text-orange-600'
    return 'text-rose-600'
  }

  const intentKeysInOrder: string[] = [
    'informational',
    'commercial',
    'comparative',
    'transactional',
    'agent'
  ]
  const trackingIntentDistribution = trackingPromptIntel?.intent_cluster_distribution as Record<string, number> | undefined
  const trackingIntentTotal = trackingIntentDistribution
    ? intentKeysInOrder.reduce((sum, key) => sum + Number(trackingIntentDistribution?.[key] ?? 0), 0)
    : 0

  useEffect(() => {
    if (!askDialogOpen || !chatScrollRef.current) return
    const el = chatScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [askDialogOpen, chatMessages, isAskingAI])

  const openAskAiDialog = async () => {
    if (!projectId) return
    resetAskAI()
    setChatMessages([])
    setChatInput('')
    setChatFocusBadge(undefined)
    setAskDialogOpen(true)
    try {
      const res = await getSuggestedQuestions({ project_id: projectId }).unwrap()
      setSuggestions(Array.isArray(res?.questions) ? res.questions.filter(Boolean).slice(0, 12) : [])
    } catch {
      setSuggestions([])
    }
  }

  const runMetricAskAi = async (target: ModuleDMetricAskTarget, displayLabel: string) => {
    if (!projectId || !jobId) {
      toast({
        title: 'Project/Job not ready',
        description: 'Please ensure you have an active project and job.',
        variant: 'destructive',
      })
      return
    }
    resetAskAI()
    setChatFocusBadge(displayLabel)
    setChatInput('')
    const userDisplay = `Explain: ${displayLabel}`
    const userTurn: ModuleDAskAiChatTurn = { id: chatMessageId(), role: 'user', content: userDisplay }
    setChatMessages([userTurn])
    setAskDialogOpen(true)

    const fullPrompt = buildModuleDAskPrompt(target, contentMetrics, entityMetrics, trackingPromptIntel)

    try {
      const res = await askModuleDAI({
        project_id: projectId,
        job_id: jobId,
        question: fullPrompt,
      }).unwrap()

      const text = res?.answer?.trim() || res?.data?.answer?.trim() || ''
      const sources = res?.sources || res?.data?.sources
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
    } catch (err: any) {
      const msg = err?.data?.message || err?.data?.error || err?.message || 'Please try again.'
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
    if (!projectId || !chatInput.trim() || isAskingAI) return

    const question = chatInput.trim()
    setChatInput('')
    const priorHistory = chatMessages.slice(-6).map((m) => ({ role: m.role, content: m.content }))
    const userTurn: ModuleDAskAiChatTurn = { id: chatMessageId(), role: 'user', content: question }
    setChatMessages((prev) => [...prev, userTurn])

    try {
      const res = await askModuleDAI({
        project_id: projectId,
        job_id: jobId,
        question,
        conversation_history: priorHistory.length ? priorHistory : undefined,
      }).unwrap()

      const text = res?.answer?.trim() || res?.data?.answer?.trim() || ''
      const sources = res?.sources || res?.data?.sources
      if (!text) return
      setChatMessages((prev) => [...prev, { id: chatMessageId(), role: 'assistant', content: text, sources }])
    } catch {
      setChatMessages((prev) => prev.filter((m) => m.id !== userTurn.id))
      setChatInput(question)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Dialog
        open={askDialogOpen}
        onOpenChange={(open) => {
          setAskDialogOpen(open)
          if (!open) {
            resetAskAI()
            setChatMessages([])
            setChatInput('')
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
          <ModuleDAskAiChatShell
            chatScrollRef={chatScrollRef}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            isAskingAI={isAskingAI}
            askAIError={askAIError}
            onSubmit={submitAskAi}
            onSuggestionClick={(text) => setChatInput(text)}
            suggestions={suggestions}
            focusBadge={chatFocusBadge}
          />
        </DialogContent>
      </Dialog>

      {/* Header Section with Tabs - hidden when locked to a single section */}
      {!section && (
        <div className="space-y-6">
          {/* Tab Navigation - Larger size */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl border w-fit" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
            <Button
              onClick={() => handleTabChange('content-analysis')}
              variant={activeTab === 'content-analysis' ? 'default' : 'ghost'}
              size="lg"
              className={cn(
                "text-base font-bold px-6 py-3 rounded-lg transition-all cursor-pointer",
                activeTab === 'content-analysis' 
                  ? 'shadow-lg' 
                  : 'hover:bg-black/5'
              )}
              style={activeTab === 'content-analysis' ? { background: 'var(--nd-purple)', color: '#ffffff' } : { color: 'var(--nd-text-secondary)' }}
            >
              Content Analysis Metrics
            </Button>
            <Button
              onClick={() => handleTabChange('intent-clusters')}
              variant={activeTab === 'intent-clusters' ? 'default' : 'ghost'}
              size="lg"
              className={cn(
                "text-base font-bold px-6 py-3 rounded-lg transition-all cursor-pointer",
                activeTab === 'intent-clusters' 
                  ? 'shadow-lg' 
                  : 'hover:bg-black/5'
              )}
              style={activeTab === 'intent-clusters' ? { background: 'var(--nd-purple)', color: '#ffffff' } : { color: 'var(--nd-text-secondary)' }}
            >
              Prompt Intent Clusters
            </Button>
            <Button
              onClick={() => handleTabChange('entity-detection')}
              variant={activeTab === 'entity-detection' ? 'default' : 'ghost'}
              size="lg"
              className={cn(
                "text-base font-bold px-6 py-3 rounded-lg transition-all cursor-pointer",
                activeTab === 'entity-detection' 
                  ? 'shadow-lg' 
                  : 'hover:bg-black/5'
              )}
              style={activeTab === 'entity-detection' ? { background: 'var(--nd-purple)', color: '#ffffff' } : { color: 'var(--nd-text-secondary)' }}
            >
              Entity Detection Metrics
            </Button>
          </div>
        </div>
      )}

      {/* Content Analysis Metrics Tab */}
      {activeTab === 'content-analysis' && (
        <div className="rounded-xl border p-6 space-y-6" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
          {contentMetrics && (
            <div className="flex items-center justify-end">
              <Button
                type="button"
                onClick={openAskAiDialog}
                disabled={!projectId || isAskingAI}
                className={cn(
                  'rounded-full border-0 shadow-lg shadow-fuchsia-950/30',
                  'text-sm font-extrabold uppercase tracking-wider sm:text-base',
                  'bg-gradient-to-r from-purple-500 via-pink-500 to-amber-300',
                  'text-black hover:opacity-95 hover:shadow-xl',
                  'h-auto min-h-[44px] px-5 py-2.5',
                  'gap-2',
                )}
              >
                <MessageSquare className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
                Ask AI
              </Button>
            </div>
          )}

          {/* Empty State + Trigger */}
          {!contentMetrics && !isLoadingMetrics && !metricsError && !isWaitingForAnalysis && !isStartingAnalysis && (
            <AnalysisEmptyState
              icon={<FileText className="w-8 h-8" style={{ color: 'var(--nd-text-secondary)' }} />}
              title="No Content Metrics Data"
              description="No content metrics available yet. Run an analysis to see content insights."
              onRunAnalysis={jobId ? handleStartAnalysis : undefined}
              isAnalyzing={isStartingAnalysis}
              disabled={!jobId}
              buttonLabel="Run Content Metrics Analysis"
            />
          )}

          {/* Loading / Waiting State */}
          {(isLoadingMetrics || isWaitingForAnalysis || isStartingAnalysis) && !contentMetrics && (
            <div className="p-8 text-center border rounded-xl" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
              <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: 'var(--nd-purple)' }} />
              <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>
                {isStartingAnalysis ? 'Starting analysis...' : 'Running analysis — this may take a moment...'}
              </p>
            </div>
          )}

          {/* Error Display */}
          {metricsError && !contentMetrics && (
            <div className="p-4 border rounded-lg" style={{ background: 'rgba(244, 63, 94, 0.1)', borderColor: 'rgba(244, 63, 94, 0.2)' }}>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <p className="text-sm text-rose-500">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {/* Content Analysis Results */}
          {contentMetrics && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Content Type Accuracy */}
              <ScoreCard
                title="Content Type Accuracy"
                description="How accurately the system identifies your content type"
                score={contentMetrics.content_type_accuracy || 0}
                icon={<MessageSquare className="w-5 h-5 text-blue-500" />}
                color="bg-blue-50"
                subStats={[
                  { label: 'Suggested Type', value: contentMetrics.suggested_content_type || 'Unknown' }
                ]}
                help={contentMetrics.metric_help ? {
                  meaning: contentMetrics.metric_help?.content_type_accuracy?.meaning,
                  improve: contentMetrics.metric_help?.content_type_accuracy?.improve,
                } : null}
                labelAction={
                  <MetricAskButton
                    disabled={!projectId || isAskingAI}
                    onClick={() => runMetricAskAi('content_type_accuracy', 'Content Type Accuracy')}
                  />
                }
              />

              {/* Prompt Intent Match */}
              <ScoreCard
                title="Prompt Intent Match"
                description="How well your content matches user search intent"
                score={contentMetrics.prompt_intent_match || 0}
                icon={<Brain className="w-5 h-5 text-blue-500" />}
                color="bg-blue-50"
                subStats={[
                  { 
                    label: 'Matched Intents', 
                    value: (
                      <div className="flex flex-wrap gap-1">
                        {contentMetrics.prompt_intent_details?.matched_intents && contentMetrics.prompt_intent_details.matched_intents.length > 0 ? (
                          contentMetrics.prompt_intent_details.matched_intents.slice(0, 3).map((intent: string, idx: number) => (
                            <span key={idx} className="text-xs px-2 py-0.5 rounded-full border truncate font-medium" style={{ background: 'var(--nd-bg)', color: 'var(--nd-text-primary)', borderColor: 'var(--nd-border)' }}>{intent}</span>
                          ))
                        ) : (
                          <span className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>No intents detected</span>
                        )}
                      </div>
                    )
                  },
                  { label: 'Confidence', value: `${contentMetrics.prompt_intent_details?.confidence ?? 0}%` }
                ]}
                help={contentMetrics.metric_help ? {
                  meaning: contentMetrics.metric_help?.prompt_intent_match?.meaning,
                  improve: contentMetrics.metric_help?.prompt_intent_match?.improve,
                } : null}
                labelAction={
                  <MetricAskButton
                    disabled={!projectId || isAskingAI}
                    onClick={() => runMetricAskAi('prompt_intent_match', 'Prompt Intent Match')}
                  />
                }
              />

              {/* Visibility Impact */}
              <ScoreCard
                title="Visibility Impact"
                description="Potential impact on search visibility and ranking"
                score={contentMetrics.visibility_impact || 0}
                icon={<Eye className="w-5 h-5 text-emerald-600" />}
                color="bg-emerald-50"
                subStats={[
                  { 
                    label: 'Key Factors', 
                    value: (
                      <div className="flex flex-wrap gap-1">
                        {contentMetrics.visibility_factors?.factors && contentMetrics.visibility_factors.factors.length > 0 ? (
                          contentMetrics.visibility_factors.factors.slice(0, 2).map((factor: string, idx: number) => (
                            <span key={idx} className="text-xs px-2 py-0.5 rounded-full border truncate max-w-25 inline-block font-medium" style={{ background: 'var(--nd-bg)', color: 'var(--nd-text-primary)', borderColor: 'var(--nd-border)' }}>{factor}</span>
                          ))
                        ) : (
                          <span className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>No factors</span>
                        )}
                      </div>
                    )
                  }
                ]}
                help={contentMetrics.metric_help ? {
                  meaning: contentMetrics.metric_help?.visibility_impact?.meaning,
                  improve: contentMetrics.metric_help?.visibility_impact?.improve,
                } : null}
                labelAction={
                  <MetricAskButton
                    disabled={!projectId || isAskingAI}
                    onClick={() => runMetricAskAi('visibility_impact', 'Visibility Impact')}
                  />
                }
              />
            </div>
          )}
        </div>
      )}

      {/* Prompt Intent Clusters Tab */}
      {activeTab === 'intent-clusters' && (
        <div className="rounded-xl border p-6 space-y-6" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
          {/* Empty State */}
          {!contentMetrics && !isLoadingMetrics && !metricsError && !isWaitingForAnalysis && !isStartingAnalysis && (
            <AnalysisEmptyState
              icon={<Brain className="w-8 h-8 text-zinc-600" />}
              title="No Intent Cluster Data"
              description="No intent cluster data available yet. Run an analysis to see prompt intent analysis."
              onRunAnalysis={jobId ? handleStartAnalysis : undefined}
              isAnalyzing={isStartingAnalysis}
              disabled={!jobId}
              buttonLabel="Run Content Metrics Analysis"
            />
          )}

          {/* Loading / Waiting State */}
          {(isLoadingMetrics || isWaitingForAnalysis || isStartingAnalysis) && !contentMetrics && (
            <div className="p-8 text-center border rounded-xl" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
              <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: 'var(--nd-purple)' }} />
              <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>
                {isStartingAnalysis ? 'Starting analysis...' : 'Running analysis — this may take a moment...'}
              </p>
            </div>
          )}

          {/* Error Display */}
          {metricsError && !contentMetrics && (
            <div className="p-4 border rounded-lg" style={{ background: 'var(--nd-negative-bg)', borderColor: 'var(--nd-border)' }}>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[var(--nd-negative-text)]" />
                <p className="text-sm text-[var(--nd-negative-text)]">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {/* Intent Clusters Results */}
          {(trackingIntentDistribution || (contentMetrics?.prompt_intent_details?.cluster_metrics && contentMetrics.prompt_intent_details?.intent_clusters)) && (
            <div className="space-y-6">
              {/* Metrics Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="h-full">
                  <ScoreCard
                    title="Clustering Accuracy"
                    description="Precision of intent classification"
                    score={
                      trackingIntentDistribution
                        ? 100
                        : Math.round(100 * (contentMetrics.prompt_intent_details.cluster_metrics.clustering_accuracy ?? 0))
                    }
                    value={
                      trackingIntentDistribution
                        ? '100%'
                        : `${Math.round(100 * (contentMetrics.prompt_intent_details.cluster_metrics.clustering_accuracy ?? 0))}%`
                    }
                    icon={<Target className="w-5 h-5 text-[var(--nd-positive-text)]" />}
                    color="bg-[var(--nd-positive-bg)] border-emerald-500/20"
                    help={contentMetrics.metric_help ? {
                      meaning: contentMetrics.metric_help?.clustering_accuracy?.meaning,
                      improve: contentMetrics.metric_help?.clustering_accuracy?.improve,
                    } : null}
                    labelAction={
                      <MetricAskButton
                        disabled={!projectId || isAskingAI}
                        onClick={() => runMetricAskAi('clustering_accuracy', 'Clustering Accuracy')}
                      />
                    }
                  />
                </div>
                
                <div className="h-full">
                  <ScoreCard
                    title="Total Prompts"
                    description="Number of prompts analyzed"
                    value={trackingIntentDistribution ? trackingIntentTotal : (contentMetrics.prompt_intent_details.cluster_metrics.total_prompts ?? 0)}
                    icon={<List className="w-5 h-5" style={{ color: 'var(--nd-blue)' }} />}
                    color="bg-blue-50 border-blue-500/20"
                    help={contentMetrics.metric_help ? {
                      meaning: contentMetrics.metric_help?.total_prompts?.meaning,
                      improve: contentMetrics.metric_help?.total_prompts?.improve,
                    } : null}
                    labelAction={
                      <MetricAskButton
                        disabled={!projectId || isAskingAI}
                        onClick={() => runMetricAskAi('total_prompts', 'Total Prompts')}
                      />
                    }
                  />
                </div>
                
                <div className="h-full">
                  <ScoreCard
                    title="Categorized"
                    description="Prompts successfully mapped to intents"
                    score={trackingIntentDistribution ? 100 : (contentMetrics.prompt_intent_details.cluster_metrics.coverage_percentage ?? 0)}
                    value={trackingIntentDistribution ? '100.0%' : `${contentMetrics.prompt_intent_details.cluster_metrics.coverage_percentage?.toFixed(1) ?? 0}%`}
                    icon={<Brain className="w-5 h-5" style={{ color: 'var(--nd-purple)' }} />}
                    color="bg-violet-50 border-violet-500/20"
                    help={contentMetrics.metric_help ? {
                      meaning: contentMetrics.metric_help?.coverage_percentage?.meaning,
                      improve: contentMetrics.metric_help?.coverage_percentage?.improve,
                    } : null}
                    labelAction={
                      <MetricAskButton
                        disabled={!projectId || isAskingAI}
                        onClick={() => runMetricAskAi('categorized', 'Categorized')}
                      />
                    }
                  />
                </div>
              </div>

              {/* Intent Distribution Table */}
              <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>
                    Intent Cluster Distribution
                    {trackingIntentDistribution && (
                      <span className="ml-2 text-xs font-bold text-emerald-600">
                        (from onboarding tracking prompts)
                      </span>
                    )}
                  </h4>
                  <MetricAskButton
                    disabled={!projectId || isAskingAI}
                    onClick={() => runMetricAskAi('intent_cluster_distribution', 'Intent Cluster Distribution')}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-secondary)' }}>Intent Cluster</th>
                        <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-secondary)' }}>Number of Prompts</th>
                        <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-secondary)' }}>% of Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--nd-border)' }}>
                      {(() => {
                        const clusters: any = trackingIntentDistribution
                          ? Object.fromEntries(
                              intentKeysInOrder.map((k) => [k, { prompt_count: Number(trackingIntentDistribution?.[k] ?? 0) }])
                            )
                          : (contentMetrics.prompt_intent_details?.intent_clusters || {})
                        const total: number = trackingIntentDistribution
                          ? trackingIntentTotal
                          : (contentMetrics.prompt_intent_details?.cluster_metrics?.total_prompts ?? 0)

                        const labelMap: Record<string, string> = {
                          informational: 'Informational',
                          commercial: 'Commercial',
                          comparative: 'Comparative',
                          transactional: 'Transactional',
                          agent: 'Agent-style'
                        }

                        const iconMap: Record<string, React.ReactNode> = {
                          informational: <BookOpen className="w-4 h-4 text-blue-500" />,
                          commercial: <ShoppingBag className="w-4 h-4 text-blue-500" />,
                          comparative: <Scale className="w-4 h-4 text-orange-500" />,
                          transactional: <CreditCard className="w-4 h-4 text-emerald-500" />,
                          agent: <Bot className="w-4 h-4 text-cyan-500" />
                        }

                        return (
                          <>
                            {intentKeysInOrder.map((key) => {
                              const cluster = clusters[key] || {}
                              const count: number = cluster.prompt_count ?? 0
                              const percent = total > 0 ? Math.round((count / total) * 100) : 0

                              return (
                                <tr key={key} className="transition-colors hover:bg-black/5" style={{ background: 'var(--nd-card-bg)' }}>
                                  <td className="px-6 py-4 text-sm flex items-center gap-3" style={{ color: 'var(--nd-text-primary)' }}>
                                    <div className="p-1.5 rounded-lg" style={{ background: 'var(--nd-bg)' }}>
                                      {iconMap[key]}
                                    </div>
                                    {labelMap[key]}
                                  </td>
                                  <td className="px-6 py-4 text-center text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>{count}</td>
                                  <td className="px-6 py-4 text-center">
                                    <div className={cn(
                                      "inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border",
                                      percent >= 20 
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                                        : "bg-gray-50 text-gray-500 border-gray-200"
                                    )}>
                                      {percent}%
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                            
                            {/* Other / Uncategorized row */}
                            {(() => {
                              const sumKnown = intentKeysInOrder.reduce((sum, key) => {
                                const c = clusters[key]
                                return sum + (c?.prompt_count ?? 0)
                              }, 0)
                              const otherCount = Math.max(total - sumKnown, 0)
                              const otherPercent = total > 0 ? Math.round((otherCount / total) * 100) : 0

                              return (
                                <tr style={{ background: 'var(--nd-bg)' }}>
                                  <td className="px-6 py-4 text-sm flex items-center gap-3" style={{ color: 'var(--nd-text-secondary)' }}>
                                    <div className="p-1.5 rounded-lg" style={{ background: 'var(--nd-card-bg)' }}>
                                      <HelpCircle className="w-4 h-4 text-gray-500" />
                                    </div>
                                    Other / Uncategorized
                                  </td>
                                  <td className="px-6 py-4 text-center text-sm font-semibold" style={{ color: 'var(--nd-text-secondary)' }}>{otherCount}</td>
                                  <td className="px-6 py-4 text-center">
                                    <div className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border" style={{ background: 'var(--nd-card-bg)', color: 'var(--nd-text-secondary)', borderColor: 'var(--nd-border)' }}>
                                      {otherPercent}%
                                    </div>
                                  </td>
                                </tr>
                              )
                            })()}
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* No Data Message for Intent Clusters */}
          {contentMetrics && (!contentMetrics.prompt_intent_details?.cluster_metrics || !contentMetrics.prompt_intent_details?.intent_clusters) && (
            <div className="p-6 border rounded-xl text-center" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--nd-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>
                No intent cluster data available for this analysis.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Entity Detection Metrics Tab */}
      {activeTab === 'entity-detection' && (
        <div className="rounded-xl border p-6 space-y-6" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
          {/* Empty State */}
          {!entityMetrics && !isLoadingMetrics && !metricsError && !isWaitingForAnalysis && !isStartingAnalysis && (
            <AnalysisEmptyState
              icon={<Database className="w-8 h-8 text-zinc-600" />}
              title="No Entity Detection Data"
              description="No entity detection data available yet. Run an analysis to see entity metrics."
              onRunAnalysis={jobId ? handleStartAnalysis : undefined}
              isAnalyzing={isStartingAnalysis}
              disabled={!jobId}
              buttonLabel="Run Content Metrics Analysis"
            />
          )}

          {/* Loading / Waiting State */}
          {(isLoadingMetrics || isWaitingForAnalysis || isStartingAnalysis) && !entityMetrics && (
            <div className="p-8 text-center border rounded-xl" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: 'var(--nd-purple)' }} />
              <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>
                {isStartingAnalysis ? 'Starting analysis...' : 'Running analysis — this may take a moment...'}
              </p>
            </div>
          )}

          {/* Error Display */}
          {metricsError && !entityMetrics && (
            <div className="p-4 border rounded-lg" style={{ background: 'rgba(244, 63, 94, 0.1)', borderColor: 'rgba(244, 63, 94, 0.2)' }}>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <p className="text-sm text-rose-500">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {/* Entity Detection Results */}
          {entityMetrics && (
            <div className="space-y-6">
              {/* Main Entity Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Entities Detected */}
                <div className="h-full">
                  <ScoreCard
                    title="Entities Detected"
                    description="Number of required entities found in content"
                    value={entityMetrics.entities_detected_count || 0}
                    icon={<Database className="w-5 h-5 text-blue-500" />}
                    color="bg-blue-50"
                    help={contentMetrics?.metric_help?.entities_detected_count ?? null}
                    labelAction={
                      <MetricAskButton
                        disabled={!projectId || isAskingAI}
                        onClick={() => runMetricAskAi('entities_detected', 'Entities Detected')}
                      />
                    }
                  />
                </div>

                {/* Coverage Score */}
                <div className="h-full">
                  <ScoreCard
                    title="Coverage Score"
                    description="Percentage of required entities included"
                    score={entityMetrics.entity_coverage_score || 0}
                    value={`${entityMetrics.entity_coverage_score || 0}%`}
                    icon={<BarChart className="w-5 h-5 text-emerald-600" />}
                    color="bg-emerald-50"
                    help={contentMetrics?.metric_help?.entity_coverage_score ?? null}
                    labelAction={
                      <MetricAskButton
                        disabled={!projectId || isAskingAI}
                        onClick={() => runMetricAskAi('coverage_score', 'Coverage Score')}
                      />
                    }
                  />
                </div>

                {/* Entity Relevance */}
                <div className="h-full">
                  <ScoreCard
                    title="Entity Relevance"
                    description="How relevant entities are to search intent"
                    score={entityMetrics.entity_relevance_score || 0}
                    icon={<Target className="w-5 h-5 text-blue-500" />}
                    color="bg-blue-50"
                    help={contentMetrics?.metric_help?.entity_relevance_score ?? null}
                    labelAction={
                      <MetricAskButton
                        disabled={!projectId || isAskingAI}
                        onClick={() => runMetricAskAi('entity_relevance', 'Entity Relevance')}
                      />
                    }
                  />
                </div>
              </div>

              {/* Entity Details */}
              {((entityMetrics.entity_relevance_details?.relevant_entities && entityMetrics.entity_relevance_details.relevant_entities.length > 0) ||
                (entityMetrics.entity_relevance_details?.irrelevant_entities && entityMetrics.entity_relevance_details.irrelevant_entities.length > 0)) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {entityMetrics.entity_relevance_details?.relevant_entities && entityMetrics.entity_relevance_details.relevant_entities.length > 0 && (
                    <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
                      <h4 className="text-sm font-semibold text-emerald-700 mb-3 flex items-center gap-2">
                        <span>✅</span>
                        Relevant Entities
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {entityMetrics.entity_relevance_details.relevant_entities.map((entity: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-100/50">
                            {entity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {entityMetrics.entity_relevance_details?.irrelevant_entities && entityMetrics.entity_relevance_details.irrelevant_entities.length > 0 && (
                    <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
                      <h4 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
                        <span>⚠️</span>
                        Irrelevant Entities
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {entityMetrics.entity_relevance_details.irrelevant_entities.map((entity: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="border-amber-300 text-amber-700 bg-amber-100/50">
                            {entity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Additional Details Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
                {/* Top Search Queries */}
                {contentMetrics?.prompt_intent_details?.search_queries && contentMetrics.prompt_intent_details.search_queries.length > 0 && (
                  <div className="rounded-xl border p-5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--nd-text-primary)' }}>
                      <div className="p-1.5 rounded-lg bg-blue-50">
                        <Search className="w-4 h-4 text-blue-500" />
                      </div>
                      Top Search Queries
                    </h4>
                    <div className="space-y-2">
                      {contentMetrics.prompt_intent_details.search_queries.map((query: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 p-2 rounded-lg transition-colors hover:bg-black/5">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span className="text-sm" style={{ color: 'var(--nd-text-primary)' }}>"{query}"</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visibility Score Breakdown */}
                {contentMetrics?.visibility_factors?.score_breakdown && 
                 Object.keys(contentMetrics.visibility_factors.score_breakdown).length > 0 && (
                  <div className="rounded-xl border p-5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--nd-text-primary)' }}>
                        <div className="p-1.5 rounded-lg bg-emerald-50">
                          <BarChart className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="flex items-center gap-2">
                          Visibility Score Breakdown
                          {contentMetrics?.metric_help?.visibility_score_breakdown?.meaning &&
                            contentMetrics?.metric_help?.visibility_score_breakdown?.improve && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="transition-colors"
                                    style={{ color: 'var(--nd-text-muted)' }}
                                    aria-label="Visibility score breakdown help"
                                  >
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  align="start"
                                  className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5"
                                  style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
                                >
                                  <div className="space-y-1.5">
                                    <div>
                                      <span className="font-semibold">Meaning: </span>
                                      <span style={{ color: 'var(--nd-text-secondary)' }}>{contentMetrics.metric_help.visibility_score_breakdown.meaning}</span>
                                    </div>
                                    <div>
                                      <span className="font-semibold">Improve: </span>
                                      <span style={{ color: 'var(--nd-text-secondary)' }}>{contentMetrics.metric_help.visibility_score_breakdown.improve}</span>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                        </span>
                      </h4>
                      <MetricAskButton
                        disabled={!projectId || isAskingAI}
                        onClick={() => runMetricAskAi('visibility_score_breakdown', 'Visibility Score Breakdown')}
                      />
                    </div>
                    <div className="space-y-3">
                      {Object.entries(contentMetrics.visibility_factors.score_breakdown).map(([factor, score]) => (
                        <div key={factor} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="capitalize flex items-center gap-1.5" style={{ color: 'var(--nd-text-secondary)' }}>
                              {factor.replace(/_/g, ' ')}
                              {contentMetrics?.metric_help?.[factor]?.meaning && contentMetrics?.metric_help?.[factor]?.improve && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="transition-colors"
                                      style={{ color: 'var(--nd-text-muted)' }}
                                      aria-label={`${factor.replace(/_/g, ' ')} help`}
                                    >
                                      <HelpCircle className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    align="start"
                                    className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5"
                                    style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
                                  >
                                    <div className="space-y-1.5">
                                      <div>
                                        <span className="font-semibold">Meaning: </span>
                                        <span style={{ color: 'var(--nd-text-secondary)' }}>{contentMetrics.metric_help[factor].meaning}</span>
                                      </div>
                                      <div>
                                        <span className="font-semibold">Improve: </span>
                                        <span style={{ color: 'var(--nd-text-secondary)' }}>{contentMetrics.metric_help[factor].improve}</span>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </span>
                            <span className={`font-semibold ${getScoreColor(score as number)}`}>{score as number}</span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--nd-bg)' }}>
                            <div
                              className="h-full transition-all duration-300"
                              style={{
                                width: `${score}%`,
                                backgroundColor: (score as number) >= 80 ? '#10B981' : 
                                                (score as number) >= 60 ? '#F59E0B' : 
                                                (score as number) >= 40 ? '#EF4444' : 
                                                '#6B7280'
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendations Tab (Prompt Intelligence) */}
      {activeTab === 'recommendations' && (
        <div className="rounded-xl border p-6 space-y-6" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
          {!recommendations && !isLoadingMetrics && !metricsError && !isWaitingForAnalysis && !isStartingAnalysis && (
            <AnalysisEmptyState
              icon={<Zap className="w-8 h-8 text-zinc-600" />}
              title="No Recommendation Data"
              description="No recommendation cards available yet. Run a content metrics analysis to generate prioritized actions."
              onRunAnalysis={jobId ? handleStartAnalysis : undefined}
              isAnalyzing={isStartingAnalysis}
              disabled={!jobId}
              buttonLabel="Run Content Metrics Analysis"
            />
          )}

          {(isLoadingMetrics || isWaitingForAnalysis || isStartingAnalysis) && !recommendations && (
            <div className="p-8 text-center border rounded-xl" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: 'var(--nd-purple)' }} />
              <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>
                {isStartingAnalysis ? 'Starting analysis...' : 'Running analysis — this may take a moment...'}
              </p>
            </div>
          )}

          {metricsError && !recommendations && (
            <div className="p-4 border rounded-lg" style={{ background: 'rgba(244, 63, 94, 0.1)', borderColor: 'rgba(244, 63, 94, 0.2)' }}>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <p className="text-sm text-rose-500">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {recommendations && (
            <RecommendationEnginePanel
              data={recommendations}
              isLoading={isLoadingMetrics || isStartingAnalysis}
            />
          )}
        </div>
      )}
    </div>
  )
}
