'use client'

import Image from 'next/image'
import {
  BarChart3,
  Sparkles,
  Search,
  Gauge,
  Activity,
  LayoutDashboard,
  Bell,
  Swords,
  TrendingUp,
  PieChart,
  Trophy,
  AlertTriangle,
  CalendarDays,
  Settings2,
  FileText,
  Database,
  Link,
  Download,
  Star,
  GitBranch,
  MessageSquare,
  Zap,
  Layers,
  Compass,
  Network,
  Table2,
  FilePen,
  Plus,
  Target,
  Tags,
  BookOpen,
  Eye,
  Link2,
  Crosshair,
  LineChart,
  Calendar,
  FileCheck,
  Users,
  Code2,
  Plug,
  DollarSign,
  Map,
  MousePointer,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SessionSidebarProps {
  activeSection?: string
  onSectionChange?: (section: string) => void
  isOpen?: boolean
  onClose?: () => void
}

type Child = { id: string; label: string; icon: LucideIcon }
type Section = { id: string; label: string; icon: LucideIcon; children: Child[] }

export const sessionSections: Section[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    children: [],
  },
  {
    id: 'overview',
    label: 'Overview',
    icon: BarChart3,
    children: [
      { id: 'executive-snapshot', label: 'Executive Snapshot', icon: PieChart },
      { id: 'wins-losses', label: 'Wins & Losses', icon: Trophy },
      { id: 'priority-alerts', label: 'Priority Alerts', icon: AlertTriangle },
      { id: 'last-days', label: 'Last 7/30 days', icon: CalendarDays },
    ],
  },
  {
    id: 'audit-center',
    label: 'Audit Center',
    icon: Gauge,
    children: [
      { id: 'technical-audit', label: 'Technical Audit', icon: Settings2 },
      { id: 'content-audit', label: 'Content Audit', icon: FileText },
      { id: 'structured-data', label: 'Structured Data & AI Files', icon: Database },
      { id: 'url-explorer', label: 'URL Explorer', icon: Link },
      { id: 'exports', label: 'Exports', icon: Download },
    ],
  },
  {
    id: 'ai-visibility',
    label: 'AI Visibility',
    icon: Activity,
    children: [
      { id: 'ai-visibility-scorecards', label: 'Scorecards', icon: Star },
      { id: 'entity-and-gap-analysis', label: 'Entity & Gap Analysis', icon: GitBranch },
      { id: 'answer-completeness', label: 'AI Answer Preview', icon: MessageSquare },
      { id: 'improvement-actions', label: 'Improvement Actions', icon: Zap },
      { id: 'model-comparison', label: 'Model Comparison', icon: Layers },
    ],
  },
  {
    id: 'prompt-intelligence',
    label: 'Prompt Intelligence',
    icon: Sparkles,
    children: [
      { id: 'discover-prompts', label: 'Discover Prompts', icon: Compass },
      { id: 'topic-clusters', label: 'Clusters & Intent', icon: Network },
      { id: 'content-matrix', label: 'Difficulty & Opportunity', icon: Table2 },
      { id: 'content-brief-builder', label: 'Content Brief Builder', icon: FilePen },
      { id: 'add-to-Tracking', label: 'Add to Tracking', icon: Plus },
    ],
  },
  {
    id: 'prompt-tracking',
    label: 'Prompt Tracking',
    icon: Search,
    children: [
      { id: 'keyword-intelligence', label: 'Tracked Prompts', icon: Target },
      { id: 'prompt-difficulty', label: 'Brand & Competitor Mentions', icon: Tags },
      { id: 'prompt-opportunities', label: 'Citations Tracker', icon: BookOpen },
      { id: 'share-of-voice', label: 'Share of Voice', icon: PieChart },
      { id: 'trends-by-model', label: 'Trends by Model', icon: TrendingUp },
    ],
  },
  {
    id: 'competitors',
    label: 'Competitors',
    icon: Swords,
    children: [
      { id: 'visibility-comparision', label: 'Visibility Comparison', icon: Eye },
      { id: 'competitor-wins-library', label: 'Competitor Wins Library', icon: Trophy },
      { id: 'competitor-cited-urls', label: 'Competitor Cited URLs', icon: Link2 },
      { id: 'gap-opportunities', label: 'Gap Opportunities', icon: Crosshair },
      { id: 'growth-trends', label: 'Growth Trends', icon: LineChart },
    ],
  },
  {
    id: 'reports-and-alerts',
    label: 'Reports & Alerts',
    icon: Bell,
    children: [
      { id: 'weekly-summary', label: 'Weekly Summary', icon: Calendar },
      { id: 'audit-reports', label: 'Audit Reports', icon: FileCheck },
      { id: 'competitor-reports', label: 'Competitor Reports', icon: Users },
      { id: 'alerts-center', label: 'Alert Center', icon: Bell },
      { id: 'export-api', label: 'Export / API', icon: Code2 },
    ],
  },
  {
    id: 'impact-analytics',
    label: 'Impact Analytics',
    icon: TrendingUp,
    children: [
      { id: 'impact-overview', label: 'GA4 Connection', icon: Plug },
      { id: 'content-roi', label: 'LLM Traffic', icon: DollarSign },
      { id: 'attribution-soon', label: 'Top Landing Pages', icon: Map },
      { id: 'events-and-Conversions', label: 'Events & Conversions', icon: MousePointer },
      { id: 'visibility-traffic-correlation', label: 'Visibility ↔ Traffic Correlation', icon: ArrowLeftRight },
    ],
  },
]

