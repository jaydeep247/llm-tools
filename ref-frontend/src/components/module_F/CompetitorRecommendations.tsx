'use client'

/**
 * CompetitorRecommendations.tsx
 * MOAT 4 Recommendation Engine — Premium UI Overhaul
 * 
 * Redesigned with a high-fidelity visual hierarchy, role-based action queues,
 * and semantic iconography to guide users from insight to execution.
 */

import { useState, useMemo } from 'react'
import {
  type LucideIcon,
  Lightbulb, AlertTriangle, TrendingDown, TrendingUp, Minus,
  ChevronDown, ChevronUp, CheckCircle2, Clock, Zap, Target,
  Globe, Link2, Star, BarChart2, ShieldAlert, Eye, ArrowUp,
  ArrowDown, Info, BookOpen, Layers, Flame, Trophy,
  FileText, BarChart, CheckCheck, Sparkles, Rocket,
  Search, ExternalLink, Activity, ChevronRight, BarChart3,
  MousePointer2, History, Layout, Calendar, Percent,
  AlertCircle, ShieldCheck, ListChecks, Filter,
  ArrowRightCircle, CheckSquare, MoreVertical,
  Maximize2, Share2, Download, Settings2, HelpCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatCard } from '@/components/ui/StatCard'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  type ModuleFResult,
  type ModuleFAlert,
  type ModuleFRecommendations,
  type ModuleFGapOpportunity,
  type ModuleFSourceAnalysis,
  type ModuleFCompareVisibilityAgainstCompetitors,
  type ModuleFCompareVisibilityEntityRow,
  type Moat4Recommendations,
  type Moat4RoleOutput,
  type Moat4Action,
  type Moat4DeltaClass as DeltaClass,
  type Moat4GapType as GapType,
  resolveMoat4Recommendations,
  resolveGapAnalysis,
  resolveRecommendations,
  resolveAlerts,
  resolveFeatureFlags,
  resolveD7Output,
  normaliseMetricRec,
} from '@/store/api/module_F/moduleFApi'

// ─────────────────────────────────────────────────────────────────────────────
// Types & Config
// ─────────────────────────────────────────────────────────────────────────────

interface CompetitorRecommendationsProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
  jobId?: string | null
}

const DELTA_CONFIG: Record<DeltaClass, {
  label: string; desc: string; color: string; accent: 'rose' | 'amber' | 'blue' | 'emerald' | 'zinc' | 'violet' | 'cyan'; icon: LucideIcon
}> = {
  competitor_threat: {
    label: 'Competitor Threat',
    desc: 'A competitor has surged or flipped prompts away from your brand. Act within 7 days.',
    color: 'text-rose-400', accent: 'rose',
    icon: ShieldAlert,
  },
  critical_drop: {
    label: 'Critical Drop',
    desc: 'Your benchmark score dropped more than 15 pts since the last run. Immediate action required.',
    color: 'text-rose-400', accent: 'rose',
    icon: TrendingDown,
  },
  significant_drop: {
    label: 'Significant Drop',
    desc: 'Benchmark or visibility dropped 8–15 pts. Prioritise content fixes this sprint.',
    color: 'text-amber-400', accent: 'amber',
    icon: TrendingDown,
  },
  plateau: {
    label: 'Plateau',
    desc: 'Score has been flat 21+ days while competitors win prompts. Expand your content coverage.',
    color: 'text-blue-400', accent: 'blue',
    icon: Minus,
  },
  improvement: {
    label: 'Improving',
    desc: 'Benchmark improved +5 pts or more. Defend winning prompts and push for further gains.',
    color: 'text-emerald-400', accent: 'emerald',
    icon: TrendingUp,
  },
  stable: {
    label: 'Stable',
    desc: 'No significant movement. Use this time to build uncontested territory before a competitor does.',
    color: 'text-zinc-400', accent: 'zinc',
    icon: Minus,
  },
}

