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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldTooltip } from './FieldTooltip'

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
  status?: string
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
  closestSemanticallySimilarAddress?: string
  semanticallySimilarCount?: number
  contentHash?: string
  closestDuplicateUrl?: string
  closestDuplicateSimilarity?: number
  nearDuplicateCount: number
  outlinks?: number
  uniqueExternalOutlinks: number
  uniqueExternalJsOutlinks: number
  uniqueOutlinks?: number
  uniqueJsOutlinks?: number
  externalOutlinks?: number
  metaDescription?: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  lastModified?: string
  urlEncodedAddress?: string
  timestamp: string
  // Individual heading fields
  h1_1?: string
  h1_1Length?: number
  h1_2?: string
  h1_2Length?: number
  h2_1?: string
  h2_1Length?: number
  h2_2?: string
  h2_2Length?: number
  // Inlinks
  inlinks?: number
  uniqueInlinks?: number
  uniqueJsInlinks?: number
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
    columns: ['url', 'title', 'statusCode', 'status', 'contentType', 'success', 'timestamp']
  },
  {
    name: 'SEO Meta',
    columns: ['titleLength', 'titlePixelWidth', 'descriptionLength', 'descriptionPixelWidth', 'description', 'metaKeywords', 'metaKeywordsLength']
  },
  {
    name: 'Content Quality',
    columns: ['wordCount', 'sentenceCount', 'averageWordsPerSentence', 'fleschReadingEase', 'readabilityLevel', 'textToHtmlRatio', 'spellingErrors', 'grammarErrors']
  },
  {
    name: 'Heading Structure',
    columns: ['h1_1', 'h1_1Length', 'h1_2', 'h1_2Length', 'h2_1', 'h2_1Length', 'h2_2', 'h2_2Length', 'headingTags']
  },
  {
    name: 'Indexability',
    columns: ['indexable', 'indexabilityStatus', 'metaRobots', 'xRobotsTag', 'metaRefresh', 'canonicalUrl']
  },
  {
    name: 'Links',
    columns: ['inlinks', 'uniqueInlinks', 'uniqueJsInlinks', 'outlinks', 'uniqueOutlinks', 'uniqueJsOutlinks', 'externalOutlinks', 'uniqueExternalOutlinks', 'uniqueExternalJsOutlinks', 'linkScore']
  },
  {
    name: 'Performance',
    columns: ['responseTime', 'sizeBytes', 'transferredBytes', 'totalTransferredBytes', 'co2Mg', 'carbonRating']
  },
  {
    name: 'Semantic & Duplicates',
    columns: ['semanticSimilarityScore', 'semanticRelevanceScore', 'closestSemanticallySimilarAddress', 'semanticallySimilarCount', 'nearDuplicateCount', 'closestDuplicateSimilarity', 'closestDuplicateUrl', 'contentHash']
  },
  {
    name: 'Open Graph',
    columns: ['ogTitle', 'ogDescription', 'ogImage']
  },
  {
    name: 'Technical',
    columns: ['crawlDepth', 'folderDepth', 'language', 'httpVersion', 'redirectUrl', 'redirectType', 'cookies']
  },
  {
    name: 'Pagination & Alternate',
    columns: ['relNext', 'relPrev', 'httpRelNext', 'httpRelPrev', 'amphtmlUrl', 'mobileAlternateUrl']
  },
  {
    name: 'Other',
    columns: ['lastModified', 'urlEncodedAddress', 'errorMessage']
  }
]

