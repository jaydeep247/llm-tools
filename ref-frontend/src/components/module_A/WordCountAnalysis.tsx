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

interface WordCountData {
  id: number
  url: string
  // Basic Word Count Metrics
  totalWordCount?: number
  visibleWordCount?: number
  uniqueWordCount?: number
  textToHtmlRatio?: number
  // Sentence & Paragraph Metrics
  sentenceCount?: number
  paragraphCount?: number
  averageSentenceLength?: number
  averageParagraphLength?: number
  // Keyword & Content Quality
  keywordDensity?: number
  thinContent?: boolean
  thinContentReason?: string | null
  duplicateContent?: boolean
  duplicateWithUrls?: string[]
  // Content Structure
  sectionWordCountMapping?: Record<string, number>
  sectionWordCountBreakdown?: Record<string, number>
  headingWordCountMapping?: Record<string, number>
  wordCountDistribution?: Record<string, number>
  timestamp: string
}

interface WordCountAnalysisProps {
  data: WordCountData[]
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
}

type SortField = keyof WordCountData
type SortDirection = 'asc' | 'desc'

type ColumnCategory = {
  name: string
  columns: (keyof WordCountData)[]
}

const COLUMN_CATEGORIES: ColumnCategory[] = [
  {
    name: 'Basic Info',
    columns: ['url', 'timestamp']
  },
  {
    name: 'Word Count Metrics',
    columns: ['totalWordCount', 'visibleWordCount', 'uniqueWordCount', 'textToHtmlRatio']
  },
  {
    name: 'Sentence & Paragraph',
    columns: ['sentenceCount', 'paragraphCount', 'averageSentenceLength', 'averageParagraphLength']
  },
  {
    name: 'Content Quality',
    columns: ['keywordDensity', 'thinContent', 'thinContentReason', 'duplicateContent', 'duplicateWithUrls']
  },
  {
    name: 'Content Structure',
    columns: ['sectionWordCountMapping', 'sectionWordCountBreakdown', 'headingWordCountMapping', 'wordCountDistribution']
  }
]

const DEFAULT_VISIBLE_COLUMNS: Set<keyof WordCountData> = new Set(['url', 'totalWordCount', 'visibleWordCount', 'textToHtmlRatio', 'timestamp'])

