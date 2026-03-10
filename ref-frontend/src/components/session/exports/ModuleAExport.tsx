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
      color: 'text-blue-400',
      sheetNames: ['Crawled Pages'],
    },
    {
      id: 'page-metrics',
      label: 'Page Metrics',
      description: 'Titles, meta descriptions, canonical URLs, FAQ data, mixed content and page sizes.',
      icon: FileText,
      count: pages.length,
      color: 'text-violet-400',
      sheetNames: ['Page Metrics'],
    },
    {
      id: 'text-quality',
      label: 'Text Quality',
      description: 'Word counts, readability scores, grammar & spelling errors, thin / duplicate content.',
      icon: Type,
      count: pages.length,
      color: 'text-emerald-400',
      sheetNames: ['Text Quality'],
    },
    {
      id: 'word-count',
      label: 'Word Count Analysis',
      description: 'Total, visible and unique word counts, sentence & paragraph structure.',
      icon: Hash,
      count: pages.length,
      color: 'text-cyan-400',
      sheetNames: ['Word Count'],
    },
    {
      id: 'links',
      label: 'Link Analysis',
      description: 'All internal and external outlinks with anchor text and status codes.',
      icon: Link2,
      count: totalLinks,
      color: 'text-amber-400',
      sheetNames: ['Links'],
    },
    {
      id: 'broken-links',
      label: 'Broken Links',
      description: 'Categorised broken links: 404s, server errors, timeouts and external issues.',
      icon: AlertTriangle,
      count: totalBrokenLinks,
      color: 'text-rose-400',
      sheetNames: ['Broken Links'],
    },
    {
      id: 'heading-structure',
      label: 'Heading Structure',
      description: 'H1 and H2 headings per page with lengths and full heading tag breakdown.',
      icon: Layers,
      count: pages.length,
      color: 'text-teal-400',
      sheetNames: ['Heading Structure'],
    },
    {
      id: 'semantic-duplicates',
      label: 'Semantic & Duplicates',
      description: 'Near-duplicate detection (SimHash) and semantic similarity scores between pages.',
      icon: GitMerge,
      count: pages.length,
      color: 'text-orange-400',
      sheetNames: ['Semantic & Duplicates'],
    },
    {
      id: 'all',
      label: 'Full SEO Audit (All Sheets)',
      description: 'Download all of the above in a single Excel workbook with separate sheets.',
      icon: FileSpreadsheet,
      count: pages.length,
      color: 'text-indigo-400',
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
    <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Globe className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">Technical SEO Audit (Module A)</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Crawled data, page metrics, text quality, links analysis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
            {pages.length} pages
          </Badge>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Export options */}
      {expanded && (
        <div className="border-t border-zinc-800/60 divide-y divide-zinc-800/40">
          {exportOptions.map((opt) => {
            const Icon = opt.icon
            const isDownloading = downloading === opt.id
            const disabled = isLoading || (opt.id !== 'all' && opt.count === 0) || !!downloading

            return (
              <div
                key={opt.id}
                className={`flex items-center justify-between px-5 py-3.5 gap-4 ${
                  opt.id === 'all' ? 'bg-indigo-500/5' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${opt.color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{opt.label}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{opt.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-zinc-600">
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
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
                    }`}
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
