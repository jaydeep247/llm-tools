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

interface PageMetric {
  url: string
  title: string
  titleLength?: number
  titlePixelWidth?: number
  titleStatus?: 'OK' | 'Missing' | 'Duplicate'
  duplicateTitleCount?: number
  duplicateWith?: string[]
  resourceType?: string
  description: string
  descriptionLength?: number
  descriptionPixelWidth?: number
  metaDescriptionStatus?: 'OK' | 'Missing' | 'Duplicate'
  duplicateMetaDescriptionCount?: number
  duplicateMetaDescriptionWith?: string[]
  canonicalUrl?: string | null
  canonicalValidationStatus?: 'Valid' | 'Invalid' | 'Missing' | 'Redirect' | 'Error' | 'Not Found' | 'Blocked'
  canonicalValidationMessage?: string
  metaKeywords?: string
  metaKeywordsLength?: number
  contentType?: string
  lastModified?: string | null
  timestamp: string
  success?: boolean
  sessionId?: number
  tableCount?: number | null
  tableData?: string | null
  hasTables?: boolean | null
  faqCount?: number | null
  faqData?: string | null
  hasFaqs?: boolean | null
  faqScore?: number | null
  faqDetectionMethod?: string | null
  faqSchemaPresent?: boolean | null
  hasMixedContent?: boolean | null
  mixedContentSeverity?: 'none' | 'warning' | 'critical' | null
  mixedContentData?: string | null
  activeMixedContentCount?: number | null
  passiveMixedContentCount?: number | null
  totalInsecureResources?: number | null
  headerStructureData?: string | null
  headerStructureIssues?: string | null
  viewportPresent?: boolean | null
  viewportContent?: string | null
  viewportStatus?: 'ok' | 'warning' | 'error' | 'missing' | null
  structuredDataPresent?: boolean | null
  structuredDataFormat?: string | null
  structuredDataTypes?: string | null
  structuredDataPriorityType?: string | null
  pageSizeBytes?: number | null
  pageSizeStatus?: 'Small' | 'Medium' | 'Large' | null
  htmlSizeBytes?: number | null
  htmlSizeStatus?: 'Good' | 'Warning' | 'Large' | null
  totalResourceSizeBytes?: number | null
  resourceSizeBreakdown?: string | null
  totalWordCount?: number | null
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
    columns: ['url', 'title', 'resourceType', 'contentType', 'lastModified', 'timestamp']
  },
  {
    name: 'Title Metrics',
    columns: ['titleLength', 'titlePixelWidth', 'titleStatus', 'duplicateTitleCount']
  },
  {
    name: 'Description Metrics',
    columns: ['description', 'descriptionLength', 'descriptionPixelWidth', 'metaDescriptionStatus', 'duplicateMetaDescriptionCount']
  },
  {
    name: 'Canonical',
    columns: ['canonicalUrl', 'canonicalValidationStatus', 'canonicalValidationMessage']
  },
  {
    name: 'Meta Keywords',
    columns: ['metaKeywords', 'metaKeywordsLength']
  },
  {
    name: 'Tables',
    columns: ['hasTables', 'tableCount', 'tableData']
  },
  {
    name: 'FAQs',
    columns: ['hasFaqs', 'faqCount', 'faqScore', 'faqDetectionMethod', 'faqSchemaPresent', 'faqData']
  },
  {
    name: 'Mixed Content Security',
    columns: ['hasMixedContent', 'mixedContentSeverity', 'activeMixedContentCount', 'passiveMixedContentCount', 'totalInsecureResources', 'mixedContentData']
  },
  {
    name: 'Header Structure',
    columns: ['headerStructureData', 'headerStructureIssues']
  },
  {
    name: 'Viewport',
    columns: ['viewportPresent', 'viewportContent', 'viewportStatus']
  },
  {
    name: 'Structured Data',
    columns: ['structuredDataPresent', 'structuredDataFormat', 'structuredDataTypes', 'structuredDataPriorityType']
  },
  {
    name: 'Page Size',
    columns: ['pageSizeBytes', 'pageSizeStatus', 'htmlSizeBytes', 'htmlSizeStatus', 'totalResourceSizeBytes', 'resourceSizeBreakdown']
  },
  {
    name: 'Content',
    columns: ['totalWordCount']
  }
]

const DEFAULT_VISIBLE_COLUMNS: Set<keyof PageMetric> = new Set(['url', 'title', 'titleStatus', 'metaDescriptionStatus', 'hasTables', 'hasFaqs', 'timestamp'])

