'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { StatCard, StatCardGrid } from '@/components/ui/StatCard'
import { SectionCard } from '@/components/ui/SectionCard'
import { 
  Brain, 
  Target, 
  TrendingUp, 
  TrendingDown,
  Layers, 
  Zap, 
  CheckCircle, 
  XCircle, 
  ArrowUpRight, 
  Globe,
  Maximize2,
  Table,
  Split,
  Search,
  Eye,
  MousePointerClick,
  Activity,
  Info,
  MessageSquare,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import D3TidyTree, { TreeNode as TidyTreeNode } from './D3TidyTree'
import { useGetJobFieldsQuery, useGetJobPromptTrackingQuery, useGetSeoKeywordsForUrlMutation, useStartPromptTrackingMutation } from '@/store/api/jobApi'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleDAskAiChatShell, type ModuleDAskAiChatTurn } from '@/components/module_D/ModuleDAskAiChatShell'
import { useAskModuleDAIMutation, useGetModuleDSuggestedQuestionsMutation } from '@/store/api/module_D/moduleDApi'
import { useToast } from '@/hooks/use-toast'

export type D3TreeNode = {
  name: string
  attributes?: Record<string, string | number | boolean>
  children?: D3TreeNode[]
}

interface SiteStructureProps {
  sessionId?: string | number | null
  pages?: Array<{ url?: string | null }>
  startUrl?: string | null
  jobId?: string | null
  projectId?: string
}

type KeywordData = {
  text: string
  score: number
  prompt_count: number
  relevance_score: number
  diversity_score: number
  difficulty_score?: number
  complexity_level?: 'Low' | 'Medium' | 'High'
  ai_generation_feasibility?: number
}

function chatMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    u.host = u.host.toLowerCase()
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    return u.toString()
  } catch {
    return url
  }
}

function isLikelyPageUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const pathname = u.pathname.toLowerCase()
    const lastSeg = pathname.split('/').pop() || ''
    const hasDot = lastSeg.includes('.')
    if (!hasDot) return true
    const ext = lastSeg.split('.').pop() || ''
    const nonPageExts = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tif', 'tiff',
      'css', 'js', 'mjs', 'cjs', 'map',
      'woff', 'woff2', 'ttf', 'otf', 'eot',
      'pdf', 'zip', 'rar', '7z', 'gz', 'tar', 'bz2', 'xz',
      'mp3', 'mp4', 'webm', 'ogg', 'wav', 'mov', 'avi', 'mkv',
      'json', 'rss', 'atom', 'yaml', 'yml',
      'xml'
    ])
    if (nonPageExts.has(ext)) return false
    const pageExts = new Set(['html', 'htm', 'php', 'asp', 'aspx', 'jsp', 'cfm', 'xhtml'])
    if (pageExts.has(ext)) return true
    return true
  } catch {
    return true
  }
}

function collectAllUrls(node: D3TreeNode | null): string[] {
  if (!node) return []
  const acc: string[] = []
  const stack: D3TreeNode[] = [node]
  while (stack.length) {
    const n = stack.pop()!
    const full = (n.attributes?.full as string) || n.name
    acc.push(normalizeUrl(full))
    if (n.children) for (const c of n.children) stack.push(c)
  }
  return Array.from(new Set(acc))
}

function computeTreeStats(root: D3TreeNode | null): { maxDepth: number; levelCounts: number[] } {
  if (!root) return { maxDepth: 0, levelCounts: [] }
  const levelCounts: number[] = []
  const stack: Array<{ node: D3TreeNode; level: number }> = [{ node: root, level: 0 }]
  let maxDepth = 0
  while (stack.length) {
    const { node, level } = stack.pop()!
    maxDepth = Math.max(maxDepth, level)
    levelCounts[level] = (levelCounts[level] || 0) + 1
    if (node.children) for (const c of node.children) stack.push({ node: c, level: level + 1 })
  }
  return { maxDepth, levelCounts }
}

function autoAdjustLayout(root: D3TreeNode | null, setSiblingSeparation: (v: number) => void, setNonSiblingSeparation: (v: number) => void, setLabelMaxChars: (v: number) => void) {
  const { maxDepth, levelCounts } = computeTreeStats(root)
  const breadth = Math.max(...(levelCounts.length ? levelCounts : [1]))
  const sib = Math.min(3, Math.max(0.9, 1 + (breadth / 300)))
  const nonSib = Math.min(4, Math.max(1.0, 1.2 + (maxDepth / 8)))
  setSiblingSeparation(Number(sib.toFixed(2)))
  setNonSiblingSeparation(Number(nonSib.toFixed(2)))
  const maxChars = breadth > 200 ? 30 : breadth > 100 ? 40 : 60
  setLabelMaxChars(maxChars)
}

function convertToTidy(root: D3TreeNode | null, seoByUrl: Map<string, any>, seoEnabled: boolean): TidyTreeNode | null {
  if (!root) return null
  const mapNode = (n: D3TreeNode): TidyTreeNode => {
    const full = (n.attributes?.full as string) || n.name
    const label = (n.attributes?.full as string) || n.name
    const baseChildren: TidyTreeNode[] = n.children && n.children.length ? n.children.map(mapNode) : []
    return {
      text: label,
      attributes: { full },
      children: baseChildren.length ? baseChildren : undefined,
    }
  }
  return mapNode(root)
}

function calculateContentMetrics(keyword: KeywordData): {
  difficulty_score: number
  complexity_level: 'Low' | 'Medium' | 'High'
  ai_generation_feasibility: number
} {
  const score = Math.min(1, Math.max(0, (keyword.score || 0) / 10))
  const relevance = Math.min(1, Math.max(0, (keyword.relevance_score || 0) / 100))
  const diversity = Math.min(1, Math.max(0, (keyword.diversity_score || 0) / 100))
  const promptCount = keyword.prompt_count || 0
  const wordCount = keyword.text.split(/\s+/).length
  let difficultyScore = 0
  difficultyScore += (1 - score) * 40
  difficultyScore += relevance * 25
  difficultyScore += diversity * 20
  difficultyScore += Math.min(promptCount / 20, 1) * 10
  if (wordCount === 1 && score < 0.5) {
    difficultyScore += 5
  }
  difficultyScore = Math.min(100, Math.max(0, difficultyScore))
  let complexityLevel: 'Low' | 'Medium' | 'High' = 'Low'
  if (wordCount === 1) {
    complexityLevel = 'Low'
  } else if (wordCount === 2) {
    complexityLevel = diversity > 0.5 ? 'Medium' : 'Low'
  } else if (wordCount === 3) {
    complexityLevel = diversity > 0.6 ? 'High' : 'Medium'
  } else {
    complexityLevel = diversity > 0.5 ? 'High' : 'Medium'
  }
  let aiFeasibility = 0
  aiFeasibility += score * 35
  aiFeasibility += relevance * 30
  aiFeasibility += (1 - diversity) * 20
  if (promptCount > 0) {
    aiFeasibility += Math.min(promptCount / 10, 1) * 10
  }
  if (wordCount <= 3) {
    aiFeasibility += 5
  }
  aiFeasibility = Math.min(100, Math.max(0, aiFeasibility))
  return {
    difficulty_score: Math.round(difficultyScore),
    complexity_level: complexityLevel,
    ai_generation_feasibility: Math.round(aiFeasibility)
  }
}

// Score Card Component
interface ScoreCardProps {
  title: string
  score: number | string | null
  icon: React.ReactNode
  color: string
  subText?: string
  trend?: number
  className?: string
}

