'use client'

import { useState, useMemo, useRef } from 'react'
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Search,
  Download,
  RefreshCw,
  X,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FieldTooltip } from '../FieldTooltip'
import { useContentAuditMetricRunner } from './useContentAuditMetricRunner'

interface BacklinkMetricRow {
  id?: string | number
  url: string
  title?: string
  fields?: Record<string, any>
  inlinks?: number | null
  internal_outlinks?: number | null
  external_outlinks?: number | null
  link_ratio?: number | null
  link_ratio_pass?: boolean | null
  pr_score?: number | null
  current_referring_domains?: number | null
  min_required_rds?: number | null
  rds_to_acquire?: number | null
}

interface BacklinkMetricsTableProps {
  data: any[]
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
  jobId?: string | null
}

type SortField = keyof BacklinkMetricRow
type SortDirection = 'asc' | 'desc'

type ColumnCategory = {
  name: string
  columns: (keyof BacklinkMetricRow)[]
}

const COLUMN_CATEGORIES: ColumnCategory[] = [
  {
    name: 'Basic Info',
    columns: ['url', 'title', 'inlinks', 'link_ratio_pass'],
  },
  {
    name: 'Links',
    columns: ['internal_outlinks', 'external_outlinks', 'link_ratio'],
  },
  {
    name: 'Referring Domains',
    columns: ['pr_score', 'current_referring_domains'],
  },
  {
    name: 'Competitor Benchmark',
    columns: ['min_required_rds', 'rds_to_acquire'],
  },
]

const FIELD_DESCRIPTIONS: Partial<Record<keyof BacklinkMetricRow, string>> = {
  url: 'Full web address of the analyzed page. Click to open in a new tab.',
  title: 'Page title (if available).',
  inlinks: 'Number of internal pages that link TO this URL (post-crawl).',
  internal_outlinks: 'Number of links from this page to other pages on the same domain.',
  external_outlinks: 'Number of links from this page to different domains.',
  link_ratio: 'internal_outlinks / external_outlinks. Target is >= 4.0.',
  link_ratio_pass: 'Whether link_ratio meets the >= 4.0 threshold.',
  pr_score: 'DataForSEO page-level rank score for this URL.',
  current_referring_domains: 'Unique external domains linking TO this page.',
  min_required_rds: 'Median referring domains of top SERP competitors (benchmark).',
  rds_to_acquire: 'How many more referring domains this page needs to be competitive.',
}

const DEFAULT_VISIBLE_COLUMNS: Set<keyof BacklinkMetricRow> = new Set([
  'url',
  'inlinks',
  'internal_outlinks',
  'external_outlinks',
  'link_ratio',
  'link_ratio_pass',
  'pr_score',
  'current_referring_domains',
  'min_required_rds',
  'rds_to_acquire',
])

function getRowValue(row: any, key: keyof BacklinkMetricRow): any {
  if (!row) return null
  // Prefer flattened keys stored at fields-document root (backend sets them).
  if (row[key] !== undefined) return row[key]
  const fields = row.fields || {}
  if (fields[key] !== undefined) return fields[key]
  const bm = fields.backlink_metrics || {}
  return bm[key as any]
}

