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

interface TextQualityData {
  id: number
  url: string
  title: string
  // Core text metrics
  totalWordCount?: number
  visibleWordCount?: number
  uniqueWordCount?: number
  // Sentence Length / Complexity (from wordcount_analysis)
  sentenceCount?: number
  averageSentenceLength?: number
  // Paragraph Structure (from wordcount_analysis)
  paragraphCount?: number
  averageParagraphLength?: number
  // Keyword / Entity Usage (from wordcount_analysis)
  keywordDensity?: number
  // Clarity & Coherence (computed)
  clarityScore?: number
  // Tone & Style (computed)
  toneConsistency?: string
  // Text Ratio (from wordcount_analysis)
  textToHtmlRatio?: number
  // Missing / Weak Info (from wordcount_analysis)
  thinContent?: boolean
  thinContentReason?: string
  duplicateContent?: boolean
  duplicateWithUrls?: string[]
  // Detailed content structure
  sectionWordCountMapping?: any
  sectionWordCountBreakdown?: any
  headingWordCountMapping?: any
  // General
  timestamp: string
  success?: boolean
  contentType?: string
  resourceType?: string
}

interface TextQualityTableProps {
  data: TextQualityData[]
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
}

type SortField = keyof TextQualityData
type SortDirection = 'asc' | 'desc'

type ColumnCategory = {
  name: string
  columns: (keyof TextQualityData)[]
}

const COLUMN_CATEGORIES: ColumnCategory[] = [
  {
    name: 'Basic Info',
    columns: ['url', 'title', 'success', 'timestamp']
  },
  {
    name: 'Word Counts',
    columns: ['totalWordCount', 'visibleWordCount', 'uniqueWordCount']
  },
  {
    name: 'Sentence Length / Complexity',
    columns: ['sentenceCount', 'averageSentenceLength']
  },
  {
    name: 'Paragraph Structure',
    columns: ['paragraphCount', 'averageParagraphLength']
  },
  {
    name: 'Keyword / Entity Usage',
    columns: ['keywordDensity']
  },
  {
    name: 'Clarity & Coherence',
    columns: ['clarityScore']
  },
  {
    name: 'Tone & Style',
    columns: ['toneConsistency']
  },
  {
    name: 'Text Ratio',
    columns: ['textToHtmlRatio']
  },
  {
    name: 'Missing / Weak Info',
    columns: ['thinContent', 'thinContentReason', 'duplicateContent', 'duplicateWithUrls']
  },
  {
    name: 'Advanced Analysis',
    columns: ['sectionWordCountMapping', 'sectionWordCountBreakdown', 'headingWordCountMapping']
  }
]

const DEFAULT_VISIBLE_COLUMNS: Set<keyof TextQualityData> = new Set([
  'url', 
  'title',
  'averageSentenceLength',
  'averageParagraphLength',
  'keywordDensity',
  'clarityScore',
  'toneConsistency',
  'textToHtmlRatio',
  'thinContent'
])

// Helper functions for quality classification
const classifySentenceComplexity = (avgLen?: number | null) => {
  if (avgLen === null || avgLen === undefined) {
    return { label: 'Unknown', level: 'neutral' as const }
  }
  if (avgLen >= 15 && avgLen <= 20) return { label: 'Good', level: 'good' as const }
  if (avgLen >= 21 && avgLen <= 25) return { label: 'Complex', level: 'warning' as const }
  if (avgLen > 25) return { label: 'Hard to read', level: 'bad' as const }
  return { label: 'Very short', level: 'warning' as const }
}

const classifyParagraphStructure = (avgLen?: number | null, paragraphCount?: number | null) => {
  if (avgLen === null || avgLen === undefined || paragraphCount === null || paragraphCount === undefined) {
    return { label: 'Unknown', level: 'neutral' as const }
  }
  if (avgLen >= 40 && avgLen <= 80) {
    if (paragraphCount <= 1) {
      return { label: 'Few paragraphs', level: 'warning' as const }
    }
    return { label: 'Good', level: 'good' as const }
  }
  if (avgLen > 120) return { label: 'Wall of text', level: 'bad' as const }
  if (avgLen > 80 && avgLen <= 120) return { label: 'Heavy', level: 'warning' as const }
  if (avgLen < 40) return { label: 'Very short', level: 'warning' as const }
  return { label: 'Unknown', level: 'neutral' as const }
}

const classifyKeywordDensity = (density?: number | null) => {
  if (density === null || density === undefined) {
    return { label: 'Unknown', level: 'neutral' as const }
  }
  if (density >= 0.5 && density <= 2) return { label: 'Healthy', level: 'good' as const }
  if (density > 2 && density <= 3) return { label: 'High', level: 'warning' as const }
  if (density > 3) return { label: 'Stuffing risk', level: 'bad' as const }
  return { label: 'Low', level: 'warning' as const }
}