function ScoreCard({ title, score, icon, color, subText, trend, className }: ScoreCardProps) {
  const getScoreLabel = (s: number) => {
    if (s >= 80) return { text: 'Excellent', color: 'text-green-400 bg-green-500/10' }
    if (s >= 60) return { text: 'Good', color: 'text-yellow-400 bg-yellow-500/10' }
    if (s >= 40) return { text: 'Fair', color: 'text-orange-400 bg-orange-500/10' }
    return { text: 'Needs Work', color: 'text-red-400 bg-red-500/10' }
  }

  const numericScore = typeof score === 'number' ? score : parseFloat(score as string)
    const showBadge = !isNaN(numericScore) && score !== null

    return (
      <div className={cn("rounded-2xl p-5 border transition-all duration-300 group flex flex-col justify-between", className)} style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", color)}>
              {icon}
            </div>
            <span className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-secondary)' }}>{title}</span>
          </div>
          {showBadge && (
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-bold border",
              getScoreLabel(numericScore).color
            )}>
              {getScoreLabel(numericScore).text}
            </span>
          )}
        </div>
        <div>
          <div className="flex items-baseline gap-1">
            <div className="text-3xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{score ?? '--'}</div>
            {typeof score === 'number' && <span className="text-sm font-medium" style={{ color: 'var(--nd-text-muted)' }}>/100</span>}
          </div>
          
          <div className="flex items-center justify-between mt-2">
             {subText && <div className="text-[11px] font-bold uppercase tracking-tight" style={{ color: 'var(--nd-text-muted)' }}>{subText}</div>}
             {trend !== undefined && (
                <div className={cn(
                  "flex items-center gap-1 text-xs font-bold",
                  trend >= 0 ? "text-emerald-600" : "text-rose-600"
                )}>
                  {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{trend >= 0 ? '+' : ''}{trend}%</span>
                </div>
             )}
          </div>
        </div>
      </div>
    )
  }