export function BacklinkMetrics({
  data = [],
  isLoading = false,
  onRefresh,
  onExport,
  jobId,
}: BacklinkMetricsTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('url')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [visibleColumns, setVisibleColumns] = useState<Set<keyof BacklinkMetricRow>>(
    DEFAULT_VISIBLE_COLUMNS
  )
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const itemsPerPage = 20

  const normalizedData: BacklinkMetricRow[] = useMemo(() => {
    const seen = new Set<string>()
    const result: BacklinkMetricRow[] = []

    ;(data || []).forEach((row: any) => {
      const url = row?.url
      if (!url) return
      if (seen.has(url)) return
      seen.add(url)

      const inlinks = getRowValue(row, 'inlinks')
      const internal_outlinks = getRowValue(row, 'internal_outlinks')
      const external_outlinks = getRowValue(row, 'external_outlinks')
      const link_ratio = getRowValue(row, 'link_ratio')
      const link_ratio_pass = getRowValue(row, 'link_ratio_pass')
      const pr_score = getRowValue(row, 'pr_score')
      const current_referring_domains = getRowValue(row, 'current_referring_domains')
      const min_required_rds = getRowValue(row, 'min_required_rds')
      const rds_to_acquire = getRowValue(row, 'rds_to_acquire')

      result.push({
        id: row.id ?? row._id,
        url: String(url),
        title: row.title ?? getRowValue(row, 'title') ?? '',
        fields: row.fields ?? {},
        inlinks: inlinks === '' ? null : inlinks ?? null,
        internal_outlinks: internal_outlinks === '' ? null : internal_outlinks ?? null,
        external_outlinks: external_outlinks === '' ? null : external_outlinks ?? null,
        link_ratio: link_ratio === '' ? null : link_ratio ?? null,
        link_ratio_pass: link_ratio_pass === '' ? null : link_ratio_pass ?? null,
        pr_score: pr_score === '' ? null : pr_score ?? null,
        current_referring_domains: current_referring_domains === '' ? null : current_referring_domains ?? null,
        min_required_rds: min_required_rds === '' ? null : min_required_rds ?? null,
        rds_to_acquire: rds_to_acquire === '' ? null : rds_to_acquire ?? null,
      })
    })

    return result
  }, [data])

  const metricRunner = useContentAuditMetricRunner({
    jobId,
    metric: 'backlink-metrics',
    data: normalizedData,
    onRefresh,
    getLastRunAt: (row) => row.fields?.backlink_metrics_last_run_at,
  })

  const filteredData = useMemo(() => {
    let filtered = normalizedData
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((row) => {
        const u = row.url?.toLowerCase() || ''
        const t = row.title?.toLowerCase() || ''
        return u.includes(q) || t.includes(q)
      })
    }
    if (urlFilter.trim()) {
      const q = urlFilter.toLowerCase()
      filtered = filtered.filter((row) => (row.url || '').toLowerCase().includes(q))
    }
    return filtered
  }, [normalizedData, searchQuery, urlFilter])

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        // false < true
        return sortDirection === 'asc'
          ? Number(aVal) - Number(bVal)
          : Number(bVal) - Number(aVal)
      }
      return 0
    })
  }, [filteredData, sortField, sortDirection])

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return sortedData.slice(startIndex, startIndex + itemsPerPage)
  }, [sortedData, currentPage])

  const totalPages = Math.ceil(sortedData.length / itemsPerPage)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const toggleColumn = (column: keyof BacklinkMetricRow) => {
    const newVisibleColumns = new Set(visibleColumns)
    if (newVisibleColumns.has(column)) newVisibleColumns.delete(column)
    else newVisibleColumns.add(column)
    setVisibleColumns(newVisibleColumns)

    if (!visibleColumns.has(column) && tableContainerRef.current) {
      setTimeout(() => {
        tableContainerRef.current?.scrollTo({
          left: tableContainerRef.current.scrollWidth,
          behavior: 'smooth',
        })
      }, 100)
    }
  }

  const toggleCategoryColumns = (category: ColumnCategory) => {
    const newVisibleColumns = new Set(visibleColumns)
    const visibleInCategory = category.columns.filter((c) => visibleColumns.has(c)).length
    const shouldShowAll = visibleInCategory < category.columns.length
    category.columns.forEach((col) => {
      if (shouldShowAll) newVisibleColumns.add(col)
      else newVisibleColumns.delete(col)
    })
    setVisibleColumns(newVisibleColumns)
  }

  const getCategoryVisibleCount = (category: ColumnCategory) => {
    const visible = category.columns.filter((c) => visibleColumns.has(c)).length
    return { visible, total: category.columns.length }
  }

  const getOrderedVisibleColumns = (): (keyof BacklinkMetricRow)[] => {
    const ordered: (keyof BacklinkMetricRow)[] = []
    for (const cat of COLUMN_CATEGORIES) {
      for (const column of cat.columns) {
        if (visibleColumns.has(column)) ordered.push(column)
      }
    }
    // Keep deterministic ordering for any columns not present in categories.
    for (const col of DEFAULT_VISIBLE_COLUMNS) {
      if (visibleColumns.has(col) && !ordered.includes(col)) ordered.push(col)
    }
    return ordered
  }

  const orderedVisibleColumns = useMemo(() => getOrderedVisibleColumns(), [visibleColumns])

  const getColumnLabel = (column: keyof BacklinkMetricRow): string => {
    const labels: Record<string, string> = {
      url: 'URL',
      title: 'Title',
      inlinks: 'Inlinks',
      internal_outlinks: 'Internal Outlinks',
      external_outlinks: 'External Outlinks',
      link_ratio: 'Link Ratio',
      link_ratio_pass: 'Link Ratio Pass',
      pr_score: 'PR Score',
      current_referring_domains: 'Current RDs',
      min_required_rds: 'Min Required RDs',
      rds_to_acquire: 'Need to Acquire RDs',
    }
    return labels[String(column)] || String(column)
  }

  const sortableColumns: Set<keyof BacklinkMetricRow> = new Set([
    'url',
    'inlinks',
    'internal_outlinks',
    'external_outlinks',
    'link_ratio',
    'pr_score',
    'current_referring_domains',
    'min_required_rds',
    'rds_to_acquire',
  ])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  const renderTableHeader = (column: keyof BacklinkMetricRow) => {
    const isSortable = sortableColumns.has(column)
    const label = getColumnLabel(column)
    return (
      <th
        key={String(column)}
        className={`px-3 py-2 text-center text-xs font-semibold text-zinc-200 whitespace-nowrap ${
          isSortable ? 'cursor-pointer hover:bg-zinc-800/50' : ''
        }`}
        onClick={isSortable ? () => handleSort(column as SortField) : undefined}
      >
        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
          {label}
          {isSortable && <SortIcon field={column as SortField} />}
          <FieldTooltip description={FIELD_DESCRIPTIONS[column] ?? ''} />
        </div>
      </th>
    )
  }

  const renderCellContent = (row: BacklinkMetricRow, column: keyof BacklinkMetricRow) => {
    const value = row[column]

    switch (column) {
      case 'url':
        if (!value || value === ('undefined' as any) || value === ('null' as any)) return <span className="text-zinc-600 text-xs select-none">—</span>
        return (
          <a
            href={String(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1"
          >
            <span className="truncate max-w-xs">{String(value)}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )

      case 'link_ratio_pass': {
        if (value === undefined || value === null) return <span className="text-zinc-600 text-xs select-none">—</span>
        const passed = Boolean(value)
        const color = passed
          ? 'bg-green-500/20 text-green-300 border-green-500/30'
          : 'bg-red-500/20 text-red-300 border-red-500/30'
        return <Badge className={color}>{passed ? 'Pass' : 'Fail'}</Badge>
      }

      case 'inlinks':
      case 'internal_outlinks':
      case 'external_outlinks':
      case 'link_ratio':
      case 'pr_score':
      case 'current_referring_domains':
      case 'min_required_rds':
      case 'rds_to_acquire': {
        if (value === undefined || value === null) return <span className="text-zinc-600 text-xs select-none">—</span>
        const num = Number(value)
        if (Number.isNaN(num)) return <span className="text-zinc-600 text-xs select-none">—</span>

        if (column === 'rds_to_acquire') {
          const color =
            num <= 0
              ? 'bg-green-500/20 text-green-300 border-green-500/30'
              : num <= 10
                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                : 'bg-red-500/20 text-red-300 border-red-500/30'
          return <Badge className={color}>{num.toLocaleString()}</Badge>
        }

        if (column === 'link_ratio') {
          const passed = num >= 4.0
          const color = passed
            ? 'bg-green-500/20 text-green-300 border-green-500/30'
            : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
          return <Badge className={color}>{num.toFixed(2)}</Badge>
        }

        return <Badge className="bg-zinc-700/30 text-zinc-200 border-zinc-600/30">{num.toLocaleString()}</Badge>
      }

      default:
        return value !== null && value !== undefined ? String(value) : <span className="text-zinc-600 text-xs select-none">—</span>
    }
  }

  const needsMoreRds = normalizedData.filter((r) => (r.rds_to_acquire ?? 0) > 0).length

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex-1 w-full sm:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search by URL or title..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 text-sm rounded-xl"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => metricRunner.runAll()}
              variant="outline"
              size="sm"
              disabled={!jobId || normalizedData.length === 0 || metricRunner.hasPendingRuns || metricRunner.isSubmitting}
              className="bg-white text-black border-white hover:bg-zinc-100 rounded-xl"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${metricRunner.hasPendingRuns ? 'animate-spin' : ''}`} />
              {metricRunner.hasPendingRuns ? `Running ${metricRunner.pendingCount}...` : 'Run All URLs'}
            </Button>
            {onRefresh && (
              <Button
                onClick={onRefresh}
                variant="outline"
                size="sm"
                className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl"
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
            {onExport && (
              <Button
                onClick={onExport}
                variant="outline"
                size="sm"
                className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Total Pages</div>
            <div className="text-xl font-bold text-white mt-1">{normalizedData.length}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Filtered</div>
            <div className="text-xl font-bold text-white mt-1">{filteredData.length}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Needs More RDs</div>
            <div className="text-xl font-bold text-white mt-1">{needsMoreRds}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Link Ratio Pass</div>
            <div className="text-xl font-bold text-white mt-1">
              {normalizedData.filter((r) => r.link_ratio_pass === true).length}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Sidebar Filter Panel */}
        <div className={`${sidebarOpen ? 'w-68' : 'w-0'} transition-all duration-300 overflow-hidden shrink-0`}>
          {sidebarOpen && (
            <div className="bg-[#0D0D10] border border-zinc-800 rounded-xl p-4 h-full overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Column Filters</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(false)}
                  className="text-zinc-500 hover:text-white p-1 h-auto hover:bg-zinc-800/60"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mb-4">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1.5 block">
                  Filter by URL/Type
                </label>
                <Input
                  placeholder="URL or content type..."
                  value={urlFilter}
                  onChange={(e) => {
                    setUrlFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 text-xs h-8 rounded-lg"
                />
              </div>

              <div className="space-y-3">
                {COLUMN_CATEGORIES.map((category) => {
                  const { visible, total } = getCategoryVisibleCount(category)
                  return (
                    <div key={category.name} className="space-y-2">
                      <button
                        onClick={() => toggleCategoryColumns(category)}
                        className="flex items-center justify-between w-full text-xs font-medium text-zinc-200 hover:text-white"
                      >
                        <span>{category.name}</span>
                        <span className="text-zinc-500">
                          {visible}/{total}
                        </span>
                      </button>
                      <div className="space-y-1 pl-2">
                        {category.columns.map((column) => (
                          <label
                            key={String(column)}
                            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={visibleColumns.has(column)}
                              onChange={() => toggleColumn(column)}
                              className="rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-0"
                            />
                            <span className="truncate">{getColumnLabel(column)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col h-full">
          {!sidebarOpen && (
            <div className="mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <ChevronRight className="h-4 w-4 mr-2" />
                Show Filters
              </Button>
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 bg-[#111113] overflow-hidden flex-1 min-h-0">
            <div
              ref={tableContainerRef}
              className="overflow-x-auto overflow-y-auto max-w-full h-full custom-scrollbar"
            >
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-10">
                  <tr>
                    {orderedVisibleColumns.map((column) => renderTableHeader(column))}
                    <th className="px-3 py-2 text-center text-xs font-semibold text-zinc-200 whitespace-nowrap sticky right-0 z-20 bg-zinc-900/80 border-l border-zinc-800">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {isLoading ? (
                    <tr>
                      <td colSpan={visibleColumns.size + 1} className="px-4 py-12 text-center">
                        <div className="flex items-center justify-center gap-2 text-zinc-400">
                          <RefreshCw className="h-5 w-5 animate-spin" />
                          <span>Loading data...</span>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.size + 1} className="px-4 py-12 text-center text-zinc-400">
                        No pages found. {(searchQuery || urlFilter) && 'Try adjusting your filters.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((row, index) => (
                      <tr
                        key={row.id ?? row.url ?? index}
                        className="group hover:bg-zinc-800/50 transition-colors"
                      >
                        {orderedVisibleColumns.map((column) => (
                          <td
                            key={String(column)}
                            className="px-3 py-2 text-zinc-200 text-center whitespace-normal overflow-wrap-break-word"
                          >
                            {renderCellContent(row, column)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center sticky right-0 z-10 bg-[#111113] group-hover:bg-zinc-800/50 border-l border-zinc-800 transition-colors">
                          {(metricRunner.isRunning(row.url) || !row.fields?.backlink_metrics_last_run_at) && (
                            <Button
                              onClick={() => metricRunner.runOne(row.url)}
                              variant="outline"
                              size="sm"
                              disabled={!jobId || metricRunner.isRunning(row.url)}
                              className="bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl min-w-24"
                            >
                              <RefreshCw className={`h-4 w-4 mr-2 ${metricRunner.isRunning(row.url) ? 'animate-spin' : ''}`} />
                              {metricRunner.isRunning(row.url) ? 'Running' : 'Run'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-2">
              <div className="text-sm text-zinc-500">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to{' '}
                {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} results
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 rounded-xl"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) pageNum = i + 1
                    else if (currentPage <= 3) pageNum = i + 1
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                    else pageNum = currentPage - 2 + i

                    return (
                      <Button
                        key={pageNum}
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`rounded-xl ${
                          currentPage === pageNum
                            ? 'bg-white text-black border-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                        }`}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 rounded-xl"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
