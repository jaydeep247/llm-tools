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
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FieldTooltip } from '../FieldTooltip'

interface PageMetric {
  id?: string | number
  url: string
  title: string
  description?: string
  titleLength?: number
  titlePixelWidth?: number
  descriptionLength?: number
  descriptionPixelWidth?: number
  titleStatus?: 'OK' | 'Missing' | 'Duplicate'
  metaDescriptionStatus?: 'OK' | 'Missing' | 'Duplicate'
  duplicateTitleCount?: number
  duplicateMetaDescriptionCount?: number
  duplicateWith?: string[]
  resourceType?: string
  contentType?: string
  canonicalUrl?: string
  canonicalValidationStatus?: string
  metaKeywordsLength?: number
  lastModified?: string
  metaRobots?: string
  statusCode?: number
  headingTags?: string
  language?: string
  amphtmlUrl?: string
  responseTime?: number
  totalWordCount?: number
  timestamp: string
  sessionId?: number
  tableCount?: number | null
  tableData?: string | null
  hasTables?: boolean | null
  faqCount?: number | null
  faqData?: string | null
  hasFaqs?: boolean | null
  faqDetectionMethod?: string | null
  hasMixedContent?: boolean | null
  mixedContentSeverity?: 'none' | 'warning' | 'critical' | null
  mixedContentData?: string | null
  totalInsecureResources?: number | null
  viewportPresent?: boolean | null
  viewportContent?: string | null
  viewportStatus?: 'ok' | 'warning' | 'error' | 'missing' | null
  structuredDataPresent?: boolean | null
  structuredDataFormat?: string | null
  structuredDataTypes?: string | null
}

interface PageMetricsTableProps {
  data: PageMetric[]
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
}

type SortField = keyof PageMetric
type SortDirection = 'asc' | 'desc'

type ColumnCategory = {
  name: string
  columns: (keyof PageMetric)[]
}

const COLUMN_CATEGORIES: ColumnCategory[] = [
  {
    name: 'Basic Info',
    columns: ['url', 'title', 'resourceType', 'timestamp']
  },
  {
    name: 'Title Metrics',
    columns: ['titleLength', 'titlePixelWidth', 'titleStatus', 'duplicateTitleCount']
  },
  {
    name: 'Tables',
    columns: ['hasTables', 'tableCount', 'tableData']
  },
  {
    name: 'FAQs',
    columns: ['hasFaqs', 'faqCount', 'faqDetectionMethod', 'faqData']
  },
  {
    name: 'Mixed Content Security',
    columns: ['hasMixedContent', 'mixedContentSeverity', 'totalInsecureResources', 'mixedContentData']
  },
  {
    name: 'Viewport',
    columns: ['viewportPresent', 'viewportContent', 'viewportStatus']
  },
  {
    name: 'Structured Data',
    columns: ['structuredDataPresent', 'structuredDataFormat', 'structuredDataTypes']
  }
]

const FIELD_DESCRIPTIONS: Partial<Record<keyof PageMetric, string>> = {
  url: 'Full web address of the analyzed page. Click to open in a new tab.',
  title: 'HTML <title> tag content shown in browser tabs and Google search results.',
  titleLength: 'Character count of the page title. SEO optimal range is 30–60 characters.',
  titlePixelWidth: 'Rendered pixel width of the title in Google SERP. Maximum is ~600px.',
  titleStatus: 'Whether the page title is present (OK), absent (Missing), or shared with another page (Duplicate).',
  duplicateTitleCount: 'Number of other crawled pages that share the exact same page title.',
  resourceType: 'Type of the resource (e.g. Web Page, PDF, image) as classified by content type.',
  timestamp: 'Date and time when this page\'s content audit data was collected.',
  tableCount: 'Total number of HTML <table> elements found on this page.',
  tableData: 'Structured JSON data extracted from all HTML tables present on this page.',
  hasTables: 'Whether one or more HTML tables exist on this page.',
  faqCount: 'Number of FAQ question-and-answer pairs detected on this page.',
  faqData: 'Structured JSON of all detected FAQ pairs including questions and answers.',
  hasFaqs: 'Whether FAQ-style content was detected on this page.',
  faqDetectionMethod: 'How FAQs were identified: JSON-LD schema markup or content heuristics.',
  hasMixedContent: 'Whether this HTTPS page loads any insecure HTTP resources.',
  mixedContentSeverity: 'Risk level of mixed content: none, warning (passive/images), or critical (active/scripts).',
  mixedContentData: 'JSON listing all insecure HTTP resources detected on this HTTPS page.',
  totalInsecureResources: 'Total number of HTTP resources loaded on this HTTPS page.',
  viewportPresent: 'Whether the page declares a viewport meta tag required for mobile responsiveness.',
  viewportContent: 'The exact content attribute value of the viewport meta tag.',
  viewportStatus: 'Mobile viewport compliance status (ok, warning, error, or missing).',
  structuredDataPresent: 'Whether JSON-LD structured data schema markup exists on this page.',
  structuredDataFormat: 'Format of structured data found (JSON-LD, Microdata, or RDFa).',
  structuredDataTypes: 'Schema.org types detected on this page (e.g. Article, FAQPage, Product).',
}