const GAP_CONFIG: Partial<Record<GapType, { label: string; cls: string; icon: LucideIcon }>> = {
  uncontested:        { label: 'Uncontested',   icon: Star,          cls: 'bg-amber-500/10 text-amber-400 border-amber-500/25' },
  priority_fix:       { label: 'Priority Fix',     icon: AlertCircle,   cls: 'bg-rose-500/10 text-rose-400 border-rose-500/25' },
  comparison_page:    { label: 'Comparison Page',  icon: Layers,        cls: 'bg-violet-500/10 text-violet-400 border-violet-500/25' },
  near_uncontested:   { label: 'Near-Uncontested', icon: Zap,           cls: 'bg-amber-500/10 text-amber-400 border-amber-500/25' },
  competitor_surge:   { label: 'Competitor Surge', icon: Flame,         cls: 'bg-rose-500/10 text-rose-400 border-rose-500/25' },
  win_rate:           { label: 'Win Rate Fix',      icon: Target,        cls: 'bg-blue-500/10 text-blue-400 border-blue-500/25' },
  citation_gap:       { label: 'Citation Gap',      icon: Link2,         cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
  schema:             { label: 'Add Schema',        icon: FileText,      cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25' },
  score_drop:         { label: 'Score Recovery',    icon: ArrowDown,     cls: 'bg-rose-500/10 text-rose-400 border-rose-500/25' },
  entity_consistency: { label: 'Entity Signals',    icon: ShieldCheck,   cls: 'bg-zinc-800 text-zinc-400 border-zinc-700/50' },
  model_gap:          { label: 'Model Gap',          icon: Activity,      cls: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25' },
}

const ROLE_CONFIG = [
  { id: 'all',             label: 'All Actions', icon: ListChecks,    hint: 'Full prioritized backlog' },
  { id: 'cxo',             label: 'CXO Brief',   icon: Trophy,        hint: 'Executive strategic priorities' },
  { id: 'cmo',             label: 'CMO Focus',   icon: BarChart,      hint: 'Content ROI & positioning' },
  { id: 'seo_manager',     label: 'SEO Sprint',  icon: Target,        hint: 'Technical & structural fixes' },
  { id: 'content_manager', label: 'Content Brief', icon: FileText,     hint: 'Entity-focused content guides' },
]

const METRIC_META: Record<string, { label: string; icon: React.ReactNode }> = {
  visibility_score:     { label: 'AI Visibility Score',    icon: <Eye className="w-3.5 h-3.5" /> },
  market_share:         { label: 'Market Share',            icon: <Layers className="w-3.5 h-3.5" /> },
  brand_win_rate:       { label: 'Brand Win Rate',          icon: <Target className="w-3.5 h-3.5" /> },
  competitor_win_rate:  { label: 'Competitor Win Rate',     icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  content_gap_score:    { label: 'Content Gap Score',       icon: <BookOpen className="w-3.5 h-3.5" /> },
  missing_prompts:      { label: 'Missing Prompts',         icon: <Minus className="w-3.5 h-3.5" /> },
  potential_gain:       { label: 'Potential Gain',          icon: <TrendingUp className="w-3.5 h-3.5" /> },
  source_influence:     { label: 'Source Influence',        icon: <Link2 className="w-3.5 h-3.5" /> },
  avg_domain_authority: { label: 'Avg Domain Authority',    icon: <Globe className="w-3.5 h-3.5" /> },
  total_citations:      { label: 'Total Citations',         icon: <Star className="w-3.5 h-3.5" /> },
  rank_delta:           { label: 'Rank Δ vs Brand',         icon: <BarChart2 className="w-3.5 h-3.5" /> },
}

const CT_COLOR: Record<string, string> = {
  comparison: 'bg-purple-500/10 text-purple-300 border-purple-500/25',
  guide:      'bg-sky-500/10 text-sky-300 border-sky-500/25',
  blog:       'bg-zinc-700/40 text-zinc-400 border-zinc-600/25',
  tool:       'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  faq:        'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
  page:       'bg-zinc-800 text-zinc-500 border-zinc-700',
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Components
// ─────────────────────────────────────────────────────────────────────────────

/** Premium Header Section */
function EngineHeader({ deltaClass, summary }: { deltaClass: DeltaClass; summary?: string }) {
  const cfg = DELTA_CONFIG[deltaClass] ?? DELTA_CONFIG.stable
  const Icon = cfg.icon

  return (
    <div className="relative group overflow-hidden rounded-[2rem] border border-zinc-800/50 bg-zinc-900/40 p-8 mb-8 transition-all duration-500 hover:border-zinc-700/50 hover:bg-zinc-900/60">
      {/* Background Effects */}
      <div className={cn(
        "absolute -top-24 -right-24 w-64 h-64 rounded-full blur-[100px] opacity-20 transition-all duration-700 group-hover:opacity-30",
        cfg.accent === 'rose' ? 'bg-rose-500' :
        cfg.accent === 'amber' ? 'bg-amber-500' :
        cfg.accent === 'blue' ? 'bg-blue-500' :
        cfg.accent === 'emerald' ? 'bg-emerald-500' :
        cfg.accent === 'violet' ? 'bg-violet-500' : 'bg-zinc-500'
      )} />
      
      <div className="relative flex flex-col md:flex-row items-center gap-8">
        {/* Pulsing Icon */}
        <div className="relative shrink-0">
          <div className={cn(
            "absolute inset-0 rounded-3xl blur-xl opacity-40 animate-pulse",
            cfg.accent === 'rose' ? 'bg-rose-500' :
            cfg.accent === 'amber' ? 'bg-amber-500' :
            cfg.accent === 'blue' ? 'bg-blue-500' :
            cfg.accent === 'emerald' ? 'bg-emerald-500' :
            cfg.accent === 'violet' ? 'bg-violet-500' : 'bg-zinc-500'
          )} />
          <div className={cn(
            "relative w-20 h-20 rounded-3xl border flex items-center justify-center shadow-2xl",
            cfg.accent === 'rose' ? 'bg-rose-500/20 border-rose-500/30' :
            cfg.accent === 'amber' ? 'bg-amber-500/20 border-amber-500/30' :
            cfg.accent === 'blue' ? 'bg-blue-500/20 border-blue-500/30' :
            cfg.accent === 'emerald' ? 'bg-emerald-500/20 border-emerald-500/30' :
            cfg.accent === 'violet' ? 'bg-violet-500/20 border-violet-500/30' : 'bg-zinc-800/50 border-zinc-700/50'
          )}>
            <Icon className={cn("w-10 h-10", cfg.color)} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 text-center md:text-left space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-white">Recommendation Engine</h1>
              <Badge variant="outline" className={cn(
                "text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 border-transparent",
                cfg.accent === 'rose' ? 'bg-rose-500/10 text-rose-400' :
                cfg.accent === 'amber' ? 'bg-amber-500/10 text-amber-400' :
                cfg.accent === 'blue' ? 'bg-blue-500/10 text-blue-400' :
                cfg.accent === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
                cfg.accent === 'violet' ? 'bg-violet-500/10 text-violet-400' : 'bg-zinc-800 text-zinc-400'
              )}>
                {cfg.label}
              </Badge>
            </div>
            <p className="text-zinc-400 text-lg font-medium max-w-2xl leading-relaxed">
              {cfg.desc}
            </p>
          </div>
          
          {summary && (
            <div className="flex items-center gap-2 text-sm text-zinc-500 bg-zinc-950/40 w-fit px-4 py-2 rounded-full border border-zinc-800/50">
              <Info className="w-4 h-4 text-zinc-600" />
              <span>{summary}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button className="p-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all">
            <Share2 className="w-5 h-5" />
          </button>
          <button className="p-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all">
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Alert Banner for Critical Changes */
function AlertBanner({ alerts }: { alerts: ModuleFAlert[] }) {
  const [gone, setGone] = useState(false)
  if (!alerts.length || gone) return null
  
  const top = alerts[0]
  const isUp = top.alertType === 'improvement'
  const isDn = top.alertType === 'drop'
  
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border p-4 mb-6 transition-all duration-300 animate-in slide-in-from-top-4",
      isUp ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 
      isDn ? 'bg-rose-500/5 border-rose-500/20 text-rose-400' : 
      'bg-amber-500/5 border-amber-500/20 text-amber-400'
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "p-2 rounded-xl shrink-0",
          isUp ? 'bg-emerald-500/10' : isDn ? 'bg-rose-500/10' : 'bg-amber-500/10'
        )}>
          {isUp ? <TrendingUp className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        </div>
        
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider">
              {isUp ? 'Performance Lift' : isDn ? 'Visibility Alert' : 'Market Shift'} — {top.entityName}
            </span>
            <Badge variant="outline" className={cn(
              "text-[9px] font-bold px-1.5 py-0 border-current opacity-70",
              isUp ? 'text-emerald-500' : isDn ? 'text-rose-500' : 'text-amber-500'
            )}>
              {top.alertLevel?.toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm text-zinc-200 font-medium">{top.message}</p>
          
          <div className="flex items-center gap-4 text-[10px] font-mono opacity-80">
            {top.scoreDelta !== 0 && (
              <span className="flex items-center gap-1">
                {top.scoreDelta > 0 ? '+' : ''}{top.scoreDelta.toFixed(1)} pts
              </span>
            )}
            {top.rankMove !== 0 && (
              <span className="flex items-center gap-1">
                {top.rankMove > 0 ? '↑' : '↓'} {Math.abs(top.rankMove)} rank
              </span>
            )}
            <span className="text-zinc-500">{new Date(top.firedAt).toLocaleDateString()}</span>
          </div>
        </div>

        <button 
          onClick={() => setGone(true)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/** Individual Action Card */
function ActionCard({
  action, index, onStatusChange,
}: {
  action: Moat4Action; index: number
  onStatusChange: (recId: string, status: 'completed' | 'dismissed') => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const gap = action.gap_type ? GAP_CONFIG[action.gap_type] : null
  const isDone = action.status === 'completed'
  const isDismissed = action.status === 'dismissed'

  const priorityScore = action.priority_score ?? 0
  const priorityAccent: 'rose' | 'amber' | 'blue' | 'zinc' = 
    priorityScore >= 8 ? 'rose' : 
    priorityScore >= 6.5 ? 'amber' : 
    priorityScore >= 5 ? 'blue' : 'zinc'

  const effortText = action.effort_hours ? `~${action.effort_hours}h` : 
    action.effort_score >= 8 ? 'Quick win' : 
    action.effort_score >= 5 ? 'Medium effort' : 'Large project'

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl border transition-all duration-300",
      isDone ? "bg-emerald-500/5 border-emerald-500/20 opacity-60" :
      isDismissed ? "bg-zinc-900/40 border-zinc-800 opacity-40" :
      priorityAccent === 'rose' ? "bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40" :
      priorityAccent === 'amber' ? "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40" :
      "bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/60"
    )}>
      <div className="p-5">
        <div className="flex items-start gap-5">
          {/* Index/Icon Container */}
          <div className={cn(
            "w-12 h-12 rounded-2xl border flex items-center justify-center text-sm font-bold shrink-0 mt-0.5 shadow-inner transition-transform group-hover:scale-105",
            isDone ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" :
            priorityAccent === 'rose' ? "bg-rose-500/20 border-rose-500/30 text-rose-400" :
            priorityAccent === 'amber' ? "bg-amber-500/20 border-amber-500/30 text-amber-400" :
            "bg-zinc-800 border-zinc-700 text-zinc-400"
          )}>
            {isDone ? <CheckSquare className="w-5 h-5" /> : index + 1}
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={cn(
                  "text-lg font-bold tracking-tight",
                  isDone ? "line-through text-zinc-500" : "text-zinc-100 group-hover:text-white transition-colors"
                )}>
                  {action.action_title}
                </h3>
                {gap && (
                  <Badge variant="outline" className={cn("text-[9px] font-bold uppercase tracking-widest px-2 py-0 border-current opacity-80", gap.cls)}>
                    <gap.icon className="w-3 h-3 mr-1" />
                    {gap.label}
                  </Badge>
                )}
                {action.competitor && (
                  <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 text-[9px] font-bold uppercase tracking-widest px-2 py-0">
                    vs {action.competitor}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-4 text-xs font-medium text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {effortText}
                </span>
                <span className="w-1 h-1 rounded-full bg-zinc-800" />
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Score: {priorityScore.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Score Breakdown Bar */}
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-6 py-3 border-y border-zinc-800/40">
              {[
                { label: 'Impact',  value: action.impact_score,  color: 'text-violet-400', icon: Zap },
                { label: 'Effort',  value: action.effort_score,  color: 'text-cyan-400',   icon: Activity },
                { label: 'Urgency', value: action.urgency_score, color: 'text-amber-400',  icon: Flame },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <div className={cn("flex items-center gap-1.5 text-xs font-bold tabular-nums", color)}>
                    <Icon className="w-3.5 h-3.5" />
                    {value.toFixed(1)}
                  </div>
                  <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">{label}</span>
                </div>
              ))}
              
              <div className="hidden sm:block flex-1 ml-6 h-1.5 bg-zinc-800/50 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-1000 ease-out",
                    priorityAccent === 'rose' ? "bg-rose-500" :
                    priorityAccent === 'amber' ? "bg-amber-500" :
                    priorityAccent === 'blue' ? "bg-blue-500" : "bg-zinc-600"
                  )} 
                  style={{ width: `${(priorityScore / 10) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {!isDone && !isDismissed && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        onClick={() => onStatusChange(action.rec_id, 'completed')}
                        className="p-2.5 rounded-xl bg-zinc-800/50 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 border border-transparent transition-all"
                      >
                        <CheckCircle2 className="w-4.5 h-4.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Mark as Completed</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        onClick={() => onStatusChange(action.rec_id, 'dismissed')}
                        className="p-2.5 rounded-xl bg-zinc-800/50 text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 border border-transparent transition-all"
                      >
                        <Clock className="w-4.5 h-4.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Dismiss for Now</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
            
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className={cn(
                "p-2.5 rounded-xl transition-all border border-transparent",
                isOpen ? "bg-zinc-800 text-white border-zinc-700" : "bg-zinc-800/50 text-zinc-500 hover:text-white"
              )}
            >
              {isOpen ? <ChevronUp className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>

        {/* Expandable Detail Panel */}
        {isOpen && (
          <div className="mt-6 ml-16 space-y-6 animate-in slide-in-from-top-4 duration-500">
            {/* Strategy Box */}
            <div className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-5 shadow-inner">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <BookOpen className="w-12 h-12" />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-violet-500/10 rounded-lg border border-violet-500/20">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Execution Strategy</span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                {action.action_detail}
              </p>
            </div>

            {/* URLs & Resources */}
            {(action.affected_urls?.length ?? 0) > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 ml-1">
                  <Link2 className="w-3.5 h-3.5 text-zinc-600" />
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Target Endpoints</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {action.affected_urls.map((url, i) => (
                    <div key={i} className="group/url flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800/60 hover:border-zinc-700 transition-colors">
                      <code className="text-[10px] text-zinc-400 truncate max-w-[80%] font-mono">{url}</code>
                      <ExternalLink className="w-3 h-3 text-zinc-700 group-hover/url:text-zinc-400 transition-colors" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Model Sensitivity Breakdown (Issue 10 Fix) */}
            {action.gap_type === 'model_gap' && action.model_detail && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 ml-1">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Model Sensitivity Breakdown</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-center">
                    <p className="text-[10px] text-emerald-500/60 uppercase tracking-wider mb-1 font-bold">Peak Performance</p>
                    <p className="text-2xl font-bold text-emerald-400">#{action.model_detail.best_rank}</p>
                    <p className="text-[10px] text-zinc-500 capitalize mt-1 font-medium">{action.model_detail.best_model}</p>
                  </div>
                  <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 text-center">
                    <p className="text-[10px] text-rose-500/60 uppercase tracking-wider mb-1 font-bold">Critical Gap</p>
                    <p className="text-2xl font-bold text-rose-400">#{action.model_detail.worst_rank}</p>
                    <p className="text-[10px] text-zinc-500 capitalize mt-1 font-medium">{action.model_detail.worst_model}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Action Queue Section Wrapper */
function ActionQueue({
  moat4, allActions, onStatusChange,
}: {
  moat4: Moat4Recommendations; allActions: Moat4Action[]
  onStatusChange: (recId: string, status: 'completed' | 'dismissed') => void
}) {
  const [activeRole, setActiveRole] = useState('all')

  const filteredActions = useMemo(() => {
    if (activeRole === 'all') return allActions
    return allActions.filter(a => (a.role_visibility ?? []).includes(activeRole))
  }, [allActions, activeRole])

  const tiers = useMemo(() => {
    return {
      critical: filteredActions.filter(a => a.priority_score >= 8),
      high: filteredActions.filter(a => a.priority_score >= 6.5 && a.priority_score < 8),
      growth: filteredActions.filter(a => a.priority_score < 6.5)
    }
  }, [filteredActions])

  const ROLE_HINTS: Record<string, string> = {
    all:             'Complete prioritized backlog of all competitive actions detected by the engine.',
    cxo:             'High-level strategic priorities focused on long-term market dominance.',
    cmo:             'Content ROI focus areas and brand positioning adjustments for competitive lift.',
    seo_manager:     'Technical optimizations and structural fixes ready for the next sprint backlog.',
    content_manager: 'Entity-specific content briefs and structural guidance for high-impact publishing.',
  }

  return (
    <SectionCard
      title="Strategic Action Queue"
      description="The MOAT 4 engine has analyzed your competitive landscape and prioritized these actions based on their potential to flip AI model rankings."
      className="border-zinc-800/50"
    >
      <div className="space-y-8">
        {/* Role Navigation */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {ROLE_CONFIG.map(role => {
              const Icon = role.icon
              const isActive = activeRole === role.id
              return (
                <button
                  key={role.id}
                  onClick={() => setActiveRole(role.id)}
                  className={cn(
                    "group relative flex items-center gap-2.5 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all border",
                    isActive 
                      ? "bg-zinc-800 border-zinc-600 text-white shadow-xl shadow-black/40 scale-[1.02]" 
                      : "bg-transparent border-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/30"
                  )}
                >
                  {isActive && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
                  )}
                  <Icon className={cn("w-4 h-4", isActive ? "text-amber-400" : "text-zinc-600 group-hover:text-zinc-500")} />
                  <span>{role.label}</span>
                </button>
              )
            })}
          </div>
          
          <div className="flex items-start gap-3 bg-zinc-950/40 rounded-2xl p-4 border border-zinc-800/50 shadow-inner">
            <div className="p-1.5 bg-zinc-800 rounded-lg mt-0.5">
              <Info className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed italic font-medium">
              {ROLE_HINTS[activeRole]}
            </p>
          </div>
        </div>

        {/* Tiers Display */}
        <div className="space-y-12">
          {filteredActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-inner">
                <Search className="w-10 h-10 text-zinc-800" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold text-zinc-400">No actions found</p>
                <p className="text-sm text-zinc-600 max-w-xs">
                  Your competitive standing for this role perspective is currently optimal.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* CXO Brief Special View */}
              {activeRole === 'cxo' && moat4.role_output && (
                <div className="space-y-8 animate-in fade-in duration-700">
                  <div className="relative overflow-hidden rounded-[2rem] border border-amber-500/20 bg-amber-500/5 p-8 shadow-2xl">
                    <div className="absolute top-0 right-0 p-6 opacity-5">
                      <Trophy className="w-24 h-24 text-amber-500" />
                    </div>
                    <div className="relative z-10 space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                          <Trophy className="w-5 h-5 text-amber-400" />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-[0.3em] text-amber-500/80">
                          Executive Strategic Summary
                        </span>
                      </div>
                      <h2 className="text-2xl font-bold text-zinc-100 leading-snug tracking-tight">
                        {moat4.role_output.headline}
                      </h2>
                      <p className="text-lg text-zinc-300 leading-relaxed font-medium">
                        {moat4.role_output.summary}
                      </p>
                      {moat4.role_output.top_risk && (
                        <div className="pt-6 border-t border-zinc-800/40">
                          <div className="flex items-center gap-2 mb-3">
                            <ShieldAlert className="w-4 h-4 text-rose-400" />
                            <span className="text-[10px] text-rose-400/80 uppercase tracking-[0.2em] font-bold">Strategic Risk Factor</span>
                          </div>
                          <p className="text-sm text-zinc-400 leading-relaxed italic border-l-2 border-rose-500/30 pl-4 py-1">
                            {moat4.role_output.top_risk}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 ml-1">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Top Strategic Actions</span>
                    </div>
                    <div className="space-y-4">
                      {tiers.critical.concat(tiers.high).slice(0, 3).map((a, i) => (
                        <ActionCard key={a.rec_id} action={a} index={i} onStatusChange={onStatusChange} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Standard Tiers View */}
              {activeRole !== 'cxo' && (
                <div className="space-y-12">
                  <TierGroup 
                    label="Critical Fixes" 
                    icon={Flame} 
                    accent="rose" 
                    actions={tiers.critical} 
                    onStatusChange={onStatusChange}
                    offset={0}
                  />
                  <TierGroup 
                    label="High Priority" 
                    icon={Zap} 
                    accent="amber" 
                    actions={tiers.high} 
                    onStatusChange={onStatusChange}
                    offset={tiers.critical.length}
                  />
                  <TierGroup 
                    label="Growth Tasks" 
                    icon={Target} 
                    accent="blue" 
                    actions={tiers.growth} 
                    onStatusChange={onStatusChange}
                    offset={tiers.critical.length + tiers.high.length}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </SectionCard>
  )
}

function TierGroup({
  label, icon: Icon, accent, actions, offset, onStatusChange,
}: {
  label: string; icon: any; accent: 'rose' | 'amber' | 'blue' | 'zinc'
  actions: Moat4Action[]; offset: number
  onStatusChange: (recId: string, status: 'completed' | 'dismissed') => void
}) {
  const accentCls = 
    accent === 'rose' ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' :
    accent === 'amber' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
    accent === 'blue' ? 'text-blue-400 border-blue-500/30 bg-blue-500/10' :
    'text-zinc-500 border-zinc-700 bg-zinc-800/30'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className={cn("flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-[0.2em] shadow-lg", accentCls)}>
          <Icon className="w-4 h-4" />
          {label}
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-zinc-800/60 via-zinc-800/20 to-transparent" />
        <Badge variant="secondary" className="bg-zinc-900 border border-zinc-800 text-zinc-500 text-[10px] font-bold px-2 py-0.5">
          {actions.length} ACTIONS
        </Badge>
      </div>
      
      {actions.length === 0 ? (
        <div className="flex items-center gap-4 py-6 px-6 rounded-[1.5rem] border border-dashed border-zinc-800 bg-zinc-900/10 transition-all hover:bg-zinc-900/20">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCheck className="w-5 h-5 text-emerald-500/60" />
          </div>
          <p className="text-sm text-zinc-500 font-medium italic">
            No pending actions in this tier. Your competitive stance is stable.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {actions.map((a, i) => (
            <ActionCard key={a.rec_id} action={a} index={offset + i} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Restored Sections
// ─────────────────────────────────────────────────────────────────────────────

function LeaderboardDelta({ comparison }: { comparison: ModuleFCompareVisibilityAgainstCompetitors | null }) {
  if (!comparison) return null
  const all = [comparison.brand, ...(comparison.competitors ?? [])].filter(Boolean) as ModuleFCompareVisibilityEntityRow[]
  if (!all.some(e => (e.score_delta != null && e.score_delta !== 0) || e.rank_move)) return null
  
  return (
    <SectionCard
      title="Leaderboard Momentum"
      description="Score and rank shifts compared to your last analysis run."
      className="border-zinc-800/50"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_100px_100px_100px] gap-4 px-6 py-3 bg-zinc-900/60 rounded-xl border border-zinc-800/60 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
          <div>Entity Name</div>
          <div className="text-right">AIVS™</div>
          <div className="text-right">Δ Score</div>
          <div className="text-right">Rank</div>
        </div>
        
        <div className="space-y-2">
          {all.map((e, i) => {
            const delta = e.score_delta ?? 0
            const move  = e.rank_move  ?? 0
            const isBrand = i === 0
            return (
              <div key={e.name} className={cn(
                'group relative overflow-hidden grid grid-cols-[1fr_100px_100px_100px] gap-4 items-center px-6 py-4 rounded-2xl border transition-all duration-300',
                isBrand 
                  ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40' 
                  : 'bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/60'
              )}>
                <div className="flex items-center gap-4 min-w-0">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border transition-transform group-hover:scale-110',
                    isBrand ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                  )}>
                    {e.rank_position ?? i + 1}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm truncate font-bold', isBrand ? 'text-white' : 'text-zinc-200')}>
                        {e.name}
                      </span>
                      {isBrand && (
                        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] font-bold py-0 h-4 px-1.5">
                          BRAND
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <span className="text-sm font-mono font-bold text-zinc-100">
                    {e.benchmark_score?.toFixed(1) ?? '—'}
                  </span>
                </div>

                <div className={cn(
                  'text-sm font-mono font-bold text-right flex items-center justify-end gap-1',
                  delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-zinc-600'
                )}>
                  {delta !== 0 && (delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                  {delta !== 0 ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : '—'}
                </div>

                <div className={cn(
                  'text-sm text-right font-bold tabular-nums',
                  move > 0 ? 'text-emerald-400' : move < 0 ? 'text-rose-400' : 'text-zinc-700'
                )}>
                  {move !== 0 ? (
                    <span className="flex items-center justify-end gap-1">
                      {move > 0 ? '↑' : '↓'} {Math.abs(move)}
                    </span>
                  ) : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </SectionCard>
  )
}

function SourcesPanel({ sourceAnalysis }: { sourceAnalysis?: ModuleFSourceAnalysis | null }) {
  const [exp, setExp] = useState(false)
  const sources = sourceAnalysis?.competitor_source_analysis ?? []
  
  if (!sources.length) return null

  const shown = sources.slice(0, exp ? 20 : 3)
  
  return (
    <SectionCard
      title="Competitive Citation Analysis"
      description="Domains cited by AI models for your competitors. Gaining citations here boosts your authority."
      className="border-zinc-800/50"
    >
      <div className="space-y-6">
        <div className="divide-y divide-zinc-800/40">
          {shown.map((src, i) => (
            <div key={i} className="group py-6 first:pt-0 last:pb-0 transition-all duration-300 hover:bg-zinc-800/5 rounded-2xl px-4 -mx-4">
              <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* Competitor Identity */}
                <div className="w-full lg:w-[260px] space-y-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse" />
                    <span className="text-base font-bold text-zinc-100 group-hover:text-blue-400 transition-colors tracking-tight">
                      {src.competitor}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-zinc-900/60 border-zinc-800 text-zinc-500 text-[10px] font-bold px-2 py-0.5 tracking-wider">
                      {src.citation_count} CITES
                    </Badge>
                    <Badge variant="secondary" className="bg-zinc-900/60 border-zinc-800 text-zinc-500 text-[10px] font-bold px-2 py-0.5 tracking-wider">
                      {src.unique_domains ?? 0} DOMAINS
                    </Badge>
                  </div>
                </div>

                {/* Quality Metrics Grid */}
                <div className="w-full lg:w-auto grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
                  {[
                    { l: 'Influence', v: src.source_domain_influence_score, c: 'amber', i: Zap },
                    { l: 'Avg DA',    v: src.average_domain_authority,     c: 'cyan',  i: Globe },
                    { l: 'Trust',     v: src.credibility_score,            c: 'violet', i: ShieldCheck },
                  ].map(m => (
                    <div key={m.l} className={cn(
                      'relative overflow-hidden flex flex-col gap-1.5 p-3 rounded-xl border min-w-[120px] transition-all group/metric hover:shadow-lg',
                      m.c === 'amber' ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40' :
                      m.c === 'cyan'  ? 'bg-cyan-500/5 border-cyan-500/20 hover:border-cyan-500/40' :
                      'bg-violet-500/5 border-violet-500/20 hover:border-violet-500/40'
                    )}>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          'text-[9px] font-bold uppercase tracking-widest opacity-60',
                          m.c === 'amber' ? 'text-amber-500' : m.c === 'cyan' ? 'text-cyan-500' : 'text-violet-500'
                        )}>{m.l}</span>
                        <m.i className={cn(
                          'w-3 h-3 transition-transform group-hover/metric:scale-110',
                          m.c === 'amber' ? 'text-amber-500' : m.c === 'cyan' ? 'text-cyan-500' : 'text-violet-500'
                        )} />
                      </div>
                      <div className="flex items-end gap-2">
                        <span className="text-xl font-bold text-zinc-100 tabular-nums">
                          {m.v?.toFixed(0) ?? '0'}
                        </span>
                        <div className="flex-1 h-1 bg-zinc-800/50 rounded-full mb-1.5 overflow-hidden">
                          <div 
                            className={cn(
                              'h-full rounded-full transition-all duration-1000',
                              m.c === 'amber' ? 'bg-amber-500' : m.c === 'cyan' ? 'bg-cyan-500' : 'bg-violet-500'
                            )}
                            style={{ width: `${m.v ?? 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Top Citation Domains - Pills */}
                <div className="flex-1 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(src.citation_frequency ?? []).slice(0, 10).map((cf, j) => (
                      <TooltipProvider key={j}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="group/domain flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all cursor-default shadow-sm hover:shadow-md">
                              <Globe className="w-3.5 h-3.5 text-zinc-600 group-hover/domain:text-blue-400 transition-colors" />
                              <span className="text-[11px] text-zinc-300 font-mono tracking-tight group-hover:text-zinc-100 transition-colors">{cf.domain}</span>
                              <div className="h-4 w-[1px] bg-zinc-800 mx-1" />
                              <span className="text-[10px] text-zinc-600 font-bold tracking-tighter group-hover:text-blue-400 transition-colors">×{cf.count}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                            <p className="text-xs">Cited {cf.count} times for <span className="text-blue-400 font-bold">{src.competitor}</span></p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>

                  {(() => {
                    const typeCounts = (src.top_citations ?? []).reduce<Record<string, number>>((acc, tc) => {
                      const ct = (tc.content_type ?? 'page').toLowerCase()
                      if (ct !== 'page') acc[ct] = (acc[ct] ?? 0) + 1
                      return acc
                    }, {})
                    const entries = Object.entries(typeCounts)
                    if (!entries.length) return null
                    
                    return (
                      <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/40">
                        <span className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold">Content Mix:</span>
                        <div className="flex flex-wrap gap-2">
                          {entries.slice(0, 5).map(([ct, count]) => (
                            <Badge key={ct} variant="outline" className={cn(
                              'text-[10px] font-bold capitalize px-2.5 py-0.5 border-zinc-800/60 shadow-sm transition-all hover:scale-105',
                              CT_COLOR[ct] ?? CT_COLOR.page
                            )}>
                              {ct} <span className="ml-1.5 opacity-60 font-mono">{count}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {sources.length > 3 && (
          <button
            onClick={() => setExp(!exp)}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800 hover:border-zinc-700 text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-all group shadow-inner"
          >
            {exp ? <ChevronUp className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" /> : <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />}
            {exp ? 'Collapse Deep Analysis' : `View Comprehensive Citation Profiles (${sources.length})`}
          </button>
        )}
      </div>
    </SectionCard>
  )
}

function MetricAccordion({ metricRecs }: { metricRecs: ModuleFRecommendations }) {
  const [open, setOpen] = useState<string | null>(null)

  const recs = Object.entries(metricRecs)
    .map(([key, value]) => ({ key, rec: normaliseMetricRec(value) }))
    .filter(item => item.rec && (item.rec.why || item.rec.fix))

  if (!recs.length) return null

  return (
    <SectionCard
      title="Metric-Level Analysis"
      description="Detailed explanations for key metric scores and how to improve them."
      className="border-zinc-800/50"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recs.map(({ key, rec }) => {
          const meta = METRIC_META[key]
          const isOpen = open === key
          if (!rec || !meta) return null

          return (
            <div key={key} className={cn(
              'group relative overflow-hidden flex flex-col rounded-2xl border transition-all duration-300',
              isOpen ? 'bg-zinc-800/40 border-zinc-600 shadow-xl' : 'bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/60'
            )}>
              <button 
                onClick={() => setOpen(isOpen ? null : key)}
                className="w-full flex items-center justify-between p-5 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'w-10 h-10 rounded-xl border flex items-center justify-center transition-all group-hover:scale-110',
                    isOpen ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  )}>
                    {meta.icon}
                  </div>
                  <span className={cn('text-sm font-bold tracking-tight', isOpen ? 'text-white' : 'text-zinc-200 group-hover:text-white')}>
                    {meta.label}
                  </span>
                </div>
                <div className={cn(
                  'p-1.5 rounded-lg bg-zinc-800/50 text-zinc-500 transition-all',
                  isOpen && 'bg-amber-500/10 text-amber-400 rotate-180'
                )}>
                  <ChevronDown className="w-4 h-4" />
                </div>
              </button>
              
              {isOpen && (
                <div className="px-5 pb-5 space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <div className="h-px bg-zinc-800/50 w-full" />
                  {rec.why && (
                    <div className="relative overflow-hidden flex items-start gap-4 text-sm text-zinc-400 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/50 shadow-inner">
                      <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20 shrink-0 mt-0.5">
                        <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">Root Cause Analysis</span>
                        <p className="leading-relaxed text-zinc-300 font-medium">{rec.why}</p>
                      </div>
                    </div>
                  )}
                  {rec.fix && (
                    <div className="relative overflow-hidden flex items-start gap-4 text-sm text-zinc-400 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/50 shadow-inner">
                      <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 shrink-0 mt-0.5">
                        <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">Optimization Strategy</span>
                        <p className="leading-relaxed text-zinc-300 font-medium">{rec.fix}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function CompetitorRecommendations({
  moduleFData,
  isLoading,
  jobId
}: CompetitorRecommendationsProps) {
  const moat4 = resolveMoat4Recommendations(moduleFData)
  const alerts = resolveAlerts(moduleFData)
  const gaps = resolveGapAnalysis(moduleFData)
  
  // Local state for action status tracking
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set())
  const [dismissedActions, setDismissedActions] = useState<Set<string>>(new Set())

  const handleStatusChange = (recId: string, status: 'completed' | 'dismissed') => {
    if (status === 'completed') {
      setCompletedActions(prev => new Set(prev).add(recId))
    } else {
      setDismissedActions(prev => new Set(prev).add(recId))
    }
  }

  // Memoize action stats
  const stats = useMemo(() => {
    if (!moat4) return { p1: 0, p2: 0, p3: 0, done: 0, total: 0 }
    const actions = moat4.all_actions ?? []
    return {
      p1: actions.filter(a => a.priority_score >= 8).length,
      p2: actions.filter(a => a.priority_score >= 6.5 && a.priority_score < 8).length,
      p3: actions.filter(a => a.priority_score < 6.5).length,
      done: completedActions.size,
      total: actions.length
    }
  }, [moat4, completedActions])

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-64 rounded-[2rem] bg-zinc-900/50" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-2xl bg-zinc-900/50" />)}
        </div>
        <div className="h-96 rounded-[2rem] bg-zinc-900/50" />
      </div>
    )
  }

  if (!moat4) {
    return <AnalysisEmptyState 
      title="No Recommendations Yet" 
      description="Run a competitive analysis to generate MOAT 4 strategic recommendations." 
      icon={<Rocket className="w-16 h-16 text-zinc-700" />}
    />
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header & Alerts */}
      <div className="space-y-6">
        <EngineHeader deltaClass={moat4.delta_class as DeltaClass} summary={moat4.generated_at} />
        <AlertBanner alerts={alerts} />
      </div>

      {/* High-Level Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Critical Fixes"
          value={stats.p1}
          subtext="Score ≥ 8.0"
          icon={Flame}
          accent="rose"
          description="Immediate actions required to counter competitor surges or fix score drops."
        />
        <StatCard
          label="Priority Sprint"
          value={stats.p2}
          subtext="Score 6.5 – 8.0"
          icon={Zap}
          accent="amber"
          description="High-impact tasks prioritized for the next execution cycle."
        />
        <StatCard
          label="Growth Queue"
          value={stats.p3}
          subtext="Score < 6.5"
          icon={Target}
          accent="blue"
          description="Ongoing optimizations to expand your market share and SOV."
        />
        <StatCard
          label="Execution Rate"
          value={stats.done}
          subtext={`${stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}% Complete`}
          icon={CheckCheck}
          accent="emerald"
          progress={stats.total > 0 ? (stats.done / stats.total) * 100 : 0}
          description="Overall progress on strategic recommendations for this run."
        />
      </div>

      {/* Main Action Queue */}
      <ActionQueue 
        moat4={moat4} 
        allActions={moat4.all_actions ?? []} 
        onStatusChange={handleStatusChange} 
      />

      {/* Deep Dive Analysis Section */}
      <div className="space-y-8 pt-8 border-t border-zinc-800/50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-zinc-200 tracking-tight">Deep Dive Analysis</h2>
          <p className="text-zinc-500 max-w-2xl mx-auto">Explore detailed metrics and competitive intelligence data that power the recommendations.</p>
        </div>
        <LeaderboardDelta comparison={moduleFData?.compare_visibility_against_competitors ?? null} />
        <SourcesPanel sourceAnalysis={moduleFData?.source_analysis} />
        <MetricAccordion metricRecs={resolveRecommendations(moduleFData)} />
      </div>
    </div>
  )
}

export default CompetitorRecommendations
