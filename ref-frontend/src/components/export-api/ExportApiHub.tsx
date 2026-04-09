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
    <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-white">{title}</h2>
              {badge}
            </div>
            <p className="text-[12px] text-zinc-500 leading-relaxed max-w-2xl">{description}</p>
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
    <div className="min-h-screen bg-[#09090B]">
      {/* ── Sticky page header ── */}
      <div className="sticky top-0 z-10 border-b border-zinc-800 bg-[#09090B]/95 backdrop-blur-sm">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
              <Download className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-white leading-none">Export &amp; API</h1>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Colytics as infrastructure — data out, integrations in.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Project selector — only shown on data tabs */}
            {(activeTab === 'pdf' || activeTab === 'csv') && projects.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-[11px] text-zinc-500 shrink-0">Project</span>
                <Select
                  value={selectedProjectId || '__auto__'}
                  onValueChange={(v) => setSelectedProjectId(v === '__auto__' ? '' : v)}
                >
                  <SelectTrigger className="h-7 w-[160px] border-zinc-800 bg-zinc-900 text-[12px] text-zinc-300 focus:ring-amber-500/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-900">
                    <SelectItem
                      value="__auto__"
                      className="text-[12px] text-zinc-400 focus:bg-zinc-800 focus:text-zinc-200"
                    >
                      Auto-detect
                    </SelectItem>
                    {projects.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                        className="text-[12px] text-zinc-200 focus:bg-zinc-800 focus:text-white"
                      >
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="hidden sm:flex items-center gap-1 text-[11px] text-zinc-600">
              <span>Colytics AI</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-zinc-400">Export &amp; API</span>
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="px-6 flex gap-0.5 overflow-x-auto scrollbar-hide pb-px">
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
                  'group relative flex items-center gap-2 px-4 py-3 text-[13px] font-medium whitespace-nowrap transition-all duration-150 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-0',
                  isActive
                    ? 'border-amber-500 text-white'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700',
                )}
              >
                <Icon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-colors',
                    isActive ? 'text-amber-400' : 'text-zinc-600 group-hover:text-zinc-400',
                  )}
                />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="px-6 py-6 max-w-5xl">
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
                <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/20 uppercase tracking-wide">
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
                <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/20 uppercase tracking-wide">
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