const DEFAULT_VISIBLE_COLUMNS: Set<keyof PageMetric> = new Set(['url', 'title', 'titleStatus', 'hasTables', 'hasFaqs', 'timestamp'])

export function PageMetrics({ 
  data = [], 
  isLoading = false,
  onRefresh,
  onExport 
}: PageMetricsTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('url')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [visibleColumns, setVisibleColumns] = useState<Set<keyof PageMetric>>(DEFAULT_VISIBLE_COLUMNS)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const itemsPerPage = 20

  const uniqueData = useMemo(() => {
    const seen = new Set<string>()
    const result: PageMetric[] = []

    data.forEach((page) => {
      const key = page.url || ''
      if (key && seen.has(key)) {
        return
      }
      if (key) {
        seen.add(key)
      }
      result.push(page)
    })

    return result
  }, [data])

  // Filter data based on search and URL filter
  const filteredData = useMemo(() => {
    let filtered = uniqueData

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(page => 
        page.url.toLowerCase().includes(query) ||
        page.title.toLowerCase().includes(query) ||
        (page.description && page.description.toLowerCase().includes(query))
      )
    }

    if (urlFilter.trim()) {
      const query = urlFilter.toLowerCase()
      filtered = filtered.filter(page => 
        page.url.toLowerCase().includes(query) ||
        page.contentType?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [uniqueData, searchQuery, urlFilter])

  // Sort data
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      
      return 0
    })
  }, [filteredData, sortField, sortDirection])

  // Paginate data
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

  const toggleColumn = (column: keyof PageMetric) => {
    const newVisibleColumns = new Set(visibleColumns)
    const isAdding = !newVisibleColumns.has(column)
    if (newVisibleColumns.has(column)) {
      newVisibleColumns.delete(column)
    } else {
      newVisibleColumns.add(column)
    }
    setVisibleColumns(newVisibleColumns)
    
    // Scroll to end when adding a new column
    if (isAdding && tableContainerRef.current) {
      setTimeout(() => {
        tableContainerRef.current?.scrollTo({
          left: tableContainerRef.current.scrollWidth,
          behavior: 'smooth'
        })
      }, 100)
    }
  }

  const toggleCategoryColumns = (category: ColumnCategory) => {
    const newVisibleColumns = new Set(visibleColumns)
    const visibleInCategory = category.columns.filter(col => visibleColumns.has(col)).length
    const shouldShowAll = visibleInCategory < category.columns.length

    category.columns.forEach(col => {
      if (shouldShowAll) {
        newVisibleColumns.add(col)
      } else {
        newVisibleColumns.delete(col)
      }
    })
    setVisibleColumns(newVisibleColumns)
  }

  const getCategoryVisibleCount = (category: ColumnCategory) => {
    const visible = category.columns.filter(col => visibleColumns.has(col)).length
    return { visible, total: category.columns.length }
  }

  // Get visible columns in correct order based on COLUMN_CATEGORIES
  const getOrderedVisibleColumns = (): (keyof PageMetric)[] => {
    const ordered: (keyof PageMetric)[] = []
    for (const category of COLUMN_CATEGORIES) {
      for (const column of category.columns) {
        if (visibleColumns.has(column)) {
          ordered.push(column)
        }
      }
    }
    return ordered
  }

  const orderedVisibleColumns = useMemo(() => getOrderedVisibleColumns(), [visibleColumns])

  const getColumnLabel = (column: keyof PageMetric): string => {
    const labels: Record<string, string> = {
      url: 'URL',
      title: 'Title',
      titleLength: 'Title Length',
      titlePixelWidth: 'Title Width (px)',
      titleStatus: 'Title Status',
      duplicateTitleCount: 'Duplicate Title Count',
      resourceType: 'Resource Type',
      description: 'Meta Description',
      descriptionLength: 'Description Length',
      descriptionPixelWidth: 'Description Width (px)',
      metaDescriptionStatus: 'Meta Desc Status',
      duplicateMetaDescriptionCount: 'Duplicate Desc Count',
      canonicalUrl: 'Canonical URL',
      canonicalValidationStatus: 'Canonical Validation',
      canonicalValidationMessage: 'Canonical Message',
      metaKeywords: 'Meta Keywords',
      metaKeywordsLength: 'Keywords Length',
      contentType: 'Content Type',
      lastModified: 'Last Modified',
      timestamp: 'Timestamp',
      tableCount: 'Table Count',
      tableData: 'Table Data',
      hasTables: 'Has Tables',
      faqCount: 'FAQ Count',
      faqData: 'FAQ Data',
      hasFaqs: 'Has FAQs',
      faqDetectionMethod: 'FAQ Detection',
      hasMixedContent: 'Mixed Content',
      mixedContentSeverity: 'Mixed Content Severity',
      mixedContentData: 'Mixed Content Data',
      totalInsecureResources: 'Total Insecure Resources',
      viewportPresent: 'Viewport Present',
      viewportContent: 'Viewport Content',
      viewportStatus: 'Viewport Status',
      structuredDataPresent: 'Structured Data',
      structuredDataFormat: 'Structured Data Format',
      structuredDataTypes: 'Structured Data Types',
      totalWordCount: 'Word Count',
      metaRobots: 'Meta Robots',
      statusCode: 'HTTP Status Code',
      headingTags: 'Heading Tags',
      language: 'Language',
      amphtmlUrl: 'AMP HTML',
      responseTime: 'Response Time (s)'
    }
    return labels[column] || column
  }

  // Columns that support sorting
  const sortableColumns: Set<keyof PageMetric> = new Set([
    'url', 'title', 'titleLength', 'titlePixelWidth', 'titleStatus', 'duplicateTitleCount',
    'descriptionLength', 'descriptionPixelWidth', 'metaDescriptionStatus', 'duplicateMetaDescriptionCount',
    'contentType', 'timestamp', 'lastModified', 'metaKeywordsLength',
    'tableCount', 'faqCount',
    'totalInsecureResources', 'canonicalValidationStatus', 'viewportStatus',
    'totalWordCount'
  ])

  const renderTableHeader = (column: keyof PageMetric) => {
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

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  const renderCellContent = (page: PageMetric, column: keyof PageMetric) => {
    const value = page[column]

    switch (column) {
      case 'url':
      case 'canonicalUrl':
        if (!value || value === 'undefined' || value === 'null') return 'N/A'
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
      case 'titleStatus':
      case 'metaDescriptionStatus':
        if (!value) return 'N/A'
        const statusColor = value === 'OK' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                           value === 'Missing' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                           'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
        return <Badge className={statusColor}>{value}</Badge>
      case 'canonicalValidationStatus':
        if (!value) return 'N/A'
        const validColor = value === 'Valid' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                          value === 'Missing' ? 'bg-gray-500/20 text-gray-300 border-gray-500/30' :
                          'bg-red-500/20 text-red-300 border-red-500/30'
        return <Badge className={validColor}>{value}</Badge>
      case 'hasTables':
      case 'hasFaqs':
      case 'viewportPresent':
      case 'structuredDataPresent':
        if (value === undefined || value === null) return 'N/A'
        return (
          <Badge className={value ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-gray-500/20 text-gray-300 border-gray-500/30'}>
            {value ? '✅ Yes' : '❌ No'}
          </Badge>
        )
      case 'hasMixedContent':
        if (value === undefined || value === null) return 'N/A'
        const severity = page.mixedContentSeverity
        const mixedColor = !value ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                          severity === 'critical' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                          'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
        return <Badge className={mixedColor}>{value ? (severity === 'critical' ? 'Critical' : 'Warning') : 'Secure'}</Badge>
      case 'viewportStatus':
        if (!value) return 'N/A'
        const vpColor = value === 'ok' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                       value === 'missing' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                       'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
        return <Badge className={vpColor}>{typeof value === 'string' ? value.toUpperCase() : String(value)}</Badge>
      case 'timestamp':
      case 'lastModified':
        if (!value) return 'N/A'
        return new Date(String(value)).toLocaleString()
      case 'titlePixelWidth':
      case 'descriptionPixelWidth':
        if (value === undefined || value === null) return 'N/A'
        const width = Number(value)
        const maxWidth = column === 'titlePixelWidth' ? 600 : 920
        const badgeColor = width < maxWidth ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                          width <= maxWidth + 100 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                          'bg-red-500/20 text-red-300 border-red-500/30'
        return <Badge className={badgeColor}>{width}px</Badge>
      case 'mixedContentSeverity':
        if (!value || value === 'none') return 'N/A'
        const sevColor = value === 'critical' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                        'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
        return <Badge className={sevColor}>{typeof value === 'string' ? value.toUpperCase() : String(value)}</Badge>
      case 'duplicateTitleCount':
      case 'duplicateMetaDescriptionCount':
      case 'tableCount':
      case 'faqCount':
      case 'totalInsecureResources':
        if (value === undefined || value === null) return 'N/A'
        const count = Number(value)
        const countColor = count === 0 ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                          count <= 2 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                          'bg-red-500/20 text-red-300 border-red-500/30'
        return <Badge className={countColor}>{count}</Badge>
      case 'totalWordCount':
        if (value === undefined || value === null) return 'N/A'
        return Number(value).toLocaleString()
      case 'headingTags': {
        if (!value) return 'N/A'
        try {
          const headings = JSON.parse(String(value))
          if (!Array.isArray(headings) || headings.length === 0) return 'N/A'
          return (
            <div className="space-y-0.5 max-h-40 overflow-y-auto text-[10px]">
              {headings.map((h: { level: number; tag: string; text: string }, i: number) => (
                <div key={i} className="flex items-start gap-1" style={{ paddingLeft: `${(h.level - 1) * 8}px` }}>
                  <Badge className="shrink-0 text-[9px] px-1 py-0 bg-zinc-700 text-zinc-300">{h.tag.toUpperCase()}</Badge>
                  <span className="text-zinc-300 truncate" title={h.text}>{h.text}</span>
                </div>
              ))}
            </div>
          )
        } catch { return <span title={String(value)}>{String(value)}</span> }
      }
      case 'metaRobots':
        return value ? <span title={String(value)}>{String(value)}</span> : 'N/A'
      case 'statusCode':
        if (!value) return 'N/A'
        const sc = Number(value)
        const scColor = sc >= 200 && sc < 300 ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                       sc >= 300 && sc < 400 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                       'bg-red-500/20 text-red-300 border-red-500/30'
        return <Badge className={scColor}>{sc}</Badge>
      case 'language':
        return value ? String(value) : 'N/A'
      case 'amphtmlUrl':
        if (!value) return 'N/A'
        return (
          <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
            <span className="truncate max-w-xs">{String(value)}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )
      case 'responseTime':
        if (!value) return 'N/A'
        return `${Number(value).toFixed(3)}s`
      default:
        return value !== null && value !== undefined ? String(value) : 'N/A'
    }
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Option Bar: Header with Controls & Stats */}
      <div className="flex flex-col gap-3">
        {/* Header with Controls */}
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

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Total Pages</div>
            <div className="text-xl font-bold text-white mt-1">{uniqueData.length}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Filtered</div>
            <div className="text-xl font-bold text-white mt-1">{filteredData.length}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">With Tables</div>
            <div className="text-xl font-bold text-white mt-1">
              {uniqueData.filter(p => p.hasTables).length}
            </div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">With FAQs</div>
            <div className="text-xl font-bold text-white mt-1">
              {uniqueData.filter(p => p.hasFaqs).length}
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

            {/* URL/Resource Filter */}
            <div className="mb-4">
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Filter by URL/Type</label>
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

            {/* Column Visibility by Category */}
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
                      <span className="text-zinc-500">{visible}/{total}</span>
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
        {/* Open Sidebar Button */}
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

        {/* Table */}
        <div className="rounded-xl border border-zinc-800 bg-[#111113] overflow-hidden flex-1 min-h-0">
          <div 
            ref={tableContainerRef} 
            className="overflow-x-auto overflow-y-auto max-w-full h-full custom-scrollbar"
          >
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-10">
                <tr>
                  {orderedVisibleColumns.map(column => renderTableHeader(column))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={visibleColumns.size} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-zinc-400">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Loading data...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.size} className="px-4 py-12 text-center text-zinc-400">
                      No pages found. {(searchQuery || urlFilter) && 'Try adjusting your filters.'}
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((page, index) => (
                    <tr 
                      key={page.id ?? page.url ?? index}
                      className="hover:bg-zinc-800/50 transition-colors"
                    >
                      {orderedVisibleColumns.map((column) => (
                        <td key={String(column)} className="px-3 py-2 text-zinc-200 text-center whitespace-normal overflow-wrap-break-word">
                          {renderCellContent(page, column)}
                        </td>
                      ))}
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
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} results
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 rounded-xl"
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }
                  
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
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
