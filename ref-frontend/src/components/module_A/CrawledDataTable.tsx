'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
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

interface CrawledPage {
  id: number
  url: string
  title: string
  titleLength: number
  titlePixelWidth?: number
  description: string
  descriptionLength: number
  descriptionPixelWidth?: number
  contentType: string
  statusCode: number
  responseTime: number
  wordCount: number
  sentenceCount?: number
  averageWordsPerSentence?: number
  fleschReadingEase?: number
  readabilityLevel?: string
  textToHtmlRatio?: number
  crawlDepth: number
  folderDepth: number
  sizeBytes?: number
  success: boolean
  errorMessage?: string
  linkScore?: number
  canonicalUrl?: string
  amphtmlUrl?: string
  mobileAlternateUrl?: string
  indexable?: boolean
  indexabilityStatus?: string
  metaRobots?: string
  xRobotsTag?: string
  metaRefresh?: string
  transferredBytes?: number
  totalTransferredBytes?: number
  co2Mg?: number
  carbonRating?: string
  relNext?: string
  relPrev?: string
  httpRelNext?: string
  httpRelPrev?: string
  metaKeywords?: string
  metaKeywordsLength?: number
  headingTags?: string
  spellingErrors: number
  grammarErrors: number
  redirectUrl?: string
  redirectType?: string
  cookies?: string
  language?: string
  httpVersion?: string
  semanticSimilarityScore?: number
  semanticRelevanceScore?: number
  contentHash?: string
  closestDuplicateUrl?: string
  closestDuplicateSimilarity?: number
  nearDuplicateCount: number
  uniqueExternalOutlinks: number
  uniqueExternalJsOutlinks: number
  uniqueOutlinks?: number
  uniqueJsOutlinks?: number
  metaDescription?: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  lastModified?: string
  timestamp: string
}

interface CrawledDataTableProps {
  data: CrawledPage[]
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
}

type SortField = keyof CrawledPage
type SortDirection = 'asc' | 'desc'

type ColumnCategory = {
  name: string
  columns: (keyof CrawledPage)[]
}

const COLUMN_CATEGORIES: ColumnCategory[] = [
  {
    name: 'Basic Info',
    columns: ['url', 'title', 'statusCode', 'contentType', 'success', 'timestamp']
  },
  {
    name: 'SEO Meta',
    columns: ['titleLength', 'titlePixelWidth', 'descriptionLength', 'descriptionPixelWidth', 'description', 'metaKeywords']
  },
  {
    name: 'Content Quality',
    columns: ['wordCount', 'sentenceCount', 'averageWordsPerSentence', 'fleschReadingEase', 'readabilityLevel', 'textToHtmlRatio', 'spellingErrors', 'grammarErrors']
  },
  {
    name: 'Indexability',
    columns: ['indexable', 'indexabilityStatus', 'metaRobots', 'xRobotsTag', 'canonicalUrl']
  },
  {
    name: 'Links',
    columns: ['uniqueExternalOutlinks', 'uniqueExternalJsOutlinks', 'uniqueOutlinks', 'linkScore']
  },
  {
    name: 'Performance',
    columns: ['responseTime', 'sizeBytes', 'transferredBytes', 'totalTransferredBytes', 'co2Mg', 'carbonRating']
  },
  {
    name: 'Semantic',
    columns: ['semanticSimilarityScore', 'semanticRelevanceScore', 'nearDuplicateCount', 'closestDuplicateSimilarity', 'contentHash']
  },
  {
    name: 'Open Graph',
    columns: ['ogTitle', 'ogDescription', 'ogImage']
  },
  {
    name: 'Technical',
    columns: ['crawlDepth', 'folderDepth', 'language', 'httpVersion', 'redirectUrl', 'redirectType']
  },
  {
    name: 'Other',
    columns: ['lastModified', 'relNext', 'relPrev', 'errorMessage']
  }
]

const DEFAULT_VISIBLE_COLUMNS: Set<keyof CrawledPage> = new Set(['url', 'title', 'titleLength', 'contentType', 'timestamp'])