const classifyTextRatio = (ratio?: number | null) => {
  if (ratio === null || ratio === undefined) {
    return { label: 'Unknown', level: 'neutral' as const }
  }
  if (ratio > 20) return { label: 'Healthy', level: 'good' as const }
  if (ratio >= 10 && ratio <= 20) return { label: 'Low content', level: 'warning' as const }
  return { label: 'Thin / template-heavy', level: 'bad' as const }
}

const computeClarityScore = (item: TextQualityData) => {
  const avgSent = item.averageSentenceLength ?? null
  const avgPara = item.averageParagraphLength ?? null
  const ratio = item.textToHtmlRatio ?? null

  let score = 100

  if (avgSent !== null) {
    if (avgSent >= 15 && avgSent <= 20) score += 0
    else if (avgSent >= 21 && avgSent <= 25) score -= 10
    else if (avgSent > 25) score -= 25
    else if (avgSent < 10) score -= 5
  }

  if (avgPara !== null) {
    if (avgPara >= 40 && avgPara <= 80) score += 0
    else if (avgPara >= 80 && avgPara <= 120) score -= 10
    else if (avgPara > 120) score -= 20
    else if (avgPara < 30) score -= 5
  }

  if (ratio !== null) {
    if (ratio > 20) score += 0
    else if (ratio >= 10 && ratio <= 20) score -= 10
    else score -= 20
  }

  if (item.thinContent) {
    score -= 15
  }

  score = Math.max(0, Math.min(100, score))

  let label: string
  let level: 'good' | 'warning' | 'bad' | 'neutral'
  if (score >= 75) {
    label = 'Clear'
    level = 'good'
  } else if (score >= 55) {
    label = 'Could be clearer'
    level = 'warning'
  } else {
    label = 'Hard to follow'
    level = 'bad'
  }

  return { label, level, score }
}

const classifyToneConsistency = (item: TextQualityData) => {
  const avgSent = item.averageSentenceLength ?? null
  const paragraphs = item.paragraphCount ?? null

  if (avgSent === null || paragraphs === null) {
    return { label: 'Unknown', level: 'neutral' as const }
  }

  if (item.thinContent) {
    return { label: 'Inconsistent (thin)', level: 'bad' as const }
  }

  if (paragraphs >= 3 && avgSent >= 12 && avgSent <= 25) {
    return { label: 'Consistent', level: 'good' as const }
  }

  if (paragraphs <= 1 || avgSent < 8 || avgSent > 30) {
    return { label: 'Erratic', level: 'warning' as const }
  }

  return { label: 'Moderate', level: 'neutral' as const }
}

const classifyMissingInfo = (item: TextQualityData) => {
  if (item.thinContent || item.duplicateContent) {
    return { label: 'Issues found', level: 'bad' as const }
  }
  if ((item.totalWordCount ?? 0) < 300) {
    return { label: 'Low content', level: 'warning' as const }
  }
  return { label: 'Complete', level: 'good' as const }
}

