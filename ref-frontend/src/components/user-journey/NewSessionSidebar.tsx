'use client'

import { useEffect, useRef } from 'react'
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
  PanelLeft,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const sectionColors: Record<string, string> = {
  overview: 'text-amber-400',
  'audit-center': 'text-rose-400',
  'ai-visibility': 'text-violet-400',
  'prompt-intelligence': 'text-blue-400',
  'prompt-tracking': 'text-cyan-400',
  competitors: 'text-orange-400',
  'reports-and-alerts': 'text-yellow-400',
  'impact-analytics': 'text-emerald-400',
}

interface SessionSidebarProps {
  activeSection?: string
  onSectionChange?: (section: string) => void
  isOpen?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
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
      { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
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
  collapsed = false,
  onToggleCollapse,
}: SessionSidebarProps) {
  const dashboard = sessionSections[0]
  const sectionsWithChildren = sessionSections.filter((s) => s.children.length > 0)

  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!navRef.current || !activeSection || collapsed) return

    if (activeSection === 'dashboard') {
      const el = navRef.current.querySelector<HTMLElement>('[data-section-id="dashboard"]')
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }

    const parentSection = sessionSections.find((s) =>
      s.children.some((c) => c.id === activeSection)
    )
    if (parentSection) {
      const sectionEl = navRef.current.querySelector<HTMLElement>(
        `[data-parent-section-id="${parentSection.id}"]`
      )
      sectionEl?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }, [activeSection, collapsed])

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
          'fixed left-0 top-0 h-screen bg-[#09090B] transition-all duration-300 ease-in-out z-50 flex flex-col overflow-hidden',
          collapsed ? 'w-14' : 'w-68',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="px-5 flex items-center h-18">
          <span className="text-xl font-bold tracking-tight text-white">Contentlytics</span>
        </div>

        {/* Divider */}
        <div className="mx-3 h-px bg-zinc-800 shrink-0" />

        {/* Navigation */}
        <div ref={navRef} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-3">

          {/* Dashboard – standalone clickable item */}
          <div className={cn('transition-all duration-300', collapsed ? 'px-2' : 'px-3')}>
            <div className="relative group/dash">
              <button
                data-section-id={dashboard.id}
                onClick={() => { onSectionChange?.(dashboard.id); onClose?.() }}
                className={cn(
                  'flex items-center w-full rounded-sm text-[13px] font-medium transition-all duration-200 cursor-pointer',
                  collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2',
                  activeSection === dashboard.id
                    ? 'bg-indigo-500/10 text-indigo-200'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                )}
              >
                <dashboard.icon
                  className={cn(
                    'shrink-0 transition-all duration-200',
                    collapsed ? 'w-5 h-5' : 'w-4 h-4',
                    activeSection === dashboard.id ? 'text-indigo-400' : 'text-zinc-500'
                  )}
                />
                <span
                  className={cn(
                    'whitespace-nowrap overflow-hidden transition-all duration-300',
                    collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-xs'
                  )}
                >
                  {dashboard.label}
                </span>
              </button>

              {/* Hover tooltip in collapsed mode */}
              {collapsed && (
                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50">
                  <div className="opacity-0 group-hover/dash:opacity-100 transition-opacity duration-150 flex items-center">
                    <div className="w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-zinc-700" />
                    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 whitespace-nowrap shadow-xl">
                      {dashboard.label}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sections with children */}
          {sectionsWithChildren.map((section) => (
            <div key={section.id} data-parent-section-id={section.id}>
              {/* Dotted separator */}
              <div className={cn('my-1.5 border-t border-dashed border-zinc-800 transition-all duration-300', collapsed ? 'mx-2' : 'mx-5')} />

              {/* Group label — hidden when collapsed */}
              <div
                className={cn(
                  'flex items-center gap-2 py-1 overflow-hidden transition-all duration-300',
                  collapsed ? 'opacity-0 max-h-0 py-0' : 'opacity-100 max-h-10 px-8'
                )}
              >
                <section.icon className={cn('w-3.5 h-3.5 shrink-0', sectionColors[section.id] || 'text-zinc-400')} />
                <span className="text-[12px] font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap">
                  {section.label}
                </span>
              </div>

              {/* Sub-items */}
              <div className={cn('space-y-0 transition-all duration-300', collapsed ? 'px-2' : 'pl-9 pr-3')}>
                {section.children.map((child) => {
                  const isActive = activeSection === child.id
                  const ChildIcon = child.icon
                  return (
                    <div key={child.id} className="relative group/child">
                      <button
                        data-section-id={child.id}
                        onClick={() => { onSectionChange?.(child.id); onClose?.() }}
                        className={cn(
                          'flex items-center w-full rounded-sm text-[12.5px] transition-all duration-200 cursor-pointer text-left',
                          collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-1.5',
                          isActive
                            ? 'bg-indigo-500/10 text-white font-medium'
                            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/40'
                        )}
                      >
                        <ChildIcon
                          className={cn(
                            'shrink-0 transition-all duration-200',
                            collapsed ? 'w-5 h-5' : 'w-3.5 h-3.5',
                            isActive ? 'text-indigo-400' : 'text-zinc-600'
                          )}
                        />
                        <span
                          className={cn(
                            'truncate overflow-hidden transition-all duration-300',
                            collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-xs'
                          )}
                        >
                          {child.label}
                        </span>
                      </button>

                      {/* Hover tooltip in collapsed mode */}
                      {collapsed && (
                        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50">
                          <div className="opacity-0 group-hover/child:opacity-100 transition-opacity duration-150 flex items-center">
                            <div className="w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-zinc-700" />
                            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 whitespace-nowrap shadow-xl">
                              {child.label}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
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