export function PageMetricsTable({ 
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

  // Filter data based on search and URL filter
  const filteredData = useMemo(() => {
    let filtered = data

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
  }, [data, searchQuery, urlFilter])

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
      faqScore: 'FAQ Score',
      faqDetectionMethod: 'FAQ Detection',
      faqSchemaPresent: 'FAQ Schema',
      hasMixedContent: 'Mixed Content',
      mixedContentSeverity: 'Mixed Content Severity',
      mixedContentData: 'Mixed Content Data',
      activeMixedContentCount: 'Active Mixed Content',
      passiveMixedContentCount: 'Passive Mixed Content',
      totalInsecureResources: 'Total Insecure Resources',
      headerStructureData: 'Header Structure',
      headerStructureIssues: 'Header Issues',
      viewportPresent: 'Viewport Present',
      viewportContent: 'Viewport Content',
      viewportStatus: 'Viewport Status',
      structuredDataPresent: 'Structured Data',
      structuredDataFormat: 'Structured Data Format',
      structuredDataTypes: 'Structured Data Types',
      structuredDataPriorityType: 'Priority Type',
      pageSizeBytes: 'Page Size',
      pageSizeStatus: 'Page Size Status',
      htmlSizeBytes: 'HTML Size',
      htmlSizeStatus: 'HTML Size Status',
      totalResourceSizeBytes: 'Total Resources',
      resourceSizeBreakdown: 'Resource Breakdown',
      totalWordCount: 'Word Count'
    }
    return labels[column] || column
  }

  // Columns that support sorting
  const sortableColumns: Set<keyof PageMetric> = new Set([
    'url', 'title', 'titleLength', 'titlePixelWidth', 'titleStatus', 'duplicateTitleCount',
    'descriptionLength', 'descriptionPixelWidth', 'metaDescriptionStatus', 'duplicateMetaDescriptionCount',
    'contentType', 'timestamp', 'lastModified', 'metaKeywordsLength',
    'tableCount', 'faqCount', 'faqScore', 'activeMixedContentCount', 'passiveMixedContentCount',
    'totalInsecureResources', 'canonicalValidationStatus', 'viewportStatus',
    'pageSizeBytes', 'pageSizeStatus', 'htmlSizeBytes', 'htmlSizeStatus', 'totalResourceSizeBytes', 'totalWordCount'
  ])

  const renderTableHeader = (column: keyof PageMetric) => {
    const isSortable = sortableColumns.has(column)
    const label = getColumnLabel(column)
    
    return (
      <th
        key={String(column)}
        className={`px-3 py-2 text-center text-xs font-semibold text-white/80 whitespace-nowrap ${
          isSortable ? 'cursor-pointer hover:bg-white/5' : ''
        }`}
        onClick={isSortable ? () => handleSort(column as SortField) : undefined}
      >
        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
          {label} {isSortable && <SortIcon field={column as SortField} />}
        </div>
      </th>
    )
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  const formatBytes = (bytes: number | null | undefined): string => {
    if (bytes === null || bytes === undefined || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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
      case 'faqSchemaPresent':
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
      case 'pageSizeBytes':
      case 'htmlSizeBytes':
      case 'totalResourceSizeBytes':
        if (value === null || value === undefined) return 'N/A'
        return formatBytes(Number(value))
      case 'pageSizeStatus':
      case 'htmlSizeStatus':
        if (!value) return 'N/A'
        const sizeColor = value === 'Small' || value === 'Good' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                         value === 'Medium' || value === 'Warning' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                         'bg-red-500/20 text-red-300 border-red-500/30'
        return <Badge className={sizeColor}>{value}</Badge>
      case 'titlePixelWidth':
      case 'descriptionPixelWidth':
        if (value === undefined || value === null) return 'N/A'
        const width = Number(value)
        const maxWidth = column === 'titlePixelWidth' ? 600 : 920
        const badgeColor = width < maxWidth ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                          width <= maxWidth + 100 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                          'bg-red-500/20 text-red-300 border-red-500/30'
        return <Badge className={badgeColor}>{width}px</Badge>
      case 'faqScore':
        if (value === undefined || value === null) return 'N/A'
        const faqScore = Number(value)
        const faqColor = faqScore >= 70 ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                        faqScore >= 40 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                        'bg-red-500/20 text-red-300 border-red-500/30'
        return <Badge className={faqColor}>{faqScore}/100</Badge>
      case 'mixedContentSeverity':
        if (!value || value === 'none') return 'N/A'
        const sevColor = value === 'critical' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                        'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
        return <Badge className={sevColor}>{typeof value === 'string' ? value.toUpperCase() : String(value)}</Badge>
      case 'duplicateTitleCount':
      case 'duplicateMetaDescriptionCount':
      case 'tableCount':
      case 'faqCount':
      case 'activeMixedContentCount':
      case 'passiveMixedContentCount':
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
      default:
        return value !== null && value !== undefined ? String(value) : 'N/A'
    }
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Sidebar Filter Panel */}
      <div className={`${sidebarOpen ? 'w-70' : 'w-0'} transition-all duration-300 overflow-hidden shrink-0`}>
        {sidebarOpen && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-4 h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Column Filters</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(false)}
                className="text-white/60 hover:text-white p-1 h-auto"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* URL/Resource Filter */}
            <div className="mb-4">
              <label className="text-xs text-white/60 mb-1 block">Filter by URL/Type</label>
              <Input
                placeholder="URL or content type..."
                value={urlFilter}
                onChange={(e) => {
                  setUrlFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-xs h-8"
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
                      className="flex items-center justify-between w-full text-xs font-medium text-white/80 hover:text-white"
                    >
                      <span>{category.name}</span>
                      <span className="text-white/40">{visible}/{total}</span>
                    </button>
                    <div className="space-y-1 pl-2">
                      {category.columns.map((column) => (
                        <label
                          key={String(column)}
                          className="flex items-center gap-2 text-xs text-white/70 hover:text-white cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns.has(column)}
                            onChange={() => toggleColumn(column)}
                            className="rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-0"
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
      <div className="flex-1 min-w-0 flex flex-col h-[calc(100vh-120px)]">
        {/* Open Sidebar Button */}
        {!sidebarOpen && (
          <div className="mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="bg-white/5 border-white/20 text-white hover:bg-white/10"
            >
              <ChevronRight className="h-4 w-4 mr-2" />
              Show Filters
            </Button>
          </div>
        )}

        {/* Header with Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
          <div className="flex-1 w-full sm:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                placeholder="Search by URL or title..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/40 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            {onRefresh && (
              <Button
                onClick={onRefresh}
                variant="outline"
                size="sm"
                className="bg-white/5 border-white/20 text-white hover:bg-white/10"
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
                className="bg-white/5 border-white/20 text-white hover:bg-white/10"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/60">Total Pages</div>
            <div className="text-xl font-bold text-white mt-1">{data.length}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/60">Filtered</div>
            <div className="text-xl font-bold text-white mt-1">{filteredData.length}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/60">With Tables</div>
            <div className="text-xl font-bold text-white mt-1">
              {data.filter(p => p.hasTables).length}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/60">With FAQs</div>
            <div className="text-xl font-bold text-white mt-1">
              {data.filter(p => p.hasFaqs).length}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-white/20 bg-white/5 backdrop-blur-xl overflow-hidden flex-1">
          <div 
            ref={tableContainerRef} 
            className="overflow-x-auto overflow-y-auto max-w-full h-full custom-scrollbar"
          >
            <table className="w-full text-sm">
              <thead className="bg-gray-900 border-b border-white/20 sticky top-0 z-10">
                <tr>
                  {orderedVisibleColumns.map(column => renderTableHeader(column))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {isLoading ? (
                  <tr>
                    <td colSpan={visibleColumns.size} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-white/60">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Loading data...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.size} className="px-4 py-12 text-center text-white/60">
                      No pages found. {(searchQuery || urlFilter) && 'Try adjusting your filters.'}
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((page) => (
                    <tr 
                      key={page.url}
                      className="hover:bg-white/5 transition-colors"
                    >
                      {orderedVisibleColumns.map((column) => (
                        <td key={String(column)} className="px-3 py-2 text-white/80 text-center whitespace-normal overflow-wrap-break-word">
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
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-white/60">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} results
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="bg-white/5 border-white/20 text-white hover:bg-white/10 disabled:opacity-50"
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
                      className={`${
                        currentPage === pageNum
                          ? 'bg-white text-black'
                          : 'bg-white/5 border-white/20 text-white hover:bg-white/10'
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
                className="bg-white/5 border-white/20 text-white hover:bg-white/10 disabled:opacity-50"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