export function TextQualityTable({ 
  data = [], 
  isLoading = false,
  onRefresh,
  onExport 
}: TextQualityTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('id')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [visibleColumns, setVisibleColumns] = useState<Set<keyof TextQualityData>>(DEFAULT_VISIBLE_COLUMNS)
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
        (page.thinContentReason && page.thinContentReason.toLowerCase().includes(query))
      )
    }

    if (urlFilter.trim()) {
      const query = urlFilter.toLowerCase()
      filtered = filtered.filter(page => 
        page.url.toLowerCase().includes(query)
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

  const toggleColumn = (column: keyof TextQualityData) => {
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
  const getOrderedVisibleColumns = (): (keyof TextQualityData)[] => {
    const ordered: (keyof TextQualityData)[] = []
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

  const getColumnLabel = (column: keyof TextQualityData): string => {
    const labels: Record<string, string> = {
      url: 'URL',
      title: 'Title',
      totalWordCount: 'Total Words',
      visibleWordCount: 'Visible Words',
      uniqueWordCount: 'Unique Words',
      success: 'Success',
      timestamp: 'Timestamp',
      // Sentence Length / Complexity
      sentenceCount: 'Sentences',
      averageSentenceLength: 'Sentence Length / Complexity',
      // Paragraph Structure
      paragraphCount: 'Paragraphs',
      averageParagraphLength: 'Paragraph Structure',
      // Keyword / Entity Usage
      keywordDensity: 'Keyword / Entity Usage',
      // Clarity & Coherence
      clarityScore: 'Clarity & Coherence',
      // Tone & Style
      toneConsistency: 'Tone & Style',
      // Text Ratio
      textToHtmlRatio: 'Text Ratio',
      // Missing / Weak Info
      thinContent: 'Thin Content',
      thinContentReason: 'Thin Content Reason',
      duplicateContent: 'Duplicate Content',
      duplicateWithUrls: 'Duplicate URLs',
      sectionWordCountMapping: 'Section Word Count',
      sectionWordCountBreakdown: 'Section Breakdown',
      headingWordCountMapping: 'Heading Word Count',
    }
    return labels[column] || column
  }

  const getScoreColor = (score: number | null | undefined): string => {
    if (score == null) return 'bg-gray-500/20 text-gray-300'
    if (score >= 80) return 'bg-green-500/20 text-green-300 border-green-500/30'
    if (score >= 60) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
    if (score >= 40) return 'bg-orange-500/20 text-orange-300 border-orange-500/30'
    return 'bg-red-500/20 text-red-300 border-red-500/30'
  }

  const renderTableHeader = (column: keyof TextQualityData) => {
    const isSorted = sortField === column
    return (
      <th
        key={String(column)}
        onClick={() => handleSort(column)}
        className="px-3 py-2 text-left text-xs font-semibold text-white/80 uppercase tracking-wider cursor-pointer hover:bg-white/10 transition-colors whitespace-nowrap"
      >
        <div className="flex items-center gap-1">
          <span>{getColumnLabel(column)}</span>
          {isSorted && (
            sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          )}
        </div>
      </th>
    )
  }

  const getBadgeClass = (level: 'good' | 'warning' | 'bad' | 'neutral') => {
    switch (level) {
      case 'good':
        return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'warning':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'bad':
        return 'bg-red-500/20 text-red-300 border-red-500/30'
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30'
    }
  }

  const renderCellContent = (page: TextQualityData, column: keyof TextQualityData) => {
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
            <span className="truncate max-w-xs">{page.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )
      case 'title':
        return <span title={page.title} className="line-clamp-2">{page.title || 'Untitled'}</span>
      case 'success':
        return (
          <Badge className={page.success ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}>
            {page.success ? 'Yes' : 'No'}
          </Badge>
        )
      case 'timestamp':
        return <span className="text-[10px]">{new Date(page.timestamp).toLocaleString()}</span>
      
      // Analytical columns with badges
      case 'averageSentenceLength': {
        const info = classifySentenceComplexity(page.averageSentenceLength)
        return (
          <div className="flex flex-col gap-1 items-center">
            <Badge className={getBadgeClass(info.level)}>{info.label}</Badge>
            {page.averageSentenceLength != null && (
              <span className="text-[10px] text-white/60">
                {page.averageSentenceLength.toFixed(1)} words/sentence
              </span>
            )}
            {page.sentenceCount != null && (
              <span className="text-[10px] text-white/40">
                {page.sentenceCount} sentences
              </span>
            )}
          </div>
        )
      }
      
      case 'averageParagraphLength': {
        const info = classifyParagraphStructure(page.averageParagraphLength, page.paragraphCount)
        return (
          <div className="flex flex-col gap-1 items-center">
            <Badge className={getBadgeClass(info.level)}>{info.label}</Badge>
            {page.averageParagraphLength != null && (
              <span className="text-[10px] text-white/60">
                {page.averageParagraphLength.toFixed(1)} words/paragraph
              </span>
            )}
            {page.paragraphCount != null && (
              <span className="text-[10px] text-white/40">
                {page.paragraphCount} paragraphs
              </span>
            )}
          </div>
        )
      }
      
      case 'keywordDensity': {
        const info = classifyKeywordDensity(page.keywordDensity)
        return (
          <div className="flex flex-col gap-1 items-center">
            <Badge className={getBadgeClass(info.level)}>{info.label}</Badge>
            {page.keywordDensity != null && (
              <span className="text-[10px] text-white/60">
                {page.keywordDensity.toFixed(2)}% density
              </span>
            )}
          </div>
        )
      }
      
      case 'clarityScore': {
        const clarity = computeClarityScore(page)
        return (
          <div className="flex flex-col gap-1 items-center">
            <Badge className={getBadgeClass(clarity.level)}>{clarity.label}</Badge>
            <span className="text-[10px] text-white/60">
              Score: {clarity.score}/100
            </span>
          </div>
        )
      }
      
      case 'toneConsistency': {
        const tone = classifyToneConsistency(page)
        return (
          <Badge className={getBadgeClass(tone.level)}>{tone.label}</Badge>
        )
      }
      
      case 'textToHtmlRatio': {
        const info = classifyTextRatio(page.textToHtmlRatio)
        return (
          <div className="flex flex-col gap-1 items-center">
            <Badge className={getBadgeClass(info.level)}>{info.label}</Badge>
            {page.textToHtmlRatio != null && (
              <span className="text-[10px] text-white/60">
                {page.textToHtmlRatio.toFixed(2)}% text
              </span>
            )}
          </div>
        )
      }
      
      // Boolean fields
      case 'thinContent': {
        const missingInfo = classifyMissingInfo(page)
        return (
          <div className="flex flex-col gap-1 items-center">
            <Badge className={getBadgeClass(missingInfo.level)}>{missingInfo.label}</Badge>
            {page.thinContent && page.thinContentReason && (
              <span className="text-[10px] text-red-300" title={page.thinContentReason}>
                {page.thinContentReason.substring(0, 30)}{page.thinContentReason.length > 30 ? '...' : ''}
              </span>
            )}
          </div>
        )
      }
      
      case 'duplicateContent':
        return value != null ? (
          <Badge className={value ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}>
            {value ? 'Yes' : 'No'}
          </Badge>
        ) : 'N/A'
      
      // Numeric fields
      case 'totalWordCount':
      case 'visibleWordCount':
      case 'uniqueWordCount':
      case 'sentenceCount':
      case 'paragraphCount':
        return value != null ? <span className="font-mono">{value}</span> : 'N/A'
      
      // Text fields
      case 'thinContentReason':
        return value ? (
          <span className="text-[10px]" title={String(value)}>
            {String(value).substring(0, 50)}{String(value).length > 50 ? '...' : ''}
          </span>
        ) : 'N/A'
      
      // Array fields
      case 'duplicateWithUrls':
        return value && Array.isArray(value) && value.length > 0 ? (
          <Badge className="bg-orange-500/20 text-orange-300">
            {value.length} URLs
          </Badge>
        ) : 'N/A'
      
      // JSON fields
      case 'sectionWordCountMapping':
      case 'sectionWordCountBreakdown':
      case 'headingWordCountMapping':
        return value ? (
          <Badge className="bg-purple-500/20 text-purple-300">
            View Data
          </Badge>
        ) : 'N/A'
      
      default:
        return value != null ? String(value) : 'N/A'
    }
  }

  // Calculate average scores
  const calculateAverages = () => {
    if (data.length === 0) return null
    
    const sum = (key: keyof TextQualityData) => 
      data.reduce((acc, item) => acc + (Number(item[key]) || 0), 0)
    
    const countNonNull = (key: keyof TextQualityData) =>
      data.filter(item => item[key] != null).length
    
    const avgTotalWords = data.length > 0 ? (sum('totalWordCount') / data.length).toFixed(0) : '0'
    const avgSentenceLength = countNonNull('averageSentenceLength') > 0 ? (sum('averageSentenceLength') / countNonNull('averageSentenceLength')).toFixed(1) : '0'
    const avgParagraphLength = countNonNull('averageParagraphLength') > 0 ? (sum('averageParagraphLength') / countNonNull('averageParagraphLength')).toFixed(1) : '0'
    const avgTextRatio = countNonNull('textToHtmlRatio') > 0 ? (sum('textToHtmlRatio') / countNonNull('textToHtmlRatio')).toFixed(1) : '0'
    const thinContentCount = data.filter(item => item.thinContent === true).length
    const duplicateContentCount = data.filter(item => item.duplicateContent === true).length
    
    return {
      avgTotalWords,
      avgSentenceLength,
      avgParagraphLength,
      avgTextRatio,
      thinContentCount,
      duplicateContentCount,
    }
  }

  const averages = calculateAverages()

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

            {/* URL Filter */}
            <div className="mb-4">
              <label className="text-xs text-white/60 mb-1 block">Filter by URL</label>
              <Input
                placeholder="URL..."
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
                placeholder="Search by URL, title, or thin content reason..."
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
        {averages && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="text-xs text-white/60">Avg Total Words</div>
              <div className="text-xl font-bold text-white mt-1">{averages.avgTotalWords}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="text-xs text-white/60">Avg Sentence Length</div>
              <div className="text-xl font-bold text-white mt-1">{averages.avgSentenceLength}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="text-xs text-white/60">Avg Paragraph Length</div>
              <div className="text-xl font-bold text-white mt-1">{averages.avgParagraphLength}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="text-xs text-white/60">Avg Text Ratio</div>
              <div className="text-xl font-bold text-white mt-1">{averages.avgTextRatio}%</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="text-xs text-white/60">Thin Content</div>
              <div className="text-xl font-bold text-red-300 mt-1">{averages.thinContentCount}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="text-xs text-white/60">Duplicate Content</div>
              <div className="text-xl font-bold text-orange-300 mt-1">{averages.duplicateContentCount}</div>
            </div>
          </div>
        )}

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
                      No data found. {(searchQuery || urlFilter) && 'Try adjusting your filters.'}
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((page) => (
                    <tr 
                      key={page.id}
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
