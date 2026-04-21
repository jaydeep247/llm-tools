'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  createWorkbook,
  addSheet,
  downloadWorkbook,
  transformCrawledDataForExcel,
  transformPageMetricsForExcel,
  transformTextQualityForExcel,
  transformWordCountForExcel,
  transformLinksForExcel,
  transformBrokenLinksForExcel,
  transformHeadingStructureForExcel,
  transformSemanticDuplicatesForExcel,
} from '@/utils/excelExport'
import ModuleAExport from './ModuleAExport'
import ModuleCExport from './ModuleCExport'
import ModuleEExport from './ModuleEExport'
import ModuleFExport from './ModuleFExport'

interface ExportsTabProps {
  /** Transformed pages array from SessionDetailClient */
  pages: any[]
  /** Raw links map keyed by source URL */
  linksMap: Record<string, any[]>
  /** Derived broken links object */
  brokenLinks: {
    brokenInternalLinks: { count: number; links: any[] }
    brokenExternalLinks: { count: number; links: any[] }
    missingPages: { count: number; links: any[] }
    serverErrors: { count: number; links: any[] }
    timeoutUnreachable: { count: number; links: any[] }
  }
  /** Job ID for API-backed modules  */
  jobId?: string
  /** Human-readable name for the downloaded file */
  sessionName?: string
  /** Used to show loading skeleton */
  isLoading?: boolean
}

export default function ExportsTab({
  pages,
  linksMap,
  brokenLinks,
  jobId,
  sessionName = 'session',
  isLoading = false,
}: ExportsTabProps) {
  const [isDownloadingAll, setIsDownloadingAll] = useState(false)

  /** Download everything from Module A (client-side data) in one workbook */
  const handleDownloadAllModuleA = async () => {
    if (isLoading || pages.length === 0) return
    setIsDownloadingAll(true)
    try {
      const wb = createWorkbook()
      const date = new Date().toISOString().split('T')[0]
      addSheet(wb, transformCrawledDataForExcel(pages), 'Crawled Pages')
      addSheet(wb, transformPageMetricsForExcel(pages), 'Page Metrics')
      addSheet(wb, transformTextQualityForExcel(pages), 'Text Quality')
      addSheet(wb, transformWordCountForExcel(pages), 'Word Count')
      addSheet(wb, transformLinksForExcel(linksMap), 'Links')
      addSheet(wb, transformBrokenLinksForExcel(brokenLinks), 'Broken Links')
      addSheet(wb, transformHeadingStructureForExcel(pages), 'Heading Structure')
      addSheet(wb, transformSemanticDuplicatesForExcel(pages), 'Semantic & Duplicates')
      downloadWorkbook(wb, `${sessionName}_full-seo-audit_${date}`)
    } catch (err) {
      console.error('Full export failed:', err)
    } finally {
      setIsDownloadingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-(--nd-text-primary) flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-indigo-500" />
            Exports
          </h2>
          <p className="text-sm text-(--nd-text-muted) mt-1">
            Download your analysis data as Excel (.xlsx) files — choose individual reports or full
            module workbooks.
          </p>
        </div>
        <Button
          onClick={handleDownloadAllModuleA}
          disabled={isLoading || pages.length === 0 || isDownloadingAll}
          className="shrink-0 h-9 px-4 text-sm font-medium rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 cursor-pointer"
          variant="ghost"
        >
          {isDownloadingAll ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 border border-current border-t-transparent rounded-full animate-spin" />
              Preparing…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Download className="h-3.5 w-3.5" />
              Download Full SEO Audit
            </span>
          )}
        </Button>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pages crawled', value: pages.length, color: 'text-blue-400' },
          {
            label: 'Total links',
            value: Object.values(linksMap).reduce((s, l) => s + l.length, 0),
            color: 'text-amber-400',
          },
          {
            label: 'Broken links',
            value:
              brokenLinks.missingPages.count +
              brokenLinks.brokenInternalLinks.count +
              brokenLinks.brokenExternalLinks.count +
              brokenLinks.serverErrors.count +
              brokenLinks.timeoutUnreachable.count,
            color: 'text-rose-400',
          },
          { label: 'Job ID', value: jobId ? `#${jobId.slice(-6)}` : '—', color: 'text-(--nd-text-muted)' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-(--nd-border) bg-white px-4 py-3"
          >
            <p className={`text-lg font-bold ${stat.color}`}>{stat.value.toLocaleString()}</p>
            <p className="text-[11px] text-(--nd-text-muted) mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Section label */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-(--nd-border)" />
        <span className="text-[11px] text-(--nd-text-muted) uppercase tracking-wider px-2">
          Module Exports
        </span>
        <div className="h-px flex-1 bg-(--nd-border)" />
      </div>

      {/* Module A — Technical SEO */}
      <ModuleAExport
        pages={pages}
        linksMap={linksMap}
        brokenLinks={brokenLinks}
        sessionName={sessionName}
        isLoading={isLoading}
      />

      {/* Module C — AI Intelligence */}
      <ModuleCExport jobId={jobId} sessionName={sessionName} />

      {/* Module E — Brand Intelligence */}
      <ModuleEExport jobId={jobId} sessionName={sessionName} />

      {/* Module F — Competitor Intelligence */}
      <ModuleFExport jobId={jobId} sessionName={sessionName} />

      {/* Footer note */}
      <p className="text-[11px] text-(--nd-text-muted) text-center pb-2">
        Files are generated in your browser — no data leaves your device during export.
      </p>
    </div>
  )
}
