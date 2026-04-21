'use client'

import Link from 'next/link'
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
  Link as LinkIcon,
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
  Map,
  MousePointer,
  ArrowLeftRight,
  PanelLeftClose,
  PanelLeftOpen,
  Lightbulb,
  Brain,
  Sparkles as SparklesIcon,
  Glasses,
  type LucideIcon,
} from 'lucide-react'
import { useGetGA4StatusQuery } from '@/store/api/ga4Api'

const sectionColors: Record<string, string> = {
  overview: 'text-amber-400',
  'audit-center': 'text-rose-400',
  'ai-visibility': 'text-violet-400',
  'brand-perception': 'text-violet-400',
  'prompt-intelligence': 'text-blue-400',
  'prompt-tracking': 'text-cyan-400',
  competitors: 'text-orange-400',
  'reports-and-alerts': 'text-yellow-400',
  'impact-analytics': 'text-emerald-400',
  'geo-content': 'text-indigo-400',
}

interface SessionSidebarProps {
  activeSection?: string
  onSectionChange?: (section: string) => void
  isOpen?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  alertCount?: number
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
      { id: 'serp-analyzer', label: 'SERP Analyzer', icon: Search },
      { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
      { id: 'structured-data', label: 'Structured Data & AI Files', icon: Database },
      { id: 'url-explorer', label: 'URL Explorer', icon: LinkIcon },
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
      { id: 'ai-visibility-report', label: 'AI Visibility Report', icon: Brain },
    ],
  },
  {
    id: 'brand-perception',
    label: 'Brand Perception',
    icon: Glasses,
    children: [
      { id: 'perception-analysis', label: 'Perception Analysis', icon: Activity },
      { id: 'perception-sources', label: 'Perception Sources', icon: Network },
      { id: 'sources-overview', label: 'Sources Overview', icon: LayoutDashboard },
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
      { id: 'prompt-recommendations', label: 'Recommendations', icon: Lightbulb },
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
      { id: 'competitor-recommendations', label: 'Competitor Recommendations', icon: Lightbulb },
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
      { id: 'ga4-traffic', label: 'GA4 Traffic Analysis', icon: BarChart3 },
      { id: 'content-roi', label: 'LLM Traffic', icon: Brain },
      { id: 'top-landing-pages', label: 'Top Landing Pages', icon: Map },
      { id: 'events-and-Conversions', label: 'Events & Conversions', icon: MousePointer },
      { id: 'visibility-traffic-correlation', label: 'Visibility ↔ Traffic Correlation', icon: ArrowLeftRight },
    ],
  },
  {
    id: 'geo-content',
    label: 'GEO Content',
    icon: SparklesIcon,
    children: [
      { id: 'geo-content-list', label: 'My Articles', icon: FileText },
      { id: 'geo-content-create', label: 'Create Article', icon: FilePen },
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
  alertCount = 0,
}: SessionSidebarProps) {
  const dashboard = sessionSections[0]
  const sectionsWithChildren = sessionSections.filter((s) => s.children.length > 0)
  const { data: ga4Status } = useGetGA4StatusQuery()
  const ga4Connected = ga4Status?.connected === true

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm md:hidden z-40 cursor-pointer"
          onClick={onClose}
        />
      )}

      <aside
        className={`${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
          transition: 'width 300ms ease, transform 300ms ease',
          width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
          minHeight: '100vh',
          background: 'var(--nd-sidebar-bg)',
          borderRight: '1px solid var(--nd-border)',
        }}
      >
        {/* ── Logo area ── */}
        <div
          className="flex items-center shrink-0"
          style={{
            height: 60,
            padding: collapsed ? '0' : '0 16px 0 20px',
            borderBottom: '1px solid var(--nd-border)',
            justifyContent: 'center',
          }}
        >
          {collapsed ? (
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex items-center justify-center cursor-pointer"
              style={{
                width: 36,
                height: 36,
                border: '1px solid var(--nd-border)',
                borderRadius: 8,
                background: 'transparent',
                color: 'var(--nd-text-muted)',
                transition: 'background 150ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--nd-nav-hover-bg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              title="Expand sidebar"
            >
              <PanelLeftOpen size={18} strokeWidth={1.75} />
            </button>
          ) : (
            <div className="flex items-center justify-between w-full">
              <Link href="/dashboard" className="flex items-center gap-2 no-underline">
                <div
                  className="shrink-0 flex items-center justify-center text-white font-bold"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: '#5347CE',
                    fontSize: 13,
                  }}
                >
                  C
                </div>
                <span
                  style={{
                    fontSize: 'var(--font-md)',
                    fontWeight: 700,
                    color: 'var(--nd-text-primary)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  Contentlytics
                </span>
              </Link>
              <button
                onClick={onToggleCollapse}
                className="hidden md:flex items-center justify-center cursor-pointer"
                style={{
                  width: 28,
                  height: 28,
                  border: '1px solid var(--nd-border)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--nd-text-muted)',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--nd-nav-hover-bg)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        <div
          className="nd-sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden"
          style={{ padding: collapsed ? '12px 8px 8px' : '20px 12px 8px' }}
        >
          {/* Dashboard — standalone item */}
          <div>
            <button
              data-section-id={dashboard.id}
              onClick={() => { onSectionChange?.(dashboard.id); onClose?.() }}
              className="nd-nav-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 36,
                width: collapsed ? 40 : '100%',
                padding: collapsed ? '0' : '0 10px',
                borderRadius: 8,
                gap: collapsed ? 0 : 10,
                cursor: 'pointer',
                marginBottom: 2,
                marginLeft: collapsed ? 'auto' : undefined,
                marginRight: collapsed ? 'auto' : undefined,
                transition: 'background 150ms ease, color 150ms ease',
                background: activeSection === dashboard.id ? 'var(--nd-nav-active-bg)' : 'transparent',
                color: activeSection === dashboard.id ? 'var(--nd-nav-active-text)' : 'var(--nd-nav-inactive)',
                fontSize: 'var(--font-base)',
                fontWeight: activeSection === dashboard.id ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
                justifyContent: collapsed ? 'center' : 'flex-start',
                border: 'none',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (activeSection !== dashboard.id) {
                  e.currentTarget.style.background = 'var(--nd-nav-hover-bg)'
                  e.currentTarget.style.color = 'var(--nd-text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (activeSection !== dashboard.id) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--nd-nav-inactive)'
                }
              }}
            >
              <dashboard.icon
                className="shrink-0"
                style={{
                  width: 18,
                  height: 18,
                  color: activeSection === dashboard.id ? 'var(--nd-nav-active-text)' : 'currentColor',
                }}
                strokeWidth={activeSection === dashboard.id ? 2 : 1.75}
              />
              {!collapsed && (
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {dashboard.label}
                </span>
              )}
            </button>
          </div>

          {/* Sections with children */}
          {sectionsWithChildren.map((section, sectionIdx) => (
            <div key={section.id} data-parent-section-id={section.id}>
              {/* Section separator + label */}
              {!collapsed && (
                <>
                  {sectionIdx > 0 && (
                    <div
                      style={{
                        height: 1,
                        background: 'var(--nd-border)',
                        margin: '16px 8px 0',
                      }}
                    />
                  )}
                  <p
                    style={{
                      fontSize: 'var(--font-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase' as const,
                      color: 'var(--nd-text-muted)',
                      padding: '0 8px',
                      marginBottom: 4,
                      marginTop: sectionIdx === 0 ? 8 : 12,
                      lineHeight: 'var(--lh-normal)',
                    }}
                  >
                    {section.label}
                  </p>
                </>
              )}
              {collapsed && sectionIdx > 0 && (
                <div
                  style={{
                    height: 1,
                    background: 'var(--nd-border)',
                    margin: '8px 4px',
                  }}
                />
              )}

              {/* Child items */}
              <div>
                {section.children.map((child) => {
                  const isActive = activeSection === child.id
                  const ChildIcon = child.icon
                  return (
                    <button
                      key={child.id}
                      data-section-id={child.id}
                      onClick={() => { onSectionChange?.(child.id); onClose?.() }}
                      className="nd-nav-item"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        height: 36,
                        width: collapsed ? 40 : '100%',
                        padding: collapsed ? '0' : '0 10px',
                        borderRadius: 8,
                        gap: collapsed ? 0 : 10,
                        cursor: 'pointer',
                        marginBottom: 2,
                        marginLeft: collapsed ? 'auto' : undefined,
                        marginRight: collapsed ? 'auto' : undefined,
                        transition: 'background 150ms ease, color 150ms ease',
                        background: isActive ? 'var(--nd-nav-active-bg)' : 'transparent',
                        color: isActive ? 'var(--nd-nav-active-text)' : 'var(--nd-nav-inactive)',
                        fontSize: 'var(--font-base)',
                        fontWeight: isActive ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        border: 'none',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'var(--nd-nav-hover-bg)'
                          e.currentTarget.style.color = 'var(--nd-text-primary)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--nd-nav-inactive)'
                        }
                      }}
                    >
                      <ChildIcon
                        className="shrink-0"
                        style={{
                          width: 18,
                          height: 18,
                          color: isActive ? 'var(--nd-nav-active-text)' : 'currentColor',
                        }}
                        strokeWidth={isActive ? 2 : 1.75}
                      />
                      {!collapsed && (
                        <>
                          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {child.label}
                          </span>
                          {/* GA4 connection status dot */}
                          {child.id === 'ga4-traffic' && (
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: ga4Connected ? '#10b981' : 'var(--nd-text-muted)',
                                flexShrink: 0,
                              }}
                              title={ga4Connected ? 'GA4 Connected' : 'GA4 Not Connected'}
                            />
                          )}
                          {/* Alert count badge */}
                          {child.id === 'priority-alerts' && alertCount > 0 && (
                            <span
                              style={{
                                minWidth: 18,
                                height: 18,
                                padding: '0 5px',
                                fontSize: 10,
                                fontWeight: 700,
                                borderRadius: 9,
                                background: '#ef4444',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                lineHeight: 1,
                                flexShrink: 0,
                              }}
                              title={`${alertCount} active alert${alertCount !== 1 ? 's' : ''}`}
                            >
                              {alertCount > 99 ? '99+' : alertCount}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── Bottom section ── */}
        <div
          style={{
            marginTop: 'auto',
            padding: collapsed ? '12px 8px' : '12px',
            borderTop: '1px solid var(--nd-border)',
            textAlign: 'center',
          }}
        >
          <p style={{
            fontSize: 'var(--font-xs)',
            color: 'var(--nd-text-muted)',
            margin: 0,
            paddingBottom: 4,
          }}>
            © 2026 Contentlytics
          </p>
        </div>
      </aside>
    </>
  )
}