export function CrawledDataTable({ 
  data = [], 
  isLoading = false,
  onRefresh,
  onExport 
}: CrawledDataTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [visibleColumns, setVisibleColumns] = useState<Set<keyof CrawledPage>>(DEFAULT_VISIBLE_COLUMNS)
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
        page.description.toLowerCase().includes(query)
      )
    }

    if (urlFilter.trim()) {
      const query = urlFilter.toLowerCase()
      filtered = filtered.filter(page => 
        page.url.toLowerCase().includes(query) ||
        page.contentType.toLowerCase().includes(query)
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

  const toggleColumn = (column: keyof CrawledPage) => {
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

  const getColumnLabel = (column: keyof CrawledPage): string => {
    const labels: Record<string, string> = {
      url: 'URL',
      title: 'Title',
      titleLength: 'Title Length',
      titlePixelWidth: 'Title Pixel Width',
      description: 'Description',
      descriptionLength: 'Description Length',
      descriptionPixelWidth: 'Description Pixel Width',
      contentType: 'Content Type',
      statusCode: 'Status Code',
      success: 'Success',
      timestamp: 'Timestamp',
      wordCount: 'Word Count',
      sentenceCount: 'Sentence Count',
      averageWordsPerSentence: 'Avg Words/Sentence',
      fleschReadingEase: 'Reading Ease',
      readabilityLevel: 'Readability Level',
      textToHtmlRatio: 'Text/HTML Ratio',
      spellingErrors: 'Spelling Errors',
      grammarErrors: 'Grammar Errors',
      indexable: 'Indexable',
      indexabilityStatus: 'Indexability Status',
      metaRobots: 'Meta Robots',
      xRobotsTag: 'X-Robots-Tag',
      canonicalUrl: 'Canonical URL',
      uniqueExternalOutlinks: 'External Links',
      uniqueExternalJsOutlinks: 'External JS Links',
      uniqueOutlinks: 'Total Outlinks',
      linkScore: 'Link Score',
      responseTime: 'Response Time (ms)',
      sizeBytes: 'Size',
      transferredBytes: 'Transferred',
      totalTransferredBytes: 'Total Transferred',
      co2Mg: 'CO₂ (mg)',
      carbonRating: 'Carbon Rating',
      semanticSimilarityScore: 'Semantic Score',
      semanticRelevanceScore: 'Relevance Score',
      nearDuplicateCount: 'Near Duplicates',
      closestDuplicateSimilarity: 'Duplicate Similarity',
      contentHash: 'Content Hash',
      ogTitle: 'OG Title',
      ogDescription: 'OG Description',
      ogImage: 'OG Image',
      crawlDepth: 'Crawl Depth',
      folderDepth: 'Folder Depth',
      language: 'Language',
      httpVersion: 'HTTP Version',
      redirectUrl: 'Redirect URL',
      redirectType: 'Redirect Type',
      lastModified: 'Last Modified',
      relNext: 'Rel Next',
      relPrev: 'Rel Prev',
      errorMessage: 'Error Message',
      metaKeywords: 'Meta Keywords'
    }
    return labels[column] || column
  }

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) return 'bg-green-500/20 text-green-300 border-green-500/30'
    if (statusCode >= 300 && statusCode < 400) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
    if (statusCode >= 400 && statusCode < 500) return 'bg-orange-500/20 text-orange-300 border-orange-500/30'
    return 'bg-red-500/20 text-red-300 border-red-500/30'
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'N/A'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  const renderCellContent = (page: CrawledPage, column: keyof CrawledPage) => {
    const value = page[column]

    switch (column) {
      case 'url':
        return (
          <a 
            href={page.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <span>{page.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )
      case 'title':
        return <span title={page.title}>{page.title || 'Untitled'}</span>
      case 'statusCode':
        return <Badge className={getStatusColor(page.statusCode)}>{page.statusCode}</Badge>
      case 'success':
        return (
          <Badge className={page.success ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}>
            {page.success ? 'Yes' : 'No'}
          </Badge>
        )
      case 'indexable':
        return (
          <Badge className={page.indexable ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}>
            {page.indexable ? 'Yes' : 'No'}
          </Badge>
        )
      case 'timestamp':
        return <span className="text-[10px]">{new Date(page.timestamp).toLocaleString()}</span>
      case 'sizeBytes':
        return formatBytes(page.sizeBytes)
      case 'transferredBytes':
        return formatBytes(page.transferredBytes ? Number(page.transferredBytes) : undefined)
      case 'totalTransferredBytes':
        return formatBytes(page.totalTransferredBytes ? Number(page.totalTransferredBytes) : undefined)
      case 'textToHtmlRatio':
        return page.textToHtmlRatio ? `${Number(page.textToHtmlRatio).toFixed(2)}%` : 'N/A'
      case 'averageWordsPerSentence':
        return page.averageWordsPerSentence ? Number(page.averageWordsPerSentence).toFixed(1) : 'N/A'
      case 'fleschReadingEase':
        return page.fleschReadingEase ? Number(page.fleschReadingEase).toFixed(1) : 'N/A'
      case 'linkScore':
        return page.linkScore ? Number(page.linkScore).toFixed(2) : 'N/A'
      case 'co2Mg':
        return page.co2Mg ? Number(page.co2Mg).toFixed(2) : 'N/A'
      case 'carbonRating':
        return page.carbonRating ? <Badge className="bg-green-500/20 text-green-300">{page.carbonRating}</Badge> : 'N/A'
      case 'semanticSimilarityScore':
        return page.semanticSimilarityScore ? Number(page.semanticSimilarityScore).toFixed(2) : 'N/A'
      case 'semanticRelevanceScore':
        return page.semanticRelevanceScore ? Number(page.semanticRelevanceScore).toFixed(2) : 'N/A'
      case 'closestDuplicateSimilarity':
        return page.closestDuplicateSimilarity ? Number(page.closestDuplicateSimilarity).toFixed(4) : 'N/A'
      case 'contentHash':
        return page.contentHash ? (
          <span className="font-mono text-[10px]" title={page.contentHash}>
            {page.contentHash}
          </span>
        ) : 'N/A'
      case 'canonicalUrl':
        return page.canonicalUrl ? (
          <a href={page.canonicalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300" title={page.canonicalUrl}>
            {page.canonicalUrl}
          </a>
        ) : 'N/A'
      case 'indexabilityStatus':
        return <span title={page.indexabilityStatus || ''}>{page.indexabilityStatus || 'N/A'}</span>
      case 'description':
        return <span title={page.description}>{page.description || 'N/A'}</span>
      case 'errorMessage':
        return page.errorMessage ? (
          <span className="text-red-300" title={page.errorMessage}>{page.errorMessage}</span>
        ) : 'N/A'
      case 'ogTitle':
        return page.ogTitle ? <span title={page.ogTitle}>✓</span> : 'N/A'
      case 'ogDescription':
        return page.ogDescription ? '✓' : 'N/A'
      case 'ogImage':
        return page.ogImage ? (
          <a href={page.ogImage} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            ✓
          </a>
        ) : 'N/A'
      case 'redirectUrl':
        return <span title={page.redirectUrl || ''}>{page.redirectUrl || 'N/A'}</span>
      case 'metaKeywords':
        return <span title={page.metaKeywords || ''}>{page.metaKeywords || 'N/A'}</span>
      case 'relNext':
        return page.relNext ? '✓' : 'N/A'
      case 'relPrev':
        return page.relPrev ? '✓' : 'N/A'
      default:
        return value != null ? String(value) : 'N/A'
    }
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Sidebar Filter Panel */}
      <div className={`${sidebarOpen ? 'w-70' : 'w-0'} transition-all duration-300 overflow-hidden shrink-0`}>
        {sidebarOpen && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-4 h-[calc(100vh-120px)] overflow-y-auto">
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
                placeholder="Search by URL, title, or description..."
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
            <div className="text-xs text-white/60">Avg Word Count</div>
            <div className="text-xl font-bold text-white mt-1">
              {data.length > 0 ? Math.round(data.reduce((sum, p) => sum + p.wordCount, 0) / data.length) : 0}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/60">Success Rate</div>
            <div className="text-xl font-bold text-white mt-1">
              {data.length > 0 ? `${((data.filter(p => p.success).length / data.length) * 100).toFixed(1)}%` : '0%'}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-white/20 bg-white/5 backdrop-blur-xl overflow-hidden flex-1">
          <div 
            ref={tableContainerRef} 
            className="overflow-x-auto overflow-y-auto max-w-full h-full custom-scrollbar"
          >
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-white/10 border-b border-white/20 sticky top-0 z-10">
                <tr>
                  {visibleColumns.has('url') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5 min-w-75" onClick={() => handleSort('url')}>
                      <div className="flex items-center justify-center gap-1">URL <SortIcon field="url" /></div>
                    </th>
                  )}
                  {visibleColumns.has('title') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5 min-w-50" onClick={() => handleSort('title')}>
                      <div className="flex items-center justify-center gap-1">Title <SortIcon field="title" /></div>
                    </th>
                  )}
                  {visibleColumns.has('titleLength') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('titleLength')}>
                      <div className="flex items-center justify-center gap-1">Title Len <SortIcon field="titleLength" /></div>
                    </th>
                  )}
                  {visibleColumns.has('titlePixelWidth') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('titlePixelWidth')}>
                      <div className="flex items-center justify-center gap-1">Title Px <SortIcon field="titlePixelWidth" /></div>
                    </th>
                  )}
                  {visibleColumns.has('description') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 min-w-50">
                      <div className="flex items-center justify-center gap-1">Description</div>
                    </th>
                  )}
                  {visibleColumns.has('descriptionLength') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('descriptionLength')}>
                      <div className="flex items-center justify-center gap-1">Desc Len <SortIcon field="descriptionLength" /></div>
                    </th>
                  )}
                  {visibleColumns.has('descriptionPixelWidth') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('descriptionPixelWidth')}>
                      <div className="flex items-center justify-center gap-1">Desc Px <SortIcon field="descriptionPixelWidth" /></div>
                    </th>
                  )}
                  {visibleColumns.has('contentType') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('contentType')}>
                      <div className="flex items-center justify-center gap-1">Content Type <SortIcon field="contentType" /></div>
                    </th>
                  )}
                  {visibleColumns.has('statusCode') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('statusCode')}>
                      <div className="flex items-center justify-center gap-1">Status <SortIcon field="statusCode" /></div>
                    </th>
                  )}
                  {visibleColumns.has('success') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('success')}>
                      <div className="flex items-center justify-center gap-1">Success <SortIcon field="success" /></div>
                    </th>
                  )}
                  {visibleColumns.has('timestamp') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('timestamp')}>
                      <div className="flex items-center justify-center gap-1">Timestamp <SortIcon field="timestamp" /></div>
                    </th>
                  )}
                  {visibleColumns.has('wordCount') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('wordCount')}>
                      <div className="flex items-center justify-center gap-1">Word Count <SortIcon field="wordCount" /></div>
                    </th>
                  )}
                  {visibleColumns.has('sentenceCount') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('sentenceCount')}>
                      <div className="flex items-center justify-center gap-1">Sentences <SortIcon field="sentenceCount" /></div>
                    </th>
                  )}
                  {visibleColumns.has('averageWordsPerSentence') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('averageWordsPerSentence')}>
                      <div className="flex items-center justify-center gap-1">Avg Words/Sent <SortIcon field="averageWordsPerSentence" /></div>
                    </th>
                  )}
                  {visibleColumns.has('fleschReadingEase') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('fleschReadingEase')}>
                      <div className="flex items-center justify-center gap-1">Reading Ease <SortIcon field="fleschReadingEase" /></div>
                    </th>
                  )}
                  {visibleColumns.has('readabilityLevel') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('readabilityLevel')}>
                      <div className="flex items-center justify-center gap-1">Readability <SortIcon field="readabilityLevel" /></div>
                    </th>
                  )}
                  {visibleColumns.has('textToHtmlRatio') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('textToHtmlRatio')}>
                      <div className="flex items-center justify-center gap-1">Text/HTML % <SortIcon field="textToHtmlRatio" /></div>
                    </th>
                  )}
                  {visibleColumns.has('spellingErrors') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('spellingErrors')}>
                      <div className="flex items-center justify-center gap-1">Spelling Errors <SortIcon field="spellingErrors" /></div>
                    </th>
                  )}
                  {visibleColumns.has('grammarErrors') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('grammarErrors')}>
                      <div className="flex items-center justify-center gap-1">Grammar Errors <SortIcon field="grammarErrors" /></div>
                    </th>
                  )}
                  {visibleColumns.has('indexable') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('indexable')}>
                      <div className="flex items-center justify-center gap-1">Indexable <SortIcon field="indexable" /></div>
                    </th>
                  )}
                  {visibleColumns.has('indexabilityStatus') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 min-w-40">
                      <div className="flex items-center justify-center gap-1">Indexability Status</div>
                    </th>
                  )}
                  {visibleColumns.has('metaRobots') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">Meta Robots</div>
                    </th>
                  )}
                  {visibleColumns.has('xRobotsTag') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">X-Robots-Tag</div>
                    </th>
                  )}
                  {visibleColumns.has('canonicalUrl') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 w-96">
                      <div className="flex items-center justify-center gap-1">Canonical URL</div>
                    </th>
                  )}
                  {visibleColumns.has('uniqueExternalOutlinks') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('uniqueExternalOutlinks')}>
                      <div className="flex items-center justify-center gap-1">External Links <SortIcon field="uniqueExternalOutlinks" /></div>
                    </th>
                  )}
                  {visibleColumns.has('uniqueExternalJsOutlinks') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('uniqueExternalJsOutlinks')}>
                      <div className="flex items-center justify-center gap-1">External JS Links <SortIcon field="uniqueExternalJsOutlinks" /></div>
                    </th>
                  )}
                  {visibleColumns.has('uniqueOutlinks') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('uniqueOutlinks')}>
                      <div className="flex items-center justify-center gap-1">Total Outlinks <SortIcon field="uniqueOutlinks" /></div>
                    </th>
                  )}
                  {visibleColumns.has('linkScore') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('linkScore')}>
                      <div className="flex items-center justify-center gap-1">Link Score <SortIcon field="linkScore" /></div>
                    </th>
                  )}
                  {visibleColumns.has('responseTime') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('responseTime')}>
                      <div className="flex items-center justify-center gap-1">Response (ms) <SortIcon field="responseTime" /></div>
                    </th>
                  )}
                  {visibleColumns.has('sizeBytes') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('sizeBytes')}>
                      <div className="flex items-center justify-center gap-1">Size <SortIcon field="sizeBytes" /></div>
                    </th>
                  )}
                  {visibleColumns.has('transferredBytes') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('transferredBytes')}>
                      <div className="flex items-center justify-center gap-1">Transferred <SortIcon field="transferredBytes" /></div>
                    </th>
                  )}
                  {visibleColumns.has('totalTransferredBytes') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('totalTransferredBytes')}>
                      <div className="flex items-center justify-center gap-1">Total Transferred <SortIcon field="totalTransferredBytes" /></div>
                    </th>
                  )}
                  {visibleColumns.has('co2Mg') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('co2Mg')}>
                      <div className="flex items-center justify-center gap-1">CO₂ (mg) <SortIcon field="co2Mg" /></div>
                    </th>
                  )}
                  {visibleColumns.has('carbonRating') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">Carbon Rating</div>
                    </th>
                  )}
                  {visibleColumns.has('semanticSimilarityScore') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('semanticSimilarityScore')}>
                      <div className="flex items-center justify-center gap-1">Semantic Score <SortIcon field="semanticSimilarityScore" /></div>
                    </th>
                  )}
                  {visibleColumns.has('semanticRelevanceScore') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('semanticRelevanceScore')}>
                      <div className="flex items-center justify-center gap-1">Relevance Score <SortIcon field="semanticRelevanceScore" /></div>
                    </th>
                  )}
                  {visibleColumns.has('nearDuplicateCount') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('nearDuplicateCount')}>
                      <div className="flex items-center justify-center gap-1">Near Duplicates <SortIcon field="nearDuplicateCount" /></div>
                    </th>
                  )}
                  {visibleColumns.has('closestDuplicateSimilarity') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('closestDuplicateSimilarity')}>
                      <div className="flex items-center justify-center gap-1">Duplicate Similarity <SortIcon field="closestDuplicateSimilarity" /></div>
                    </th>
                  )}
                  {visibleColumns.has('contentHash') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">Content Hash</div>
                    </th>
                  )}
                  {visibleColumns.has('ogTitle') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">OG Title</div>
                    </th>
                  )}
                  {visibleColumns.has('ogDescription') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">OG Description</div>
                    </th>
                  )}
                  {visibleColumns.has('ogImage') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">OG Image</div>
                    </th>
                  )}
                  {visibleColumns.has('crawlDepth') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('crawlDepth')}>
                      <div className="flex items-center justify-center gap-1">Crawl Depth <SortIcon field="crawlDepth" /></div>
                    </th>
                  )}
                  {visibleColumns.has('folderDepth') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5" onClick={() => handleSort('folderDepth')}>
                      <div className="flex items-center justify-center gap-1">Folder Depth <SortIcon field="folderDepth" /></div>
                    </th>
                  )}
                  {visibleColumns.has('language') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">Language</div>
                    </th>
                  )}
                  {visibleColumns.has('httpVersion') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">HTTP Version</div>
                    </th>
                  )}
                  {visibleColumns.has('redirectUrl') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">Redirect URL</div>
                    </th>
                  )}
                  {visibleColumns.has('redirectType') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">Redirect Type</div>
                    </th>
                  )}
                  {visibleColumns.has('lastModified') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">Last Modified</div>
                    </th>
                  )}
                  {visibleColumns.has('relNext') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">Rel Next</div>
                    </th>
                  )}
                  {visibleColumns.has('relPrev') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">Rel Prev</div>
                    </th>
                  )}
                  {visibleColumns.has('metaKeywords') && (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-white/80">
                      <div className="flex items-center justify-center gap-1">Meta Keywords</div>
                    </th>
                  )}
                  {visibleColumns.has('errorMessage') && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-white/80 w-80">
                      <div className="flex items-center justify-center gap-1">Error Message</div>
                    </th>
                  )}
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
                      key={page.id}
                      className="hover:bg-white/5 transition-colors"
                    >
                      {Array.from(visibleColumns).map((column) => (
                        <td key={String(column)} className="px-3 py-2 text-white/80 text-center">
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
          <div className="flex items-center justify-between">
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