export function SessionSidebar({
  activeSection = 'dashboard',
  onSectionChange,
  isOpen = true,
  onClose,
}: SessionSidebarProps) {
  const dashboard = sessionSections[0]
  const sectionsWithChildren = sessionSections.filter((s) => s.children.length > 0)

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm md:hidden z-40 cursor-pointer"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-68 bg-[#09090B] transition-transform duration-300 z-50 flex flex-col',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="px-5 flex items-center h-18">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center">
              <div className="w-5 h-5 relative">
                <Image
                  src="/images/attrock_logo.png"
                  alt="Attrock"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">Clarian</span>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-zinc-800" />

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto scrollbar-hide py-3">

          {/* Dashboard – standalone clickable item */}
          <div className="px-3">
            <button
              onClick={() => { onSectionChange?.(dashboard.id); onClose?.() }}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 rounded-sm text-[13px] font-medium transition-colors duration-150 cursor-pointer',
                activeSection === dashboard.id
                  ? 'bg-zinc-800 text-white'
                  : 'text-white hover:bg-zinc-800/40'
              )}
            >
              <dashboard.icon className="w-4 h-4 shrink-0 text-white" />
              <span>{dashboard.label}</span>
            </button>
          </div>

          {/* Sections with children */}
          {sectionsWithChildren.map((section) => (
            <div key={section.id}>
              {/* Dotted separator before each group */}
              <div className="mx-5 my-1.5 border-t border-dashed border-zinc-800" />

              {/* Group label – not clickable, white with icon */}
              <div className="flex items-center gap-2 px-8 py-1">
                <section.icon className="w-3.5 h-3.5 shrink-0 text-white" />
                <span className="text-[12px] font-semibold text-white uppercase tracking-wider">
                  {section.label}
                </span>
              </div>

              {/* Sub-items – indented */}
              <div className="pl-9 pr-3 space-y-0">
                {section.children.map((child) => {
                  const isActive = activeSection === child.id
                  const ChildIcon = child.icon
                  return (
                    <button
                      key={child.id}
                      onClick={() => { onSectionChange?.(child.id); onClose?.() }}
                      className={cn(
                        'flex items-center gap-2.5 w-full px-3 py-1.5 rounded-sm text-[12.5px] transition-colors duration-150 cursor-pointer text-left',
                        isActive
                          ? 'bg-zinc-800 text-white font-medium'
                          : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/40'
                      )}
                    >
                      <ChildIcon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-zinc-300' : 'text-zinc-600')} />
                      <span className="truncate">{child.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