export function PromptTrackingPanel({ jobId }: { jobId?: string | null }) {
  const [promptText, setPromptText] = useState<string>('')
  const [isPromptPolling, setIsPromptPolling] = useState(false)
  const [promptPollCount, setPromptPollCount] = useState(0)
  const [pendingPrompts, setPendingPrompts] = useState<string[]>([])
  const [selectedTrackedPrompt, setSelectedTrackedPrompt] = useState<string | null>(null)
  const [startPromptTracking, { isLoading: isStartingPromptTracking }] = useStartPromptTrackingMutation()

  const { data: promptTrackingDoc, isFetching: isFetchingPromptTracking, refetch: refetchPromptTracking } = useGetJobPromptTrackingQuery(jobId ?? '', {
    skip: !jobId,
    pollingInterval: isPromptPolling ? 3000 : 0,
    refetchOnMountOrArgChange: true,
  })

  useEffect(() => {
    if (!isPromptPolling) return
    if (!pendingPrompts.length) return

    const metrics = promptTrackingDoc?.metrics || []
    const metricPrompts = new Set(metrics.map((m: any) => (m?.prompt ? String(m.prompt) : '')).filter(Boolean))
    const allPresent = pendingPrompts.every((p) => metricPrompts.has(p))
    if (allPresent) {
      setIsPromptPolling(false)
      setPromptPollCount(0)
      setPendingPrompts([])
    }
  }, [isPromptPolling, pendingPrompts, promptTrackingDoc?.metrics])

  useEffect(() => {
    if (!isPromptPolling) return
    const t = setTimeout(() => setPromptPollCount((c) => c + 1), 3000)
    return () => clearTimeout(t)
  }, [isPromptPolling, promptPollCount])

  useEffect(() => {
    if (isPromptPolling && promptPollCount > 40) {
      setIsPromptPolling(false)
      setPromptPollCount(0)
      setPendingPrompts([])
    }
  }, [isPromptPolling, promptPollCount])

  useEffect(() => {
    const first = promptTrackingDoc?.metrics?.[0]?.prompt ?? null
    if (!selectedTrackedPrompt && first) setSelectedTrackedPrompt(first)
  }, [promptTrackingDoc?.metrics, selectedTrackedPrompt])

  const selectedPromptMetric = useMemo(() => {
    const metrics = promptTrackingDoc?.metrics || []
    if (!metrics.length) return null
    const m = selectedTrackedPrompt ? metrics.find((x) => x.prompt === selectedTrackedPrompt) : null
    return m || metrics[0]
  }, [promptTrackingDoc?.metrics, selectedTrackedPrompt])

  const selectedPromptTrend = useMemo(() => {
    const trend = selectedPromptMetric?.trend || []
    return trend
      .map((p: any) => {
        const date = p?.date ? format(new Date(p.date), 'MMM dd') : ''
        const vis =
          typeof p?.visibility_score === 'number'
            ? p.visibility_score
            : typeof p?.prompt_visibility_score === 'number'
              ? p.prompt_visibility_score
              : 0
        const ctr = typeof p?.ctr_percent === 'number' ? p.ctr_percent : 0
        return { date, visibility: vis, ctr }
      })
      .filter((p) => p.date)
  }, [selectedPromptMetric?.trend])

  const summary = useMemo(() => {
    const metrics = (promptTrackingDoc?.metrics || []) as any[]
    const trackedCount = (promptTrackingDoc?.tracked_prompts?.length ?? metrics.length) as number

    const avg = (key: string) => {
      const vals = metrics
        .map((m) => (typeof m?.[key] === 'number' ? Number(m[key]) : null))
        .filter((v) => v != null) as number[]
      if (!vals.length) return null
      return vals.reduce((a, b) => a + b, 0) / vals.length
    }

    return {
      trackedCount,
      avgVisibility: avg('prompt_visibility_score'),
      avgCtr: avg('ctr_percent'),
      avgEngagement: avg('engagement_score'),
      avgTraffic: avg('traffic_estimate'),
    }
  }, [promptTrackingDoc?.metrics, promptTrackingDoc?.tracked_prompts?.length])

  const addPromptsToTracking = useCallback(async () => {
    if (!jobId) return
    const prompts = promptText
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
    if (prompts.length === 0) return

    await startPromptTracking({
      jobId,
      prompts,
    }).unwrap()
    setPromptText('')
    setPendingPrompts(Array.from(new Set(prompts)))
    setIsPromptPolling(true)
    setPromptPollCount(0)
    try {
      refetchPromptTracking()
    } catch {}
  }, [jobId, promptText, refetchPromptTracking, startPromptTracking])

  const hasTrackedPrompts = (promptTrackingDoc?.metrics?.length ?? 0) > 0

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Target}
        title="Add to Tracking"
        description="Prompt Tracking"
        action={
          <Badge variant="outline" className="text-xs font-bold" style={{ borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}>
            {summary.trackedCount} tracked
          </Badge>
        }
      />

      {hasTrackedPrompts ? (
          <StatCardGrid>
          <div className="relative">
          <StatCard
            label="Tracked Prompts"
            value={summary.trackedCount}
            subtext={pendingPrompts.length ? `${pendingPrompts.length} updating` : undefined}
            icon={Target}
            accent="violet"
          />
          </div>
          <div className="relative">
          <StatCard
            label="Avg Visibility"
            value={summary.avgVisibility != null ? summary.avgVisibility.toFixed(1) : '—'}
            subtext="0–100"
            icon={Eye}
            accent="cyan"
          />
          {promptTrackingDoc?.metric_help && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="absolute top-2 right-2 transition-colors"
                  style={{ color: 'var(--nd-text-muted)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nd-text-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nd-text-muted)'}
                  aria-label="Avg Visibility help"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="end" className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                <div className="space-y-1.5">
                  {promptTrackingDoc.metric_help?.prompt_visibility_score && (
                    <>
                      <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.prompt_visibility_score.meaning}</span></div>
                      <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.prompt_visibility_score.improve}</span></div>
                    </>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          </div>
          <div className="relative">
          <StatCard
            label="Avg CTR"
            value={summary.avgCtr != null ? `${summary.avgCtr.toFixed(2)}%` : '—'}
            subtext="estimated"
            icon={MousePointerClick}
            accent="emerald"
          />
          {promptTrackingDoc?.metric_help && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="absolute top-2 right-2 transition-colors"
                  style={{ color: 'var(--nd-text-muted)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nd-text-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nd-text-muted)'}
                  aria-label="Avg CTR help"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="end" className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                <div className="space-y-1.5">
                  {promptTrackingDoc.metric_help?.ctr_percent && (
                    <>
                      <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.ctr_percent.meaning}</span></div>
                      <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.ctr_percent.improve}</span></div>
                    </>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          </div>
          <div className="relative">
          <StatCard
            label="Avg Engagement"
            value={summary.avgEngagement != null ? summary.avgEngagement.toFixed(1) : '—'}
            subtext={summary.avgTraffic != null ? `Traffic: ${summary.avgTraffic.toFixed(1)}` : undefined}
            icon={Activity}
            accent="amber"
          />
          {promptTrackingDoc?.metric_help && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="absolute top-2 right-2 transition-colors"
                  style={{ color: 'var(--nd-text-muted)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nd-text-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nd-text-muted)'}
                  aria-label="Avg Engagement help"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="end" className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                <div className="space-y-1.5">
                  {promptTrackingDoc.metric_help?.engagement_score && (
                    <>
                      <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.engagement_score.meaning}</span></div>
                      <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.engagement_score.improve}</span></div>
                    </>
                  )}
                  {promptTrackingDoc.metric_help?.traffic_estimate && (
                    <>
                      <div className="pt-1.5 border-t" style={{ borderColor: 'var(--nd-border)' }} />
                      <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.traffic_estimate.meaning}</span></div>
                      <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.traffic_estimate.improve}</span></div>
                    </>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          </div>
        </StatCardGrid>
      ) : (
        <AnalysisEmptyState
          icon={<Target className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />}
          title="No Prompts Tracked Yet"
          description="Add prompts below to start tracking their visibility, CTR, and engagement across AI models."
        />
      )}

      <SectionCard title="Add Prompts">
        <div className="space-y-3">
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={4}
            className={cn(
              'w-full rounded-xl border px-3 py-2',
              'text-sm font-medium outline-hidden',
              'focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/40'
            )}
            style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
            placeholder={'One prompt per line\nExample: best running shoes for flat feet'}
          />
          <div className="text-xs font-semibold" style={{ color: 'var(--nd-text-secondary)' }}>
            Onboarding prompts are auto-used by default when available. Add extra prompts here only if needed.
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="rounded-xl shadow-sm"
              style={{ background: 'var(--nd-purple)', color: '#ffffff', borderColor: 'var(--nd-purple)' }}
              disabled={!jobId || !promptText.trim() || isStartingPromptTracking}
              onClick={addPromptsToTracking}
            >
              {isStartingPromptTracking ? 'Tracking…' : 'Add to Tracking'}
            </Button>
            {(isFetchingPromptTracking || isPromptPolling) && (
              <span className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>Updating…</span>
            )}
          </div>
        </div>
      </SectionCard>

      {promptTrackingDoc?.prompt_intelligence && (
        <SectionCard title="Prompt Intelligence Summary">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border p-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <div style={{ color: 'var(--nd-text-muted)' }}>Source Mode</div>
              <div className="font-mono" style={{ color: 'var(--nd-text-primary)' }}>{promptTrackingDoc.prompt_intelligence.prompt_source_mode ?? 'unknown'}</div>
            </div>
            <div className="rounded-lg border p-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <div style={{ color: 'var(--nd-text-muted)' }}>Onboarding Prompts</div>
              <div className="font-mono" style={{ color: 'var(--nd-text-primary)' }}>{promptTrackingDoc.prompt_intelligence.onboarding_prompts_count ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <div style={{ color: 'var(--nd-text-muted)' }}>Manual Prompts</div>
              <div className="font-mono" style={{ color: 'var(--nd-text-primary)' }}>{promptTrackingDoc.prompt_intelligence.manual_prompts_count ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <div style={{ color: 'var(--nd-text-muted)' }}>Final Prompts</div>
              <div className="font-mono" style={{ color: 'var(--nd-text-primary)' }}>{promptTrackingDoc.prompt_intelligence.total_prompts_final ?? 0}</div>
            </div>
            <div className="rounded-lg border p-3 md:col-span-2" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <div style={{ color: 'var(--nd-text-muted)' }}>Dedup Drops</div>
              <div className="font-mono" style={{ color: 'var(--nd-text-primary)' }}>
                {(
                  (promptTrackingDoc.prompt_intelligence.dedup_summary?.dropped_exact_duplicates ?? 0) +
                  (promptTrackingDoc.prompt_intelligence.dedup_summary?.dropped_near_duplicates ?? 0)
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            {Object.entries(promptTrackingDoc.prompt_intelligence.intent_cluster_distribution || {}).map(([intent, count]) => (
              <span
                key={intent}
                className="px-2 py-1 rounded-full border"
                style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}
              >
                {intent}: {count}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {promptTrackingDoc?.metrics?.length ? (
        <SectionCard title="Prompt Metrics" contentClassName="p-0">
          <div className="overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 border-b" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                <tr>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-secondary)' }}>Prompt</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--nd-text-secondary)' }}>
                    <span className="inline-flex items-center justify-end gap-1 w-full">
                      Vis
                      {promptTrackingDoc?.metric_help?.prompt_visibility_score && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="transition-colors"
                              style={{ color: 'var(--nd-text-secondary)' }}
                              aria-label="Visibility help"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="end" className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                            <div className="space-y-1.5">
                              <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.prompt_visibility_score.meaning}</span></div>
                              <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.prompt_visibility_score.improve}</span></div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--nd-text-secondary)' }}>
                    <span className="inline-flex items-center justify-end gap-1 w-full">
                      CTR
                      {promptTrackingDoc?.metric_help?.ctr_percent && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="transition-colors"
                              style={{ color: 'var(--nd-text-secondary)' }}
                              aria-label="CTR help"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="end" className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                            <div className="space-y-1.5">
                              <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.ctr_percent.meaning}</span></div>
                              <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.ctr_percent.improve}</span></div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--nd-text-secondary)' }}>
                    <span className="inline-flex items-center justify-end gap-1 w-full">
                      Eng
                      {promptTrackingDoc?.metric_help?.engagement_score && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="transition-colors"
                              style={{ color: 'var(--nd-text-secondary)' }}
                              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nd-text-primary)'}
                              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nd-text-secondary)'}
                              aria-label="Engagement help"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="end" className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                            <div className="space-y-1.5">
                              <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.engagement_score.meaning}</span></div>
                              <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.engagement_score.improve}</span></div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--nd-text-secondary)' }}>
                    <span className="inline-flex items-center justify-end gap-1 w-full">
                      Traffic
                      {promptTrackingDoc?.metric_help?.traffic_estimate && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="transition-colors"
                              style={{ color: 'var(--nd-text-secondary)' }}
                              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nd-text-primary)'}
                              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nd-text-secondary)'}
                              aria-label="Traffic help"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="end" className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                            <div className="space-y-1.5">
                              <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.traffic_estimate.meaning}</span></div>
                              <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.traffic_estimate.improve}</span></div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--nd-text-secondary)' }}>
                    <span className="inline-flex items-center justify-end gap-1 w-full">
                      Δ
                      {promptTrackingDoc?.metric_help?.visibility_change && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="transition-colors"
                              style={{ color: 'var(--nd-text-secondary)' }}
                              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nd-text-primary)'}
                              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nd-text-secondary)'}
                              aria-label="Visibility change help"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="end" className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                            <div className="space-y-1.5">
                              <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.visibility_change.meaning}</span></div>
                              <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.visibility_change.improve}</span></div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--nd-border)' }}>
                {promptTrackingDoc.metrics.map((m, idx) => {
                  const selected = selectedPromptMetric?.prompt === m.prompt
                  return (
                    <tr
                      key={idx}
                      className={cn(
                        'transition-colors cursor-pointer',
                        selected ? 'bg-black/10 dark:bg-white/5' : 'hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                      onClick={() => setSelectedTrackedPrompt(m.prompt)}
                    >
                      <td className="px-5 py-3 text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>
                        <div className="truncate max-w-170" title={m.prompt}>{m.prompt}</div>
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-bold font-mono" style={{ color: 'var(--nd-text-secondary)' }}>{Number(m.prompt_visibility_score ?? 0).toFixed(1)}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold font-mono" style={{ color: 'var(--nd-text-secondary)' }}>{Number(m.ctr_percent ?? 0).toFixed(2)}%</td>
                      <td className="px-5 py-3 text-right text-sm font-bold font-mono" style={{ color: 'var(--nd-text-secondary)' }}>{Number(m.engagement_score ?? 0).toFixed(1)}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold font-mono" style={{ color: 'var(--nd-text-secondary)' }}>{Number(m.traffic_estimate ?? 0).toFixed(1)}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold font-mono" style={{ color: 'var(--nd-text-secondary)' }}>
                        {typeof m.visibility_change === 'number' ? (
                          <span className={cn(m.visibility_change >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                            {m.visibility_change >= 0 ? '+' : ''}{m.visibility_change.toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--nd-text-secondary)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Prompt Metrics">
          <div className="text-sm font-medium" style={{ color: 'var(--nd-text-secondary)' }}>
            Add prompts to start tracking visibility, CTR, and performance trends.
          </div>
        </SectionCard>
      )}

      <SectionCard title="Performance Trend">
        {selectedPromptMetric && selectedPromptTrend.length === 1 ? (
          <div className="space-y-3">
            <div className="text-xs truncate font-bold" style={{ color: 'var(--nd-text-secondary)' }}>{selectedPromptMetric.prompt}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border p-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                <div className="font-bold" style={{ color: 'var(--nd-text-secondary)' }}>Visibility</div>
                <div className="font-mono text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>{selectedPromptTrend[0].visibility.toFixed(1)}</div>
              </div>
              <div className="rounded-lg border p-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                <div className="font-bold" style={{ color: 'var(--nd-text-secondary)' }}>CTR (est.)</div>
                <div className="font-mono text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>{selectedPromptTrend[0].ctr.toFixed(2)}%</div>
              </div>
              <div className="rounded-lg border p-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                <div className="font-bold" style={{ color: 'var(--nd-text-secondary)' }}>Engagement</div>
                <div className="font-mono text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>
                  {Number((selectedPromptMetric as any).engagement_score ?? 0).toFixed(1)}
                </div>
              </div>
              <div className="rounded-lg border p-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                <div className="font-bold" style={{ color: 'var(--nd-text-secondary)' }}>Traffic (est.)</div>
                <div className="font-mono text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>
                  {Number((selectedPromptMetric as any).traffic_estimate ?? 0).toFixed(1)}
                </div>
              </div>
            </div>
            <p className="text-xs font-medium" style={{ color: 'var(--nd-text-secondary)' }}>
              One snapshot so far — run &quot;Add to Tracking&quot; again on this project to build a line chart over time.
            </p>
          </div>
        ) : selectedPromptMetric && selectedPromptTrend.length > 1 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm truncate font-bold" style={{ color: 'var(--nd-text-secondary)' }}>
                {selectedPromptMetric.prompt}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {promptTrackingDoc?.metric_help?.prompt_visibility_score && promptTrackingDoc?.metric_help?.ctr_percent && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="transition-colors"
                        style={{ color: 'var(--nd-text-secondary)' }}
                        aria-label="Trend chart help"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="end" className="max-w-64 border text-[11px] leading-relaxed rounded-2xl px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                      <div className="space-y-1.5">
                        <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.prompt_visibility_score.meaning}</span></div>
                        <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.prompt_visibility_score.improve}</span></div>
                        <div className="pt-1.5 border-t" style={{ borderColor: 'var(--nd-border)' }} />
                        <div><span className="font-semibold">Meaning: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.ctr_percent.meaning}</span></div>
                        <div><span className="font-semibold">Improve: </span><span style={{ color: 'var(--nd-text-secondary)' }}>{promptTrackingDoc.metric_help.ctr_percent.improve}</span></div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
                <Badge variant="outline" className="text-xs font-bold" style={{ borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}>
                  {selectedPromptTrend.length} points
                </Badge>
              </div>
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={selectedPromptTrend}>
                  <CartesianGrid stroke="var(--nd-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--nd-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--nd-text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                  <RechartsTooltip
                    contentStyle={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)', borderRadius: 12 }}
                    labelStyle={{ color: 'var(--nd-text-primary)', fontSize: 11 }}
                    itemStyle={{ color: 'var(--nd-text-secondary)', fontSize: 11 }}
                  />
                  <Line type="monotone" dataKey="visibility" stroke="var(--nd-purple)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ctr" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : selectedPromptMetric ? (
          <div className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>
            No trend history for this prompt yet. Run tracking to record the first snapshot.
          </div>
        ) : (
          <div className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>
            Select a prompt in the table above to view its trend.
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export function SiteStructure({ sessionId, pages, startUrl, jobId, projectId }: SiteStructureProps) {
  const observerRef = useRef<ResizeObserver | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 1200, height: 700 })
  const [rootUrl, setRootUrl] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [treeData, setTreeData] = useState<D3TreeNode | null>(null)
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('horizontal')
  const [siblingSeparation, setSiblingSeparation] = useState<number>(0.8)
  const [nonSiblingSeparation, setNonSiblingSeparation] = useState<number>(1.0)
  const [labelMaxChars, setLabelMaxChars] = useState<number>(40)
  const [primaryHost, setPrimaryHost] = useState<string | null>(null)
  const [totalUrlsUsed, setTotalUrlsUsed] = useState<number>(0)
  const [breadcrumb, setBreadcrumb] = useState<string[]>([])
  const [recenterKey, setRecenterKey] = useState<number>(0)

  const hasPages = !!pages && pages.length > 0

  // SEO state
  const [seoEnabled, setSeoEnabled] = useState<boolean>(true)
  const [seoLoading, setSeoLoading] = useState<boolean>(false)
  const [seoBatchLoading, setSeoBatchLoading] = useState<boolean>(false)
  const [seoProgress, setSeoProgress] = useState<{ current: number; total: number; estimatedTimeRemaining?: number } | null>(null)
  const [seoError, setSeoError] = useState<string | null>(null)
  const [seoResult] = useState<null | any>(null)
  const [seoByUrl, setSeoByUrl] = useState<Map<string, any>>(new Map())
  const [askModuleDAI, { isLoading: isAskingAI, error: askAIError, reset: resetAskAI }] = useAskModuleDAIMutation()
  const [getSuggestedQuestions] = useGetModuleDSuggestedQuestionsMutation()
  const { toast } = useToast()
  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ModuleDAskAiChatTurn[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [chatFocusBadge, setChatFocusBadge] = useState<string | undefined>(undefined)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const defaultSeoMetricHelp = useMemo(() => {
    return {
      score: {
        meaning: "Priority score for the keyword. Higher generally means it is more valuable to target.",
        improve: "Align content tightly to the keyword, strengthen internal linking to the page, and add supporting subtopics to raise relevance and usefulness."
      },
      relevance_score: {
        meaning: "How strongly the keyword aligns with the selected URL’s topic and intent (0–100).",
        improve: "Use the keyword in H1/H2s naturally, add a focused section that answers the query, and reinforce with related entities and internal links."
      },
      diversity_score: {
        meaning: "How varied the prompt/intent space is around the keyword (0–100). Higher means broader/more mixed intents.",
        improve: "Add intent-specific sections (FAQ, comparisons, pricing, examples) and clarify the page’s main angle to cover diverse intents without confusion."
      },
      prompt_count: {
        meaning: "How many prompts/queries were associated with this keyword.",
        improve: "Expand coverage with FAQ and long-tail variations, and add internal links from related pages to strengthen the cluster."
      },
      difficulty_score: {
        meaning: "How hard it is to win the keyword/prompt given competition and content strength signals (0–100). Higher means harder.",
        improve: "Target narrower sub-queries, improve topical depth, strengthen authority signals, and add structured data and references."
      },
      ai_generation_feasibility: {
        meaning: "How likely models can confidently generate answers from this page for the keyword (0–100). Higher means easier.",
        improve: "Add explicit facts, definitions, step-by-steps and tables; use clear headings and schema so models can extract reliable snippets."
      },
      complexity_level: {
        meaning: "Complexity of the keyword based on length and diversity. High usually means broader or more nuanced intent.",
        improve: "Break the topic into clear sections, add scannable summaries, and use tables/checklists to reduce ambiguity."
      },
    } as const
  }, [])

  const [fetchSeoKeywords] = useGetSeoKeywordsForUrlMutation()

  const { data: fieldsResult, isLoading: isLoadingFields, isError: isFieldsError } =
    useGetJobFieldsQuery(jobId!, { skip: !jobId || !seoEnabled })

  useEffect(() => {
    setSeoBatchLoading(seoEnabled && isLoadingFields)
  }, [seoEnabled, isLoadingFields])

  useEffect(() => {
    if (!seoEnabled) return
    if (!fieldsResult || !Array.isArray(fieldsResult.data)) return

    const map = new Map<string, any>()

    for (const doc of fieldsResult.data) {
      const url = doc?.url as string | undefined
      const keywordAnalysis = doc?.Keyword_analysis
      if (!url || !keywordAnalysis || !Array.isArray(keywordAnalysis.keywords)) continue

      const topKeywords: KeywordData[] = (keywordAnalysis.keywords as any[]).map((k: any) => {
        const base: KeywordData = {
          text: k.text,
          score: k.score,
          prompt_count: k.prompt_count,
          relevance_score: k.relevance_score,
          diversity_score: k.diversity_score
        }
        const metrics = calculateContentMetrics(base)
        return { ...base, ...metrics }
      })

      map.set(normalizeUrl(url), {
        parentText: keywordAnalysis.parent?.text ?? keywordAnalysis.parent ?? null,
        topKeywords,
        metricHelp: keywordAnalysis.metric_help ?? defaultSeoMetricHelp,
      })
    }

    setSeoByUrl(map)
    setSeoProgress(null)
  }, [fieldsResult, seoEnabled])

  useEffect(() => {
    if (isFieldsError) {
      setSeoError('Failed to load SEO keyword data')
    } else {
      setSeoError(null)
    }
  }, [isFieldsError])

  const computeSelectedUrl = useCallback((): string | null => {
    if (!breadcrumb || breadcrumb.length === 0) return null

    for (let i = breadcrumb.length - 1; i >= 0; i--) {
      const candidate = breadcrumb[i]
      if (!candidate) continue
      try {
        const u = new URL(candidate)
        return normalizeUrl(u.toString())
      } catch {
        continue
      }
    }

    const first = breadcrumb[0]
    if (!first) return null
    try {
      const base = new URL(first)
      if (breadcrumb.length === 1) return normalizeUrl(base.toString())
      const suffix = breadcrumb.slice(1).join('/')
      const joined = suffix ? `${base.origin}${base.pathname.replace(/\/$/, '')}/${suffix}` : base.toString()
      return normalizeUrl(joined)
    } catch {
      return null
    }
  }, [breadcrumb])

  const selectedUrl = computeSelectedUrl()
  const selectedSeo = selectedUrl ? seoByUrl.get(selectedUrl) as any : null
  const selectedKeywords: any[] = selectedSeo?.topKeywords || []
  const seoMetricHelp = (selectedSeo?.metricHelp || defaultSeoMetricHelp) as any
  const hasKeywordStats = selectedKeywords.length > 0
  const avgScore = hasKeywordStats
    ? selectedKeywords.reduce((sum, k) => sum + (Number(k.score) || 0), 0) / selectedKeywords.length
    : 0
  const avgRelevance = hasKeywordStats
    ? selectedKeywords.reduce((sum, k) => sum + (Number(k.relevance_score) || 0), 0) / selectedKeywords.length
    : null
  const avgDiversity = hasKeywordStats
    ? selectedKeywords.reduce((sum, k) => sum + (Number(k.diversity_score) || 0), 0) / selectedKeywords.length
    : null
  const avgDifficulty = hasKeywordStats
    ? selectedKeywords.reduce((sum, k) => sum + (Number(k.difficulty_score) || 0), 0) / selectedKeywords.length
    : null
  const avgFeasibility = hasKeywordStats
    ? selectedKeywords.reduce((sum, k) => sum + (Number(k.ai_generation_feasibility) || 0), 0) / selectedKeywords.length
    : null

  const complexityStats = useMemo(() => {
    if (!hasKeywordStats) {
      return { main: null as 'Low' | 'Medium' | 'High' | null, low: 0, medium: 0, high: 0 }
    }
    let low = 0
    let medium = 0
    let high = 0
    for (const kw of selectedKeywords) {
      const level = kw.complexity_level as 'Low' | 'Medium' | 'High' | undefined
      if (level === 'High') high += 1
      else if (level === 'Medium') medium += 1
      else if (level === 'Low') low += 1
    }
    const maxCount = Math.max(low, medium, high)
    let main: 'Low' | 'Medium' | 'High' | null = null
    if (maxCount > 0) {
      if (maxCount === high) main = 'High'
      else if (maxCount === medium) main = 'Medium'
      else main = 'Low'
    }
    return { main, low, medium, high }
  }, [hasKeywordStats, selectedKeywords])

  const [viewMode, setViewMode] = useState<'split' | 'tree' | 'table'>('split')

  useEffect(() => {
    if (!askDialogOpen || !chatScrollRef.current) return
    const el = chatScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [askDialogOpen, chatMessages, isAskingAI])

  useEffect(() => {
    if (!seoEnabled) return
    if (!selectedUrl) return
    if (!jobId) return
    if (seoByUrl.has(selectedUrl)) return

    let cancelled = false

    const fetchSeoForSelected = async () => {
      try {
        setSeoLoading(true)
        const data = await fetchSeoKeywords({ jobId: String(jobId), url: selectedUrl }).unwrap()
        if (cancelled || !data) return

        const rawKeywords = Array.isArray(data.keywords) ? (data.keywords as any[]) : []

        const topKeywords: KeywordData[] = rawKeywords.map((k: any) => {
          const base: KeywordData = {
            text: k.text,
            score: k.score,
            prompt_count: k.prompt_count,
            relevance_score: k.relevance_score,
            diversity_score: k.diversity_score
          }
          const metrics: Partial<KeywordData> = {
            difficulty_score: k.difficulty_score,
            complexity_level: k.complexity_level,
            ai_generation_feasibility: k.ai_generation_feasibility
          }
          const computed = calculateContentMetrics(base)
          return {
            ...base,
            difficulty_score: metrics.difficulty_score ?? computed.difficulty_score,
            complexity_level: metrics.complexity_level ?? computed.complexity_level,
            ai_generation_feasibility: metrics.ai_generation_feasibility ?? computed.ai_generation_feasibility
          }
        })

        setSeoByUrl(prev => {
          const next = new Map(prev)
          const key = normalizeUrl((data as any).url || selectedUrl)
          next.set(key, {
            parentText: (data as any).parent?.text ?? (data as any).parent ?? null,
            topKeywords,
            metricHelp: (data as any).metric_help ?? defaultSeoMetricHelp,
          })
          return next
        })
      } catch {
      } finally {
        if (!cancelled) {
          setSeoLoading(false)
        }
      }
    }

    fetchSeoForSelected()

    return () => {
      cancelled = true
    }
  }, [seoEnabled, selectedUrl, jobId, seoByUrl, fetchSeoKeywords])

  useEffect(() => {
    if (startUrl) {
      setRootUrl(normalizeUrl(startUrl))
    }
  }, [startUrl])

  function formatSeconds(totalSeconds?: number): string {
    if (totalSeconds == null || !isFinite(totalSeconds)) return '--:--';
    const s = Math.max(0, Math.round(totalSeconds));
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  const openAskAiDialog = async () => {
    if (!projectId) return
    resetAskAI()
    setChatMessages([])
    setChatInput('')
    setChatFocusBadge('AI Keywords')
    setAskDialogOpen(true)
    try {
      const res = await getSuggestedQuestions({ project_id: projectId }).unwrap()
      setSuggestions(Array.isArray(res?.questions) ? res.questions.filter(Boolean).slice(0, 12) : [])
    } catch {
      setSuggestions([])
    }
  }

  const submitAskAi = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!projectId || !jobId || !chatInput.trim() || isAskingAI) {
      if (!jobId || !projectId) {
        toast({
          title: 'Project/Job not ready',
          description: 'Please ensure you have an active project and job.',
          variant: 'destructive',
        })
      }
      return
    }

    const question = chatInput.trim()
    setChatInput('')
    const priorHistory = chatMessages.slice(-6).map((m) => ({ role: m.role, content: m.content }))
    const userTurn: ModuleDAskAiChatTurn = { id: chatMessageId(), role: 'user', content: question }
    setChatMessages((prev) => [...prev, userTurn])

    const contextPrefix = selectedUrl
      ? `You are answering questions about the "AI Keywords – Analysis & Scores" panel for this URL:\n${selectedUrl}\n\n`
      : 'You are answering questions about the AI Keywords analysis panel for the selected URL in Module D.\n\n'

    const fullQuestion: string = `${contextPrefix}User question: ${question}`

    try {
      const res = await askModuleDAI({
        project_id: projectId,
        job_id: jobId,
        question: fullQuestion,
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

  const buildTreeFn = useCallback(async () => {
    if (!pages || pages.length === 0) {
      setError('No URLs found for this session')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const urls: string[] = []

      for (const it of pages) {
        const u = it?.url
        if (!u) continue
        const nu = normalizeUrl(u)
        if (!isLikelyPageUrl(nu)) continue
        urls.push(nu)
      }

      const uniqueUrls = Array.from(new Set(urls))
      if (uniqueUrls.length === 0) throw new Error('No URLs found for this session')

      const sessionStart = rootUrl || uniqueUrls[0]
      const normalizedRoot = normalizeUrl(sessionStart)
      const root = new URL(normalizedRoot)
      setRootUrl(normalizedRoot)
      setPrimaryHost(root.host)

      const rootNode: D3TreeNode = { name: normalizedRoot, attributes: { level: 0, full: normalizedRoot }, children: [] }

      const ensureChild = (parent: D3TreeNode, name: string, level: number, full: string): D3TreeNode => {
        if (!parent.children) parent.children = []
        let child = parent.children.find(c => c.name === name)
        if (!child) {
          child = { name, attributes: { level, full }, children: [] }
          parent.children.push(child)
        }
        return child
      }

      let usedCount = 0
      for (const u of uniqueUrls) {
        let parsed: URL
        try { parsed = new URL(u); } catch { continue }
        if (parsed.host !== root.host && !parsed.hostname.endsWith('.' + root.hostname)) continue
        const segments = parsed.pathname.split('/').filter(Boolean)
        let current = rootNode
        let currentFull = `${root.protocol}//${root.host}`
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i]
          currentFull += `/${seg}`
          current = ensureChild(current, seg, ((current.attributes?.level as number) ?? 0) + 1, currentFull)
        }
        usedCount++
      }

      rootNode.attributes = { ...(rootNode.attributes || {}), full: normalizedRoot }
      setTreeData(rootNode)
      autoAdjustLayout(rootNode, setSiblingSeparation, setNonSiblingSeparation, setLabelMaxChars)
      setTotalUrlsUsed(usedCount)
      try { setBreadcrumb([normalizedRoot]); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build tree')
    } finally {
      setLoading(false)
    }
  }, [pages, rootUrl])

  const handleBuild = useCallback(() => { buildTreeFn() }, [buildTreeFn])

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (node) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          })
        }
      })
      observer.observe(node)
      observerRef.current = observer
      
      setContainerSize({
        width: node.clientWidth,
        height: node.clientHeight
      })
    }
  }, [])

  const [seoUpdateKey, setSeoUpdateKey] = useState(0)
  useEffect(() => { setSeoUpdateKey(prev => prev + 1) }, [seoByUrl, seoEnabled])

  return (
    <div className="flex flex-col h-full">
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg sm:text-xl font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Site Structure</h3>
          {primaryHost && (
            <span className="px-2 py-1 rounded-full border text-xs sm:text-sm" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}>
              Root: {primaryHost}
            </span>
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          {!sessionId && (
            <div className="text-yellow-300 text-sm">
              No session selected. Tree will be available when a session is active.
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
              onClick={() => { setSiblingSeparation(0.6); setNonSiblingSeparation(0.8); setLabelMaxChars(30); }}
              title="Ultra compact - Best for 1000+ nodes"
            >
              <Maximize2 className="w-3 h-3 mr-1.5" />
              Compact
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
              onClick={() => { setSiblingSeparation(1.0); setNonSiblingSeparation(1.3); setLabelMaxChars(50); }}
              title="Balanced spacing - Good for 100-500 nodes"
            >
              <Maximize2 className="w-3 h-3 mr-1.5 rotate-90" />
              Comfortable
            </Button>
          </div>
          {seoEnabled && (seoLoading || seoBatchLoading) && (
            <span className="px-2 py-1 rounded text-sm flex items-center gap-2" style={{ background: 'var(--nd-beta-bg)', color: 'var(--nd-beta-text)' }}>
              <span className="inline-block w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--nd-beta-text)', borderTopColor: 'transparent' }}></span>
              {seoBatchLoading && seoProgress ? (
                <>
                  <span>Extracting {seoProgress.current}/{seoProgress.total}</span>
                  <span className="opacity-80">ETA {formatSeconds(seoProgress.estimatedTimeRemaining)}</span>
                </>
              ) : (
                <span>Extracting…</span>
              )}
            </span>
          )}
          {seoEnabled && seoError && (
            <span className="px-2 py-1 rounded text-sm" style={{ background: 'var(--nd-negative-bg)', color: 'var(--nd-negative-text)' }}>
              {seoError}
            </span>
          )}

          <Button
            size="sm"
            className="shadow-sm disabled:opacity-50"
            style={{ background: 'var(--nd-purple)', color: '#ffffff', borderColor: 'var(--nd-purple)' }}
            onClick={handleBuild}
            disabled={!sessionId || !hasPages || loading}
          >
            {loading ? 'Building…' : 'Build Tree'}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={viewMode === 'split' ? 'default' : 'outline'}
              className={cn(
                'border transition-colors',
                viewMode === 'split' ? '' : 'hover:bg-black/5 dark:hover:bg-white/5'
              )}
              style={
                viewMode === 'split'
                  ? { background: 'var(--nd-text-primary)', color: 'var(--nd-bg)', borderColor: 'var(--nd-text-primary)' }
                  : { borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }
              }
              onClick={() => setViewMode('split')}
            >
              <Split className="w-3 h-3 mr-1.5" />
              Split View
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'tree' ? 'default' : 'outline'}
              className={cn(
                'border transition-colors',
                viewMode === 'tree' ? '' : 'hover:bg-black/5 dark:hover:bg-white/5'
              )}
              style={
                viewMode === 'tree'
                  ? { background: 'var(--nd-text-primary)', color: 'var(--nd-bg)', borderColor: 'var(--nd-text-primary)' }
                  : { borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }
              }
              onClick={() => setViewMode('tree')}
            >
              <Layers className="w-3 h-3 mr-1.5" />
              Tree Only
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'table' ? 'default' : 'outline'}
              className={cn(
                'border transition-colors',
                viewMode === 'table' ? '' : 'hover:bg-black/5 dark:hover:bg-white/5'
              )}
              style={
                viewMode === 'table'
                  ? { background: 'var(--nd-text-primary)', color: 'var(--nd-bg)', borderColor: 'var(--nd-text-primary)' }
                  : { borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }
              }
              onClick={() => setViewMode('table')}
              disabled={!seoEnabled}
            >
              <Table className="w-3 h-3 mr-1.5" />
              Table Only
            </Button>

            <Button
              size="sm"
              variant={seoEnabled ? 'default' : 'outline'}
              className={cn(
                'border transition-colors',
                seoEnabled ? 'shadow-lg shadow-purple-500/20' : 'hover:bg-black/5 dark:hover:bg-white/5'
              )}
              style={
                seoEnabled
                  ? { background: 'var(--nd-purple)', color: '#ffffff', borderColor: 'var(--nd-purple)' }
                  : { borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }
              }
              onClick={() => setSeoEnabled(prev => !prev)}
            >
              <Brain className="w-3 h-3 mr-1.5" />
              AI Keywords
            </Button>
          </div>

          {error && <span className="text-red-400 text-sm">{error}</span>}
        </div>
      </div>

      {breadcrumb.length > 0 && (
        <div className="mb-3 text-sm">
          <span className="font-medium" style={{ color: 'var(--nd-text-secondary)' }}>Path:</span>{' '}
          <span className="break-all font-bold" style={{ color: 'var(--nd-text-primary)' }}>{breadcrumb.join(' › ')}</span>
        </div>
      )}

      <div className="flex-1 flex gap-4 min-h-0 animate-in fade-in duration-700">
        {(viewMode === 'split' || viewMode === 'tree') && (
          <div
            ref={setContainerRef}
            className="flex-1 rounded-2xl border overflow-hidden relative transition-all duration-500"
            style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}
          >
            {(() => {
              const isSeoBusy = seoEnabled && (seoLoading || seoBatchLoading)
              if (!treeData) {
                return (
                  <div className="flex items-center justify-center h-full" style={{ color: 'var(--nd-text-muted)' }}>
                    {loading ? 'Building tree structure...' : 'Configure options and click "Build Tree".'}
                  </div>
                )
              }
              if (isSeoBusy) {
                return null
              }
              return (
                <D3TidyTree
                  data={convertToTidy(treeData, seoByUrl, seoEnabled)!}
                  height={containerSize.height}
                  orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
                  dx={siblingSeparation * 80}
                  dy={nonSiblingSeparation * 320}
                  onSelectPath={setBreadcrumb}
                  recenterKey={recenterKey + seoUpdateKey}
                  initialExpandDepth={0}
                />
              )
            })()}
            {(seoEnabled && (seoLoading || seoBatchLoading)) && (
              <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(0,0,0,0.5)' }}>
                <div className="flex items-center gap-3" style={{ color: 'var(--nd-text-primary)' }}>
                  <span className="inline-block w-6 h-6 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--nd-purple)', borderTopColor: 'transparent' }}></span>
                  {seoBatchLoading && seoProgress ? (
                    <div className="text-sm">
                      <div className="font-semibold">Extracting keywords…</div>
                      <div className="opacity-90">{seoProgress.current}/{seoProgress.total} • ETA {formatSeconds(seoProgress.estimatedTimeRemaining)}</div>
                    </div>
                  ) : (
                    <div className="text-sm font-semibold">Extracting keywords…</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {seoEnabled && (viewMode === 'split' || viewMode === 'table') && (
          <div
            className={`${viewMode === 'table' ? 'flex-1' : 'w-full md:w-104 lg:w-120'} h-full overflow-y-auto rounded-2xl border p-5 flex flex-col gap-5 text-xs shadow-lg animate-in slide-in-from-right duration-500`}
            style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl" style={{ background: 'rgba(167, 139, 250, 0.1)' }}>
                  <Brain className="w-5 h-5" style={{ color: 'var(--nd-purple)' }} />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--nd-purple)' }}>
                    AI Keywords
                  </div>
                  <div className="text-sm font-semibold leading-tight" style={{ color: 'var(--nd-text-primary)' }}>
                    Analysis & Scores
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {hasKeywordStats && (
                  <div className="hidden md:flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] text-emerald-300 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Optimized</span>
                  </div>
                )}
                <Button
                  type="button"
                  onClick={openAskAiDialog}
                  disabled={!projectId || isAskingAI}
                  className={cn(
                    'rounded-full border-0 shadow-lg shadow-fuchsia-950/30',
                    'text-[11px] font-extrabold uppercase tracking-wider',
                    'bg-linear-to-r from-purple-500 via-pink-500 to-amber-300',
                    'text-black hover:opacity-95 hover:shadow-xl',
                    'h-auto min-h-8.5 px-3 py-1.5',
                    'gap-1.5',
                  )}
                >
                  <MessageSquare className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
                  Ask AI
                </Button>
              </div>
            </div>

            {/* Selected URL Section */}
            <div className="rounded-2xl p-4 border" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <div className="text-[10px] uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: 'var(--nd-text-muted)' }}>
                <Globe className="w-3 h-3" />
                Selected URL
              </div>
              {selectedUrl ? (
                <a
                  href={selectedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 text-[11px] break-all transition-colors"
                  style={{ color: 'var(--nd-purple)' }}
                >
                  <div className="p-1 rounded-md transition-colors" style={{ background: 'rgba(167, 139, 250, 0.1)' }}>
                    <ArrowUpRight className="w-3 h-3" />
                  </div>
                  <span className="truncate">{selectedUrl}</span>
                </a>
              ) : (
                <div className="text-[11px] italic" style={{ color: 'var(--nd-text-muted)' }}>Select a node in the tree to view details</div>
              )}
            </div>

            {/* Main Topic & Scores */}
            <div className="space-y-3">
               {/* Main Topic */}
               <div className="rounded-2xl p-5 border relative overflow-hidden" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                 <div className="absolute top-0 right-0 p-3 opacity-10">
                   <Target className="w-16 h-16" style={{ color: 'var(--nd-text-primary)' }} />
                 </div>
                 <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--nd-text-muted)' }}>Main Topic</div>
                 <div className="text-lg font-bold relative z-10" style={{ color: 'var(--nd-text-primary)' }}>
                   {selectedSeo?.parentText || 'Not available'}
                 </div>
               </div>

               {selectedKeywords.length > 0 && (
                 <div className="grid grid-cols-1 gap-3">
                   <div className="grid grid-cols-2 gap-3">
                     <div className="relative">
                       <ScoreCard 
                         title="Difficulty"
                         score={avgDifficulty != null ? Math.round(avgDifficulty) : '--'}
                         subText="SEO Competition"
                         icon={<TrendingUp className="w-5 h-5 text-rose-300" />}
                         color="bg-rose-500/20"
                         trend={avgDifficulty && avgDifficulty > 50 ? 12 : -5}
                       />
                       {seoMetricHelp?.difficulty_score && (
                         <Tooltip>
                           <TooltipTrigger asChild>
                             <button
                               type="button"
                               className="absolute top-2 right-2 text-(--nd-text-muted) hover:text-(--nd-text-primary) transition-colors"
                               aria-label="Difficulty help"
                             >
                               <Info className="h-3.5 w-3.5" />
                             </button>
                           </TooltipTrigger>
                           <TooltipContent side="top" align="end" className="max-w-64 bg-white border border-(--nd-border) text-(--nd-text-primary) text-[11px] leading-relaxed rounded-2xl px-3 py-2.5">
                             <div className="space-y-1.5">
                               <div><span className="font-semibold">Meaning: </span>{seoMetricHelp.difficulty_score.meaning}</div>
                               <div><span className="font-semibold">Improve: </span>{seoMetricHelp.difficulty_score.improve}</div>
                             </div>
                           </TooltipContent>
                         </Tooltip>
                       )}
                     </div>
                     <div className="relative">
                       <ScoreCard 
                         title="Feasibility"
                         score={avgFeasibility != null ? Math.round(avgFeasibility) : '--'}
                         subText="AI Generation"
                         icon={<Zap className="w-5 h-5 text-emerald-300" />}
                         color="bg-emerald-500/20"
                         trend={avgFeasibility && avgFeasibility > 70 ? 8 : 2}
                       />
                       {seoMetricHelp?.ai_generation_feasibility && (
                         <Tooltip>
                           <TooltipTrigger asChild>
                             <button
                               type="button"
                               className="absolute top-2 right-2 text-(--nd-text-muted) hover:text-(--nd-text-primary) transition-colors"
                               aria-label="Feasibility help"
                             >
                               <Info className="h-3.5 w-3.5" />
                             </button>
                           </TooltipTrigger>
                           <TooltipContent side="top" align="end" className="max-w-64 bg-white border border-(--nd-border) text-(--nd-text-primary) text-[11px] leading-relaxed rounded-2xl px-3 py-2.5">
                             <div className="space-y-1.5">
                               <div><span className="font-semibold">Meaning: </span>{seoMetricHelp.ai_generation_feasibility.meaning}</div>
                               <div><span className="font-semibold">Improve: </span>{seoMetricHelp.ai_generation_feasibility.improve}</div>
                             </div>
                           </TooltipContent>
                         </Tooltip>
                       )}
                     </div>
                   </div>
                    <div className="relative">
                      <ScoreCard 
                        title="Complexity"
                        score={complexityStats.main === 'High' ? 85 : complexityStats.main === 'Medium' ? 50 : 25}
                        subText={`Distribution: ${complexityStats.low} Low, ${complexityStats.medium} Med, ${complexityStats.high} High`}
                        icon={<Layers className="w-5 h-5 text-amber-300" />}
                        color="bg-amber-500/20"
                        className="col-span-1"
                      />
                      {seoMetricHelp?.complexity_level && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="absolute top-2 right-2  hover:text-(--nd-text-primary) transition-colors"
                              aria-label="Complexity help"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="end" className="max-w-64 bg-white border border-(--nd-border) text-(--nd-text-primary) text-[11px] leading-relaxed rounded-2xl px-3 py-2.5">
                            <div className="space-y-1.5">
                              <div><span className="font-semibold">Meaning: </span>{seoMetricHelp.complexity_level.meaning}</div>
                              <div><span className="font-semibold">Improve: </span>{seoMetricHelp.complexity_level.improve}</div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                 </div>
               )}
            </div>

            {/* Keywords Table */}
            {selectedKeywords.length > 0 && (
              <div className="flex flex-col shrink-0 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Keyword Analysis</div>
                  <div className="text-[10px]" style={{ color: 'var(--nd-text-muted)' }}>{selectedKeywords.length} keywords</div>
                </div>
                
                <div className="rounded-2xl border overflow-hidden flex flex-col" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                  <div className="overflow-auto custom-scrollbar">
                     <table className="w-full text-left border-collapse">
                       <thead className="sticky top-0 z-10 backdrop-blur-md border-b" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                         <tr>
                           <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Keyword</th>
                          <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-right" style={{ color: 'var(--nd-text-muted)' }}>
                            <div className="flex items-center justify-end gap-1">
                              <span>Score</span>
                              {seoMetricHelp?.score && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className=" hover:text-(--nd-text-primary) transition-colors" aria-label="Score help">
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="end" className="max-w-64 bg-white border border-(--nd-border) text-(--nd-text-primary) text-[11px] leading-relaxed rounded-2xl px-3 py-2.5">
                                    <div className="space-y-1.5">
                                      <div><span className="font-semibold">Meaning: </span>{seoMetricHelp.score.meaning}</div>
                                      <div><span className="font-semibold">Improve: </span>{seoMetricHelp.score.improve}</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </th>
                          <th className="px-4 py-3 text-[10px] font-semibold  uppercase tracking-wider text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span>Rel</span>
                              {seoMetricHelp?.relevance_score && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className=" hover:text-(--nd-text-primary) transition-colors" aria-label="Relevance help">
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="end" className="max-w-64 bg-white border border-(--nd-border) text-(--nd-text-primary) text-[11px] leading-relaxed rounded-2xl px-3 py-2.5">
                                    <div className="space-y-1.5">
                                      <div><span className="font-semibold">Meaning: </span>{seoMetricHelp.relevance_score.meaning}</div>
                                      <div><span className="font-semibold">Improve: </span>{seoMetricHelp.relevance_score.improve}</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </th>
                          <th className="px-4 py-3 text-[10px] font-semibold  uppercase tracking-wider text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span>Div</span>
                              {seoMetricHelp?.diversity_score && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className=" hover:text-(--nd-text-primary) transition-colors" aria-label="Diversity help">
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="end" className="max-w-64 bg-white border border-(--nd-border) text-(--nd-text-primary) text-[11px] leading-relaxed rounded-2xl px-3 py-2.5">
                                    <div className="space-y-1.5">
                                      <div><span className="font-semibold">Meaning: </span>{seoMetricHelp.diversity_score.meaning}</div>
                                      <div><span className="font-semibold">Improve: </span>{seoMetricHelp.diversity_score.improve}</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </th>
                          <th className="px-4 py-3 text-[10px] font-semibold  uppercase tracking-wider text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span>Prompt</span>
                              {seoMetricHelp?.prompt_count && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className=" hover:text-(--nd-text-primary) transition-colors" aria-label="Prompt count help">
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="end" className="max-w-64 bg-white border border-(--nd-border) text-(--nd-text-primary) text-[11px] leading-relaxed rounded-2xl px-3 py-2.5">
                                    <div className="space-y-1.5">
                                      <div><span className="font-semibold">Meaning: </span>{seoMetricHelp.prompt_count.meaning}</div>
                                      <div><span className="font-semibold">Improve: </span>{seoMetricHelp.prompt_count.improve}</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </th>
                          <th className="px-4 py-3 text-[10px] font-semibold  uppercase tracking-wider text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span>Dif</span>
                              {seoMetricHelp?.difficulty_score && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className=" hover:text-(--nd-text-primary) transition-colors" aria-label="Difficulty help">
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="end" className="max-w-64 bg-white border border-(--nd-border) text-(--nd-text-primary) text-[11px] leading-relaxed rounded-2xl px-3 py-2.5">
                                    <div className="space-y-1.5">
                                      <div><span className="font-semibold">Meaning: </span>{seoMetricHelp.difficulty_score.meaning}</div>
                                      <div><span className="font-semibold">Improve: </span>{seoMetricHelp.difficulty_score.improve}</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </th>
                          <th className="px-4 py-3 text-[10px] font-semibold  uppercase tracking-wider text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span>Feas</span>
                              {seoMetricHelp?.ai_generation_feasibility && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className=" hover:text-(--nd-text-primary) transition-colors" aria-label="Feasibility help">
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="end" className="max-w-64 bg-white border border-(--nd-border) text-(--nd-text-primary) text-[11px] leading-relaxed rounded-2xl px-3 py-2.5">
                                    <div className="space-y-1.5">
                                      <div><span className="font-semibold">Meaning: </span>{seoMetricHelp.ai_generation_feasibility.meaning}</div>
                                      <div><span className="font-semibold">Improve: </span>{seoMetricHelp.ai_generation_feasibility.improve}</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </th>
                          <th className="px-4 py-3 text-[10px] font-semibold  uppercase tracking-wider text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span>Cmplx</span>
                              {seoMetricHelp?.complexity_level && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className=" hover:text-(--nd-text-primary) transition-colors" aria-label="Complexity help">
                                      <Info className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="end" className="max-w-64 bg-white border border-(--nd-border) text-(--nd-text-primary) text-[11px] leading-relaxed rounded-2xl px-3 py-2.5">
                                    <div className="space-y-1.5">
                                      <div><span className="font-semibold">Meaning: </span>{seoMetricHelp.complexity_level.meaning}</div>
                                      <div><span className="font-semibold">Improve: </span>{seoMetricHelp.complexity_level.improve}</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </th>
                         </tr>
                       </thead>
                       <tbody className="divide-y ">
                         {selectedKeywords.map((kw: any, idx: number) => (
                           <tr key={idx} className="hover: transition-all duration-200 group">
                             <td className="px-4 py-3 text-xs  font-medium">
                               <div className="flex items-center gap-2">
                                 <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 group-hover:bg-indigo-400 transition-colors"></div>
                                 <div className="truncate max-w-30 sm:max-w-37.5" title={kw.text}>{kw.text}</div>
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <div className="flex flex-col items-end gap-1">
                                 <span className="text-xs font-mono  font-medium">{kw.score != null ? Number(kw.score).toFixed(1) : '-'}</span>
                                 <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                                   <div 
                                     className="h-full bg-linear-to-r from-indigo-500 to-purple-500 rounded-full"
                                     style={{ width: `${Math.min(100, (Number(kw.score) || 0) * 10)}%` }}
                                   />
                                 </div>
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <div className="flex flex-col items-end gap-1">
                                 <span className="text-xs font-mono ">{kw.relevance_score != null ? Number(kw.relevance_score).toFixed(1) : '-'}</span>
                                 <div className="w-8 h-0.5 bg-white/10 rounded-full overflow-hidden">
                                   <div 
                                     className="h-full bg-blue-400/70 rounded-full"
                                     style={{ width: `${Math.min(100, (Number(kw.relevance_score) || 0))}%` }}
                                   />
                                 </div>
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <div className="flex flex-col items-end gap-1">
                                 <span className="text-xs font-mono ">{kw.diversity_score != null ? Number(kw.diversity_score).toFixed(1) : '-'}</span>
                                 <div className="w-8 h-0.5 bg-white/10 rounded-full overflow-hidden">
                                   <div 
                                     className="h-full bg-teal-400/70 rounded-full"
                                     style={{ width: `${Math.min(100, (Number(kw.diversity_score) || 0))}%` }}
                                   />
                                 </div>
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <div className="flex justify-end">
                                 <span className="w-6 h-6 rounded-full border   flex items-center justify-center text-[10px] font-mono ">
                                   {kw.prompt_count ?? '-'}
                                 </span>
                               </div>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <span className={cn(
                                 "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                                 (kw.difficulty_score || 0) > 70 ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                 (kw.difficulty_score || 0) > 40 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                 "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                               )}>
                                 {kw.difficulty_score != null ? Math.round(kw.difficulty_score) : '-'}
                               </span>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <span className={cn(
                                 "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                                 (kw.ai_generation_feasibility || 0) > 70 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                 (kw.ai_generation_feasibility || 0) > 40 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                 "bg-rose-500/10 text-rose-400 border-rose-500/20"
                               )}>
                                 {kw.ai_generation_feasibility != null ? `${Math.round(kw.ai_generation_feasibility)}%` : '-'}
                               </span>
                             </td>
                             <td className="px-4 py-3 text-right">
                               <span className={cn(
                                 "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                                 kw.complexity_level === 'High' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                 kw.complexity_level === 'Medium' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                 kw.complexity_level === 'Low' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                 "  "
                               )}>
                                 {kw.complexity_level ?? '-'}
                               </span>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                  </div>
                </div>
              </div>
            )}
            
            {selectedKeywords.length === 0 && (
              <div className="mt-4 rounded-2xl border border-dashed   px-6 py-8 text-center">
                <div className="flex justify-center mb-3">
                   <div className="p-3 rounded-full ">
                     <Search className="w-5 h-5 " />
                   </div>
                </div>
                <div className="text-xs ">
                  AI keywords are still being extracted or none were found for this URL.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