const FIELD_DESCRIPTIONS: Partial<Record<keyof CrawledPage, string>> = {
  url: 'Full web address of the crawled page. Click to open in a new tab.',
  title: 'HTML <title> tag content shown in browser tabs and Google search results.',
  titleLength: 'Character count of the page title. SEO ideal is 30–60 characters.',
  titlePixelWidth: 'Rendered pixel width of the title as displayed in Google SERP. Maximum is ~600px.',
  description: 'Meta description tag content displayed in search result snippets.',
  descriptionLength: 'Character count of the meta description. SEO ideal is 120–160 characters.',
  descriptionPixelWidth: 'Rendered pixel width of the description in Google SERP. Maximum is ~920px.',
  contentType: 'MIME type of the HTTP response (e.g. text/html, application/pdf).',
  statusCode: 'HTTP response status code. 200=OK, 301=Redirect, 404=Not Found, 500=Server Error.',
  status: 'Human-readable HTTP status label derived from the numeric status code.',
  responseTime: 'Time in seconds from request to full server response. Under 0.5s is ideal.',
  wordCount: 'Total words found in visible page content, excluding navigation and boilerplate.',
  sentenceCount: 'Number of sentences detected in the visible page body text.',
  averageWordsPerSentence: 'Mean words per sentence. Scores under 20 are generally more readable.',
  fleschReadingEase: 'Flesch Reading Ease score (0–100). Higher means easier to read. Target 60+.',
  readabilityLevel: 'Descriptive readability label based on Flesch score (Very Easy → Very Difficult).',
  textToHtmlRatio: 'Percentage of visible text vs. total HTML markup size. Higher is better.',
  spellingErrors: 'Misspelled words detected using a common-word dictionary check.',
  grammarErrors: 'Grammar violations detected via regex pattern matching rules.',
  crawlDepth: 'Number of clicks deep from the crawl start URL where this page was discovered.',
  folderDepth: 'Number of directory levels in the URL path structure.',
  sizeBytes: 'Total HTML page size in bytes. Pages over 500 KB may slow down performance.',
  success: 'Whether the page was successfully fetched without a fatal crawl error.',
  errorMessage: 'Description of any error encountered while crawling this URL.',
  linkScore: 'Quality score for the page link profile based on internal and external links.',
  canonicalUrl: 'Canonical URL declared by the page to consolidate duplicate content signals.',
  amphtmlUrl: 'Link to the AMP (Accelerated Mobile Pages) version of this page.',
  mobileAlternateUrl: 'Alternate URL declared for mobile device visitors via rel="alternate".',
  indexable: 'Whether search engines are permitted to index this page (true/false).',
  indexabilityStatus: 'Reason why the page is or is not indexable by search engines.',
  metaRobots: 'Content of the robots meta tag (e.g. noindex, nofollow, none).',
  xRobotsTag: 'Robots crawl instructions delivered via HTTP response header instead of meta tag.',
  metaRefresh: 'HTML meta refresh directive for automatic page redirect after a timed delay.',
  transferredBytes: 'Actual bytes transferred over the network (typically gzip-compressed).',
  totalTransferredBytes: 'Cumulative bytes transferred including all page sub-resources.',
  co2Mg: 'Estimated CO₂ emissions in milligrams based on this page\'s data transfer size.',
  carbonRating: 'Environmental sustainability rating for this page\'s carbon footprint.',
  semanticSimilarityScore: 'How semantically similar this page is to others in the crawl (0–1 scale).',
  semanticRelevanceScore: 'Content relevance relative to the target keyword context (0–1 scale).',
  closestSemanticallySimilarAddress: 'URL of the most semantically similar page found in this crawl.',
  semanticallySimilarCount: 'Number of pages with high semantic similarity to this page.',
  contentHash: 'MD5 fingerprint of the page content used for exact duplicate detection.',
  closestDuplicateUrl: 'URL of the page most similar in content to this one (near-duplicate).',
  closestDuplicateSimilarity: 'SimHash similarity score (0–1) with the nearest duplicate page.',
  nearDuplicateCount: 'Number of other pages with near-duplicate content similarity to this page.',
  outlinks: 'Total number of outgoing hyperlinks found on this page.',
  uniqueExternalOutlinks: 'Unique links to external domains, deduplicated by target URL.',
  uniqueExternalJsOutlinks: 'Unique external links discovered via JavaScript execution.',
  uniqueOutlinks: 'All outgoing links deduplicated including internal and external.',
  uniqueJsOutlinks: 'Unique outgoing links found within JavaScript (not present in raw HTML).',
  externalOutlinks: 'All outgoing links pointing to other domains before deduplication.',
  metaDescription: 'Raw content of the <meta name="description"> tag.',
  ogTitle: 'Open Graph title used when this page is shared on social media platforms.',
  ogDescription: 'Open Graph description shown in social media link card previews.',
  ogImage: 'Open Graph image URL displayed when this page is shared on social media.',
  lastModified: 'Date and time this page was last modified per the server response header.',
  urlEncodedAddress: 'URL with special characters percent-encoded for safe HTTP transmission.',
  timestamp: 'Date and time when this URL was crawled and data was collected.',
  h1_1: 'Text content of the first H1 heading found on the page.',
  h1_1Length: 'Character count of the first H1 heading text.',
  h1_2: 'Text of the second H1 heading if multiple H1 tags exist (an SEO issue).',
  h1_2Length: 'Character count of the second H1 heading text.',
  h2_1: 'Text content of the first H2 subheading found on the page.',
  h2_1Length: 'Character count of the first H2 subheading text.',
  h2_2: 'Text content of the second H2 subheading on the page.',
  h2_2Length: 'Character count of the second H2 subheading text.',
  inlinks: 'Total internal links from other crawled pages pointing to this URL.',
  uniqueInlinks: 'Deduplicated count of internal pages that link to this URL.',
  uniqueJsInlinks: 'Unique internal links to this page discovered via JavaScript.',
  headingTags: 'All H1–H6 heading tags with text and hierarchy shown as structured JSON.',
  cookies: 'Cookie names and values set by the server response for this page.',
  language: 'Declared language of the page content (e.g. en, fr, de).',
  httpVersion: 'HTTP protocol version used for this connection (HTTP/1.1, HTTP/2, HTTP/3).',
  redirectUrl: 'Destination URL this page redirects to if a redirect status was returned.',
  redirectType: 'Type of redirect (e.g. 301 Permanent, 302 Temporary, 307 Temporary).',
  relNext: 'URL of the next page in a paginated series via rel="next" link tag.',
  relPrev: 'URL of the previous page in a paginated series via rel="prev" link tag.',
  httpRelNext: 'Next page URL declared via HTTP Link header instead of an HTML tag.',
  httpRelPrev: 'Previous page URL declared via HTTP Link header instead of an HTML tag.',
  metaKeywords: 'Meta keywords tag content. Largely ignored by Google but may affect other engines.',
  metaKeywordsLength: 'Character count of the meta keywords tag content.',
}

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
  const [headingDialogData, setHeadingDialogData] = useState<{ url: string; headings: { level: number; tag: string; text: string }[] } | null>(null)
  const itemsPerPage = 20

  const uniqueData = useMemo(() => {
    const seen = new Set<string>()
    const result: CrawledPage[] = []

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

  // Get visible columns in correct order based on COLUMN_CATEGORIES
  const getOrderedVisibleColumns = (): (keyof CrawledPage)[] => {
    const ordered: (keyof CrawledPage)[] = []
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
      responseTime: 'Response Time (s)',
      sizeBytes: 'Size',
      transferredBytes: 'Transferred',
      totalTransferredBytes: 'Total Transferred',
      co2Mg: 'CO₂ (mg)',
      carbonRating: 'Carbon Rating',
      semanticSimilarityScore: 'Semantic Similarity Score',
      semanticRelevanceScore: 'Semantic Relevance Score',
      closestSemanticallySimilarAddress: 'Closest Semantically Similar',
      semanticallySimilarCount: 'No. Semantically Similar',
      nearDuplicateCount: 'No. Near Duplicates',
      closestDuplicateSimilarity: 'Nearest Duplicate Similarity',
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
      httpRelNext: 'HTTP Rel Next',
      httpRelPrev: 'HTTP Rel Prev',
      errorMessage: 'Error Message',
      metaKeywords: 'Meta Keywords',
      metaKeywordsLength: 'Meta Keywords Length',
      metaRefresh: 'Meta Refresh',
      headingTags: 'Heading Tags',
      cookies: 'Cookies',
      amphtmlUrl: 'AMP HTML',
      mobileAlternateUrl: 'Mobile Alternate',
      closestDuplicateUrl: 'Nearest Duplicate URL',
      urlEncodedAddress: 'URL Encoded Address',
      status: 'Status',
      outlinks: 'Outlinks',
      externalOutlinks: 'External Outlinks',
      uniqueJsOutlinks: 'Unique JS Outlinks',
      h1_1: 'H1-1',
      h1_1Length: 'H1-1 Length',
      h1_2: 'H1-2',
      h1_2Length: 'H1-2 Length',
      h2_1: 'H2-1',
      h2_1Length: 'H2-1 Length',
      h2_2: 'H2-2',
      h2_2Length: 'H2-2 Length',
      inlinks: 'Inlinks',
      uniqueInlinks: 'Unique Inlinks',
      uniqueJsInlinks: 'Unique JS Inlinks',
      metaDescription: 'Meta Description',
    }
    return labels[column] || column
  }

  // Columns that support sorting
  const sortableColumns: Set<keyof CrawledPage> = new Set([
    'id', 'url', 'title', 'titleLength', 'titlePixelWidth', 'descriptionLength', 'descriptionPixelWidth',
    'contentType', 'statusCode', 'status', 'responseTime', 'wordCount', 'sentenceCount', 'averageWordsPerSentence',
    'fleschReadingEase', 'readabilityLevel', 'textToHtmlRatio', 'spellingErrors', 'grammarErrors',
    'crawlDepth', 'folderDepth', 'indexable', 'outlinks', 'uniqueExternalOutlinks', 'uniqueExternalJsOutlinks',
    'uniqueOutlinks', 'uniqueJsOutlinks', 'externalOutlinks', 'linkScore', 'sizeBytes', 'transferredBytes', 'totalTransferredBytes', 'co2Mg',
    'semanticSimilarityScore', 'semanticRelevanceScore', 'closestSemanticallySimilarAddress', 'semanticallySimilarCount', 'nearDuplicateCount', 'closestDuplicateSimilarity',
    'metaKeywordsLength', 'timestamp', 'success', 'inlinks', 'uniqueInlinks', 'uniqueJsInlinks',
    'h1_1Length', 'h1_2Length', 'h2_1Length', 'h2_2Length'
  ])

  const renderTableHeader = (column: keyof CrawledPage) => {
    const isSortable = sortableColumns.has(column)
    const label = getColumnLabel(column)
    const isMinWidthColumn = ['url', 'description', 'canonicalUrl', 'errorMessage', 'headingTags', 'ogTitle', 'ogDescription', 'ogImage', 'cookies', 'amphtmlUrl', 'mobileAlternateUrl', 'redirectUrl', 'closestDuplicateUrl', 'closestSemanticallySimilarAddress', 'urlEncodedAddress', 'metaKeywords', 'h1_1', 'h1_2', 'h2_1', 'h2_2'].includes(column as string)
    
    return (
      <th
        key={String(column)}
        className={`px-3 py-2 text-center text-xs font-semibold text-zinc-200 whitespace-nowrap ${
          isSortable ? 'cursor-pointer hover:bg-zinc-800/50' : ''
        } ${
          isMinWidthColumn 
            ? column === 'url' || column === 'description' 
              ? 'min-w-50' 
              : 'w-80'
            : ''
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

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) return 'bg-green-500/20 text-green-300 border-green-500/30'
    if (statusCode >= 300 && statusCode < 400) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
    if (statusCode >= 400 && statusCode < 500) return 'bg-orange-500/20 text-orange-300 border-orange-500/30'
    return 'bg-red-500/20 text-red-300 border-red-500/30'
  }

  const formatBytes = (bytes?: number) => {
    if (bytes === null || bytes === undefined) return '-'
    if (bytes === 0) return '0 B'
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
        return page.textToHtmlRatio != null ? `${Number(page.textToHtmlRatio).toFixed(2)}%` : '-'
      case 'averageWordsPerSentence':
        return page.averageWordsPerSentence != null ? Number(page.averageWordsPerSentence).toFixed(1) : '-'
      case 'fleschReadingEase':
        return page.fleschReadingEase != null ? Number(page.fleschReadingEase).toFixed(1) : '-'
      case 'linkScore':
        return page.linkScore != null ? Number(page.linkScore).toFixed(2) : '-'
      case 'co2Mg':
        return page.co2Mg != null ? Number(page.co2Mg).toFixed(2) : '-'
      case 'carbonRating':
        return page.carbonRating ? <Badge className="bg-green-500/20 text-green-300">{page.carbonRating}</Badge> : '-'
      case 'semanticSimilarityScore':
        return page.semanticSimilarityScore != null ? Number(page.semanticSimilarityScore).toFixed(2) : '-'
      case 'semanticRelevanceScore':
        return page.semanticRelevanceScore != null ? Number(page.semanticRelevanceScore).toFixed(2) : '-'
      case 'closestSemanticallySimilarAddress':
        return page.closestSemanticallySimilarAddress ? (
          <a href={page.closestSemanticallySimilarAddress} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300" title={page.closestSemanticallySimilarAddress}>
            {page.closestSemanticallySimilarAddress}
          </a>
        ) : '-'
      case 'semanticallySimilarCount':
        return value != null ? String(value) : '0'
      case 'closestDuplicateSimilarity':
        return page.closestDuplicateSimilarity != null ? Number(page.closestDuplicateSimilarity).toFixed(4) : '-'
      case 'contentHash':
        return page.contentHash ? (
          <span className="font-mono text-[10px]" title={page.contentHash}>
            {page.contentHash}
          </span>
        ) : '-'
      case 'canonicalUrl':
        return page.canonicalUrl ? (
          <a href={page.canonicalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300" title={page.canonicalUrl}>
            {page.canonicalUrl}
          </a>
        ) : '-'
      case 'indexabilityStatus':
        return <span title={page.indexabilityStatus || ''}>{page.indexabilityStatus || '-'}</span>
      case 'description':
        return <span title={page.description}>{page.description || '-'}</span>
      case 'errorMessage':
        return page.errorMessage ? (
          <span className="text-red-300" title={page.errorMessage}>{page.errorMessage}</span>
        ) : '-'
      case 'ogTitle':
        return page.ogTitle ? <span title={page.ogTitle}>{page.ogTitle}</span> : '-'
      case 'ogDescription':
        return page.ogDescription ? <span title={page.ogDescription}>{page.ogDescription}</span> : '-'
      case 'ogImage':
        return page.ogImage ? (
          <a href={page.ogImage} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300" title={page.ogImage}>
            {page.ogImage}
          </a>
        ) : '-'
      case 'headingTags': {
        if (!page.headingTags) return '-'
        try {
          const headings = JSON.parse(page.headingTags)
          if (!Array.isArray(headings) || headings.length === 0) return '-'
          return (
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-400 hover:text-blue-300 hover:bg-zinc-800/60 h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                setHeadingDialogData({ url: page.url, headings })
              }}
            >
              View ({headings.length})
            </Button>
          )
        } catch { return <span title={page.headingTags}>{page.headingTags}</span> }
      }
      case 'h1_1':
        return page.h1_1 ? <span title={page.h1_1}>{page.h1_1}</span> : '-'
      case 'h1_2':
        return page.h1_2 ? <span title={page.h1_2}>{page.h1_2}</span> : '-'
      case 'h2_1':
        return page.h2_1 ? <span title={page.h2_1}>{page.h2_1}</span> : '-'
      case 'h2_2':
        return page.h2_2 ? <span title={page.h2_2}>{page.h2_2}</span> : '-'
      case 'h1_1Length':
      case 'h1_2Length':
      case 'h2_1Length':
      case 'h2_2Length':
        return value != null ? String(value) : '-'
      case 'inlinks':
      case 'uniqueInlinks':
      case 'uniqueJsInlinks':
        return value != null ? String(value) : '0'
      case 'cookies':
        return page.cookies ? <span className="text-[10px]" title={page.cookies}>{page.cookies}</span> : '-'
      case 'amphtmlUrl':
        return page.amphtmlUrl ? (
          <a href={page.amphtmlUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300" title={page.amphtmlUrl}>{page.amphtmlUrl}</a>
        ) : '-'
      case 'mobileAlternateUrl':
        return page.mobileAlternateUrl ? (
          <a href={page.mobileAlternateUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300" title={page.mobileAlternateUrl}>{page.mobileAlternateUrl}</a>
        ) : '-'
      case 'closestDuplicateUrl':
        return page.closestDuplicateUrl ? (
          <a href={page.closestDuplicateUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300" title={page.closestDuplicateUrl}>{page.closestDuplicateUrl}</a>
        ) : '-'
      case 'status':
        return page.status ? <Badge className={getStatusColor(page.statusCode)}>{page.status}</Badge> : '-'
      case 'httpRelNext':
        return page.httpRelNext || '-'
      case 'httpRelPrev':
        return page.httpRelPrev || '-'
      case 'metaRefresh':
        return page.metaRefresh || '-'
      case 'urlEncodedAddress':
        return page.urlEncodedAddress ? <span className="font-mono text-[10px]" title={page.urlEncodedAddress}>{page.urlEncodedAddress}</span> : '-'
      case 'redirectUrl':
        return <span title={page.redirectUrl || ''}>{page.redirectUrl || '-'}</span>
      case 'redirectType':
        return <span>{page.redirectType || '-'}</span>
      case 'metaKeywords':
        return <span title={page.metaKeywords || ''}>{page.metaKeywords || '-'}</span>
      case 'relNext':
        return page.relNext ? '✓' : '-'
      case 'relPrev':
        return page.relPrev ? '✓' : '-'
      case 'metaRobots':
        return page.metaRobots || '-'
      case 'xRobotsTag':
        return page.xRobotsTag || '-'
      case 'lastModified': {
        if (!page.lastModified) return '-'
        const d = new Date(page.lastModified)
        return isNaN(d.getTime()) ? page.lastModified : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      }
      case 'responseTime':
        return page.responseTime != null ? `${Number(page.responseTime).toFixed(3)}s` : '-'
      default:
        return value != null && String(value).trim() !== '' ? String(value) : '-'
    }
  }

  return (
    <div className="flex gap-3 h-full">
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

        {/* Header with Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
          <div className="flex-1 w-full sm:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search by URL, title, or description..."
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Total Pages</div>
            <div className="text-xl font-bold text-white mt-1">{uniqueData.length}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Filtered</div>
            <div className="text-xl font-bold text-white mt-1">{filteredData.length}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Avg Word Count</div>
            <div className="text-xl font-bold text-white mt-1">
              {uniqueData.length > 0 ? Math.round(uniqueData.reduce((sum, p) => sum + p.wordCount, 0) / uniqueData.length) : 0}
            </div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Success Rate</div>
            <div className="text-xl font-bold text-white mt-1">
              {uniqueData.length > 0 ? `${((uniqueData.filter(p => p.success).length / uniqueData.length) * 100).toFixed(1)}%` : '0%'}
            </div>
          </div>
        </div>

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
                  paginatedData.map((page) => (
                    <tr 
                      key={page.id}
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
          <div className="flex items-center justify-between mt-3">
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

      {/* Heading Structure Dialog */}
      <Dialog open={!!headingDialogData} onOpenChange={(open) => { if (!open) setHeadingDialogData(null) }}>
        <DialogContent className="bg-[#0D0D10] border-zinc-800 max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white text-sm font-semibold">Heading Structure</DialogTitle>
            {headingDialogData && (
              <p className="text-zinc-400 text-xs truncate mt-1" title={headingDialogData.url}>{headingDialogData.url}</p>
            )}
          </DialogHeader>
          {headingDialogData && (
            <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar py-3 space-y-3">
              {headingDialogData.headings.map((h, i) => {
                const textStyles: Record<number, string> = {
                  1: 'text-2xl font-bold text-white',
                  2: 'text-xl font-semibold text-white',
                  3: 'text-lg font-semibold text-zinc-200',
                  4: 'text-base font-medium text-zinc-300',
                  5: 'text-sm font-medium text-zinc-400',
                  6: 'text-xs font-medium text-zinc-400',
                }
                const tagColors: Record<number, string> = {
                  1: 'text-blue-400',
                  2: 'text-purple-400',
                  3: 'text-green-400',
                  4: 'text-yellow-400',
                  5: 'text-orange-400',
                  6: 'text-red-400',
                }
                const spacing: Record<number, string> = {
                  1: 'mt-4 mb-2',
                  2: 'mt-3 mb-1.5',
                  3: 'mt-2 mb-1',
                  4: 'mt-1.5 mb-0.5',
                  5: 'mt-1 mb-0.5',
                  6: 'mt-1 mb-0.5',
                }
                return (
                  <div key={i} className={`px-3 ${i === 0 ? '' : spacing[h.level] || ''}`}>
                    <div className="flex items-baseline gap-2">
                      <span className={`${tagColors[h.level] || tagColors[6]} text-[10px] font-mono uppercase opacity-70 shrink-0`}>
                        h{h.level}
                      </span>
                      <span className={textStyles[h.level] || textStyles[6]}>
                        {h.text}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