export function WordCountAnalysis({ 
  data = [], 
  isLoading = false,
  onRefresh,
  onExport 
}: WordCountAnalysisProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [visibleColumns, setVisibleColumns] = useState<Set<keyof WordCountData>>(DEFAULT_VISIBLE_COLUMNS)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const itemsPerPage = 20

  // Filter data based on search and URL filter
  const filteredData = useMemo(() => {
    let filtered = data

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(item => 
        item.url.toLowerCase().includes(query)
      )
    }

    if (urlFilter.trim()) {
      const query = urlFilter.toLowerCase()
      filtered = filtered.filter(item => 
        item.url.toLowerCase().includes(query)
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

  const toggleColumn = (column: keyof WordCountData) => {
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
  const getOrderedVisibleColumns = (): (keyof WordCountData)[] => {
    const ordered: (keyof WordCountData)[] = []
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

  const getColumnLabel = (column: keyof WordCountData): string => {
    const labels: Record<string, string> = {
      url: 'URL',
      totalWordCount: 'Total Words',
      visibleWordCount: 'Visible Words',
      uniqueWordCount: 'Unique Words',
      textToHtmlRatio: 'Text/HTML Ratio (%)',
      sentenceCount: 'Sentences',
      paragraphCount: 'Paragraphs',
      averageSentenceLength: 'Avg Sentence Length',
      averageParagraphLength: 'Avg Paragraph Length',
      keywordDensity: 'Keyword Density (%)',
      thinContent: 'Thin Content',
      thinContentReason: 'Thin Content Reason',
      duplicateContent: 'Duplicate Content',
      duplicateWithUrls: 'Duplicate URLs',
      sectionWordCountMapping: 'Section Word Counts',
      sectionWordCountBreakdown: 'Section Breakdown',
      headingWordCountMapping: 'Heading Word Counts',
      wordCountDistribution: 'Word Count Distribution',
      timestamp: 'Timestamp'
    }
    return labels[column] || column
  }

  // Columns that support sorting
  const sortableColumns: Set<keyof WordCountData> = new Set([
    'id', 'url', 'totalWordCount', 'visibleWordCount', 'uniqueWordCount', 'textToHtmlRatio',
    'sentenceCount', 'paragraphCount', 'averageSentenceLength', 'averageParagraphLength',
    'keywordDensity', 'timestamp'
  ])

  const renderTableHeader = (column: keyof WordCountData) => {
    const isSortable = sortableColumns.has(column)
    const label = getColumnLabel(column)
    const isMinWidthColumn = ['url', 'duplicateWithUrls', 'sectionWordCountMapping', 'sectionWordCountBreakdown', 'headingWordCountMapping', 'wordCountDistribution'].includes(column as string)
    
    return (
      <th
        key={String(column)}
        className={`px-3 py-2 text-center text-xs font-semibold text-(--nd-text-secondary) whitespace-nowrap ${
          isSortable ? 'cursor-pointer hover:bg-(--nd-bg)' : ''
        } ${
          isMinWidthColumn ? 'min-w-50' : ''
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

  const renderCellContent = (item: WordCountData, column: keyof WordCountData) => {
    const value = item[column]

    switch (column) {
      case 'url':
        return (
          <a 
            href={item.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <span>{item.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )
      case 'thinContent':
        return (
          <Badge className={item.thinContent ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}>
            {item.thinContent ? 'Yes' : 'No'}
          </Badge>
        )
      case 'duplicateContent':
        return (
          <Badge className={item.duplicateContent ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 'bg-green-50 text-green-700 border border-green-200'}>
            {item.duplicateContent ? 'Yes' : 'No'}
          </Badge>
        )
      case 'timestamp':
        return <span className="text-[10px]">{new Date(item.timestamp).toLocaleString()}</span>
      case 'textToHtmlRatio':
        return item.textToHtmlRatio ? `${Number(item.textToHtmlRatio).toFixed(2)}%` : 'N/A'
      case 'averageSentenceLength':
        return item.averageSentenceLength ? Number(item.averageSentenceLength).toFixed(1) : 'N/A'
      case 'averageParagraphLength':
        return item.averageParagraphLength ? Number(item.averageParagraphLength).toFixed(1) : 'N/A'
      case 'keywordDensity':
        return item.keywordDensity ? `${Number(item.keywordDensity).toFixed(2)}%` : 'N/A'
      case 'thinContentReason':
        return <span title={item.thinContentReason || ''}>{item.thinContentReason || 'N/A'}</span>
      case 'duplicateWithUrls': {
        const urls = item.duplicateWithUrls
        if (!urls || urls.length === 0) return <span className="text-(--nd-text-muted)">None</span>
        return (
          <div className="flex flex-col gap-1 max-w-xs">
            {urls.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 text-xs truncate flex items-center gap-1">
                <span className="truncate">{u}</span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </a>
            ))}
          </div>
        )
      }
      case 'sectionWordCountMapping':
      case 'sectionWordCountBreakdown':
      case 'headingWordCountMapping':
      case 'wordCountDistribution': {
        const mapping = item[column] as Record<string, number> | undefined
        if (!mapping || Object.keys(mapping).length === 0) return <span className="text-(--nd-text-muted)">N/A</span>
        return (
          <div className="flex flex-col gap-0.5 text-xs max-w-xs">
            {Object.entries(mapping).map(([key, count]) => (
              <div key={key} className="flex justify-between gap-2">
                <span className="text-(--nd-text-secondary) truncate">{key}</span>
                <span className="text-(--nd-text-primary) font-mono shrink-0">{count}</span>
              </div>
            ))}
          </div>
        )
      }
      default:
        return value != null ? String(value) : 'N/A'
    }
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Sidebar Filter Panel */}
      <div className={`${sidebarOpen ? 'w-70' : 'w-0'} transition-all duration-300 overflow-hidden shrink-0`}>
        {sidebarOpen && (
          <div className="bg-white border border-(--nd-border) rounded-lg p-4 h-[calc(100vh-120px)] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-(--nd-text-primary)">Column Filters</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(false)}
                className="text-(--nd-text-muted) hover:text-(--nd-text-primary) p-1 h-auto hover:bg-(--nd-bg)"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* URL Filter */}
            <div className="mb-4">
              <label className="text-xs text-(--nd-text-secondary) mb-1 block">Filter by URL</label>
              <Input
                placeholder="URL..."
                value={urlFilter}
                onChange={(e) => {
                  setUrlFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="bg-(--nd-bg) border-(--nd-border) text-(--nd-text-primary) placeholder:text-(--nd-text-muted) text-xs h-8"
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
                      className="flex items-center justify-between w-full text-xs font-medium text-(--nd-text-primary) hover:text-(--nd-text-primary)"
                    >
                      <span>{category.name}</span>
                      <span className="text-(--nd-text-muted)">{visible}/{total}</span>
                    </button>
                    <div className="space-y-1 pl-2">
                      {category.columns.map((column) => (
                        <label
                          key={String(column)}
                          className="flex items-center gap-2 text-xs text-(--nd-text-secondary) hover:text-(--nd-text-primary) cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns.has(column)}
                            onChange={() => toggleColumn(column)}
                            className="rounded border-(--nd-border) bg-white text-(--nd-purple) focus:ring-(--nd-purple)/50 focus:ring-offset-0"
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
              className="bg-white border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg)"
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
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-(--nd-text-muted)" />
              <Input
                placeholder="Search by URL..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-10 bg-(--nd-bg) border-(--nd-border) text-(--nd-text-primary) placeholder:text-(--nd-text-muted) text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            {onRefresh && (
              <Button
                onClick={onRefresh}
                variant="outline"
                size="sm"
                className="bg-white border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg)"
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
                className="bg-white border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg)"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-(--nd-border) rounded-lg p-3">
            <div className="text-xs text-(--nd-text-muted)">Total Pages</div>
            <div className="text-xl font-bold text-(--nd-text-primary) mt-1">{data.length}</div>
          </div>
          <div className="bg-white border border-(--nd-border) rounded-lg p-3">
            <div className="text-xs text-(--nd-text-muted)">Filtered</div>
            <div className="text-xl font-bold text-(--nd-text-primary) mt-1">{filteredData.length}</div>
          </div>
          <div className="bg-white border border-(--nd-border) rounded-lg p-3">
            <div className="text-xs text-(--nd-text-muted)">Avg Visible Words</div>
            <div className="text-xl font-bold text-(--nd-text-primary) mt-1">
              {data.length > 0 ? Math.round(data.reduce((sum, p) => sum + (p.visibleWordCount || 0), 0) / data.length) : 0}
            </div>
          </div>
          <div className="bg-white border border-(--nd-border) rounded-lg p-3">
            <div className="text-xs text-(--nd-text-muted)">Avg Text Ratio</div>
            <div className="text-xl font-bold text-(--nd-text-primary) mt-1">
              {data.length > 0 ? `${(data.reduce((sum, p) => sum + (p.textToHtmlRatio || 0), 0) / data.length).toFixed(1)}%` : '0%'}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-(--nd-border) bg-white overflow-hidden flex-1">
          <div 
            ref={tableContainerRef} 
            className="overflow-x-auto overflow-y-auto max-w-full h-full custom-scrollbar"
          >
            <table className="w-full text-sm">
              <thead className="bg-(--nd-bg) border-b border-(--nd-border) sticky top-0 z-10">
                <tr>
                  {orderedVisibleColumns.map(column => renderTableHeader(column))}
                </tr>
              </thead>
              <tbody className="divide-y divide-(--nd-border)">
                {isLoading ? (
                  <tr>
                    <td colSpan={visibleColumns.size} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-(--nd-text-muted)">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Loading data...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.size} className="px-4 py-12 text-center text-(--nd-text-muted)">
                      No pages found. {(searchQuery || urlFilter) && 'Try adjusting your filters.'}
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item) => (
                    <tr 
                      key={item.id}
                      className="hover:bg-(--nd-bg) transition-colors"
                    >
                      {orderedVisibleColumns.map((column) => (
                        <td key={String(column)} className="px-3 py-2 text-(--nd-text-secondary) text-center whitespace-normal overflow-wrap-break-word">
                          {renderCellContent(item, column)}
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
            <div className="text-sm text-(--nd-text-muted)">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} results
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="bg-white border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) disabled:opacity-50 rounded-xl"
              >
                Previous
              </Button>
              <div className="flex items-center justify-center gap-1">
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
                          ? 'bg-(--nd-purple) text-white border-(--nd-purple)'
                          : 'bg-white border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg)'
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
                className="bg-white border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) disabled:opacity-50 rounded-xl"
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
