'use client'

import { useState } from 'react'
import {
  FileText,
  TableIcon,
  Clock,
  Key,
  ChevronRight,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PdfExports } from '@/components/export-api/PdfExports'
import { CsvExports } from '@/components/export-api/CsvExports'
import { ScheduledExports } from '@/components/export-api/ScheduledExports'
import { ApiAccess } from '@/components/export-api/ApiAccess'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useGetProjectsQuery } from '@/store/api/projectApi'

const TABS = [
  {
    id: 'pdf',
    label: 'PDF Exports',
    shortLabel: 'PDF',
    icon: FileText,
    description:
      'Generate and download polished PDF reports for any date — weekly summaries, audits, competitor snapshots, and AI visibility scorecards.',
  },
  {
    id: 'csv',
    label: 'CSV Exports',
    shortLabel: 'CSV',
    icon: TableIcon,
    description:
      'Stream structured data exports directly to your BI tools. All files include clean headers, timestamps, and a domain identifier column.',
  },
  {
    id: 'scheduled',
    label: 'Scheduled Exports',
    shortLabel: 'Scheduled',
    icon: Clock,
    description:
      'Set up automated weekly report deliveries to any inbox. Available on Agency+ plans.',
    planGate: true,
  },
  {
    id: 'api',
    label: 'API Access',
    shortLabel: 'API',
    icon: Key,
    description:
      'Integrate Colytics into your existing infrastructure via REST API. Manage your key, inspect rate limits, and explore the full endpoint reference.',
    planGate: true,
  },
] as const

type TabId = (typeof TABS)[number]['id']

// For now, plan-gating is based on a simple flag.
// Replace with real subscription check from user object when available.
const USER_PLAN: 'pro' | 'agency' | 'enterprise' = 'agency'

function canAccessGatedFeature() {
  return USER_PLAN === 'agency' || USER_PLAN === 'enterprise'
}

interface SectionPanelProps {
  title: string
  description: string
  badge?: React.ReactNode
  children: React.ReactNode
}

function SectionPanel({ title, description, badge, children }: SectionPanelProps) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
      {/* Header */}
      <div className="border-b px-6 py-5" style={{ borderColor: 'var(--nd-border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold" style={{ color: 'var(--nd-text-primary)' }}>{title}</h2>
              {badge}
            </div>
            <p className="text-[12px] leading-relaxed max-w-2xl" style={{ color: 'var(--nd-text-secondary)' }}>{description}</p>
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="p-6">{children}</div>
    </div>
  )
}

export function ExportApiHub() {
  const [activeTab, setActiveTab] = useState<TabId>('pdf')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const hasApiAccess = canAccessGatedFeature()

  const { data: projectsData } = useGetProjectsQuery()
  const projects = projectsData?.projects?.filter((p) => p.status === 'ACTIVE') ?? []

  const activeTabData = TABS.find((t) => t.id === activeTab)!

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'var(--nd-purple-subtle)' }}>
              <Download className="h-4 w-4" style={{ color: 'var(--nd-purple)' }} />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold leading-none" style={{ color: 'var(--nd-text-primary)' }}>Export &amp; API</h1>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--nd-text-secondary)' }}>Colytics as infrastructure — data out, integrations in.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Project selector */}
            {(activeTab === 'pdf' || activeTab === 'csv') && projects.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-[11px] shrink-0" style={{ color: 'var(--nd-text-muted)' }}>Project</span>
                <Select value={selectedProjectId || '__auto__'} onValueChange={(v) => setSelectedProjectId(v === '__auto__' ? '' : v)}>
                  <SelectTrigger className="h-7 w-40 text-[12px] rounded-lg" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-[#E8E9EF] rounded-xl">
                    <SelectItem value="__auto__" className="text-[12px] cursor-pointer">Auto-detect</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-[12px] cursor-pointer">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="hidden sm:flex items-center gap-1 text-[11px]" style={{ color: 'var(--nd-text-muted)' }}>
              <span>Colytics AI</span>
              <ChevronRight className="h-3 w-3" />
              <span style={{ color: 'var(--nd-text-secondary)' }}>Export &amp; API</span>
            </div>
          </div>
      </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-0.5 overflow-x-auto scrollbar-hide border-b" style={{ borderColor: 'var(--nd-border)' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-selected={isActive}
                role="tab"
                className={cn(
                  'group relative flex items-center gap-2 px-4 py-3 text-[13px] font-medium whitespace-nowrap transition-all duration-150 border-b-2 focus-visible:outline-none',
                  isActive ? 'border-[#5347CE]' : 'border-transparent hover:border-[#E8E9EF]',
                )}
                style={{ color: isActive ? 'var(--nd-purple)' : 'var(--nd-text-muted)' }}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0 transition-colors', isActive ? 'text-[#5347CE]' : '')} style={!isActive ? { color: 'var(--nd-text-muted)' } : {}} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            )
          })}
        </div>

      {/* ── Tab content ── */}
      <div className="py-5 max-w-5xl space-y-5">
        {activeTab === 'pdf' && (
          <SectionPanel title="PDF Exports" description={activeTabData.description}>
            <PdfExports projectId={selectedProjectId || undefined} />
          </SectionPanel>
        )}

        {activeTab === 'csv' && (
          <SectionPanel title="CSV Exports" description={activeTabData.description}>
            <CsvExports projectId={selectedProjectId || undefined} />
          </SectionPanel>
        )}

        {activeTab === 'scheduled' && (
          <SectionPanel
            title="Scheduled Exports"
            description={activeTabData.description}
            badge={
              !hasApiAccess ? (
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' }}>
                  Agency+
                </span>
              ) : undefined
            }
          >
            <ScheduledExports canAccess={hasApiAccess} />
          </SectionPanel>
        )}

        {activeTab === 'api' && (
          <SectionPanel
            title="API Access"
            description={activeTabData.description}
            badge={
              !hasApiAccess ? (
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' }}>
                  Agency+
                </span>
              ) : undefined
            }
          >
            <ApiAccess canAccess={hasApiAccess} />
          </SectionPanel>
        )}
      </div>
    </div>
  )
}
