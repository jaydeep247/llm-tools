'use client'

import { useState } from 'react'
import { FileSpreadsheet, Download, ChevronDown, ChevronUp, Globe, Link2, AlertTriangle, FileText, Type, Hash, Layers, GitMerge } from 'lucide-react'
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

interface ModuleAExportProps {
  pages: any[]
  linksMap: Record<string, any[]>
  brokenLinks: {
    brokenInternalLinks: { count: number; links: any[] }
    brokenExternalLinks: { count: number; links: any[] }
    missingPages: { count: number; links: any[] }
    serverErrors: { count: number; links: any[] }
    timeoutUnreachable: { count: number; links: any[] }
  }
  sessionName?: string
  isLoading?: boolean
}

interface ExportOption {
  id: string
  label: string
  description: string
  icon: React.ElementType
  count: number
  color: string
  sheetNames: string[]
}

export default function ModuleAExport({
  pages,
  linksMap,
  brokenLinks,
  sessionName = 'session',
  isLoading = false,
}: ModuleAExportProps) {
  const [expanded, setExpanded] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)

  const totalLinks = Object.values(linksMap).reduce((sum, links) => sum + links.length, 0)
  const totalBrokenLinks =
    brokenLinks.missingPages.count +
    brokenLinks.brokenInternalLinks.count +
    brokenLinks.brokenExternalLinks.count +
    brokenLinks.serverErrors.count +
    brokenLinks.timeoutUnreachable.count

  const exportOptions: ExportOption[] = [
    {
      id: 'crawled-data',
      label: 'Crawled Data',
      description: 'All crawled pages with status codes, response times, sizes, redirects and SEO metadata.',
      icon: Globe,
      count: pages.length,
      color: 'text-blue-600',
      sheetNames: ['Crawled Pages'],
    },
    {
      id: 'page-metrics',
      label: 'Page Metrics',
      description: 'Titles, meta descriptions, canonical URLs, FAQ data, mixed content and page sizes.',
      icon: FileText,
      count: pages.length,
      color: 'text-violet-600',
      sheetNames: ['Page Metrics'],
    },
    {
      id: 'text-quality',
      label: 'Text Quality',
      description: 'Word counts, readability scores, grammar & spelling errors, thin / duplicate content.',
      icon: Type,
      count: pages.length,
      color: 'text-emerald-600',
      sheetNames: ['Text Quality'],
    },
    {
      id: 'word-count',
      label: 'Word Count Analysis',
      description: 'Total, visible and unique word counts, sentence & paragraph structure.',
      icon: Hash,
      count: pages.length,
      color: 'text-cyan-600',
      sheetNames: ['Word Count'],
    },
    {
      id: 'links',
      label: 'Link Analysis',
      description: 'All internal and external outlinks with anchor text and status codes.',
      icon: Link2,
      count: totalLinks,
      color: 'text-amber-600',
      sheetNames: ['Links'],
    },
    {
      id: 'broken-links',
      label: 'Broken Links',
      description: 'Categorised broken links: 404s, server errors, timeouts and external issues.',
      icon: AlertTriangle,
      count: totalBrokenLinks,
      color: 'text-rose-600',
      sheetNames: ['Broken Links'],
    },
    {
      id: 'heading-structure',
      label: 'Heading Structure',
      description: 'H1 and H2 headings per page with lengths and full heading tag breakdown.',
      icon: Layers,
      count: pages.length,
      color: 'text-teal-600',
      sheetNames: ['Heading Structure'],
    },
    {
      id: 'semantic-duplicates',
      label: 'Semantic & Duplicates',
      description: 'Near-duplicate detection (SimHash) and semantic similarity scores between pages.',
      icon: GitMerge,
      count: pages.length,
      color: 'text-orange-600',
      sheetNames: ['Semantic & Duplicates'],
    },
    {
      id: 'all',
      label: 'Full SEO Audit (All Sheets)',
      description: 'Download all of the above in a single Excel workbook with separate sheets.',
      icon: FileSpreadsheet,
      count: pages.length,
      color: 'text-indigo-600',
      sheetNames: ['Crawled Pages', 'Page Metrics', 'Text Quality', 'Word Count', 'Links', 'Broken Links', 'Heading Structure', 'Semantic & Duplicates'],
    },
  ]

  const handleDownload = async (optionId: string) => {
    setDownloading(optionId)
    try {
      const wb = createWorkbook()
      const date = new Date().toISOString().split('T')[0]
      const filename = `${sessionName}_module-A_${optionId}_${date}`

      if (optionId === 'crawled-data' || optionId === 'all') {
        addSheet(wb, transformCrawledDataForExcel(pages), 'Crawled Pages')
      }
      if (optionId === 'page-metrics' || optionId === 'all') {
        addSheet(wb, transformPageMetricsForExcel(pages), 'Page Metrics')
      }
      if (optionId === 'text-quality' || optionId === 'all') {
        addSheet(wb, transformTextQualityForExcel(pages), 'Text Quality')
      }
      if (optionId === 'word-count' || optionId === 'all') {
        addSheet(wb, transformWordCountForExcel(pages), 'Word Count')
      }
      if (optionId === 'links' || optionId === 'all') {
        addSheet(wb, transformLinksForExcel(linksMap), 'Links')
      }
      if (optionId === 'broken-links' || optionId === 'all') {
        addSheet(wb, transformBrokenLinksForExcel(brokenLinks), 'Broken Links')
      }
      if (optionId === 'heading-structure' || optionId === 'all') {
        addSheet(wb, transformHeadingStructureForExcel(pages), 'Heading Structure')
      }
      if (optionId === 'semantic-duplicates' || optionId === 'all') {
        addSheet(wb, transformSemanticDuplicatesForExcel(pages), 'Semantic & Duplicates')
      }

      downloadWorkbook(wb, filename)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="rounded-2xl border border-(--nd-border) bg-white overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-(--nd-bg) transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <Globe className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-(--nd-text-primary)">Technical SEO Audit (Module A)</p>
            <p className="text-[11px] text-(--nd-text-muted) mt-0.5">
              Crawled data, page metrics, text quality, links analysis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
            {pages.length} pages
          </Badge>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-(--nd-text-muted)" />
          ) : (
            <ChevronDown className="h-4 w-4 text-(--nd-text-muted)" />
          )}
        </div>
      </button>

      {/* Export options */}
      {expanded && (
        <div className="border-t border-(--nd-border) divide-y divide-(--nd-border)">
          {exportOptions.map((opt) => {
            const Icon = opt.icon
            const isDownloading = downloading === opt.id
            const disabled = isLoading || (opt.id !== 'all' && opt.count === 0) || !!downloading

            return (
              <div
                key={opt.id}
                className={`flex items-center justify-between px-5 py-3.5 gap-4 ${
                  opt.id === 'all' ? 'bg-(--nd-bg)' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${opt.color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-(--nd-text-primary)">{opt.label}</p>
                    <p className="text-[11px] text-(--nd-text-muted) truncate">{opt.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-(--nd-text-muted)">
                    {opt.id === 'all'
                      ? `${opt.sheetNames.length} sheets`
                      : `${opt.count.toLocaleString()} rows`}
                  </span>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => handleDownload(opt.id)}
                    className={`h-8 px-3 text-xs rounded-xl cursor-pointer ${
                      opt.id === 'all'
                        ? 'text-white border-transparent hover:opacity-90'
                        : 'bg-white text-(--nd-text-secondary) border border-(--nd-border) hover:bg-(--nd-bg)'
                    }`}
                    style={opt.id === 'all' ? { background: 'var(--nd-purple)' } : undefined}
                    variant="ghost"
                  >
                    {isDownloading ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                        Exporting…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Download className="h-3 w-3" />
                        .xlsx
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
