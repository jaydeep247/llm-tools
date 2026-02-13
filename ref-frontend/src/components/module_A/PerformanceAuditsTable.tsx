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
  ChevronRight,
  Play
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
// import { useGetAuditResultsQuery, useStartAuditMutation } from '@/store/api/module_A/auditApi'

interface AuditItem {
  id: string
  url: string
  device: 'mobile' | 'desktop'
  runAt: string
  LCP_ms?: number
  TBT_ms?: number
  CLS?: number
  FCP_ms?: number
  TTFB_ms?: number
  performanceScore?: number
  psiReportUrl?: string
}

interface PerformanceAuditsTableProps {
  sessionId: number
  sessionStatus?: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
}

type SortField = keyof AuditItem
type SortDirection = 'asc' | 'desc'

type ColumnCategory = {
  name: string
  columns: (keyof AuditItem)[]
}

const COLUMN_CATEGORIES: ColumnCategory[] = [
  {
    name: 'Basic Info',
    columns: ['runAt', 'device', 'url', 'performanceScore']
  },
  {
    name: 'Core Web Vitals',
    columns: ['LCP_ms', 'TBT_ms', 'CLS', 'FCP_ms', 'TTFB_ms']
  },
  {
    name: 'Reports',
    columns: ['psiReportUrl']
  }
]

const DEFAULT_VISIBLE_COLUMNS: Set<keyof AuditItem> = new Set(['runAt', 'device', 'url', 'performanceScore', 'LCP_ms', 'TBT_ms', 'CLS'])

export function PerformanceAuditsTable({ 
  sessionId,
  sessionStatus = 'completed',
  isLoading: externalLoading = false,
  onRefresh,
  onExport 
}: PerformanceAuditsTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'mobile' | 'desktop'>('all')
  const [sortField, setSortField] = useState<SortField>('runAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [visibleColumns, setVisibleColumns] = useState<Set<keyof AuditItem>>(DEFAULT_VISIBLE_COLUMNS)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const itemsPerPage = 20
  const [isAuditing, setIsAuditing] = useState(false)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // API calls removed
  const apiData = { items: [] }
  const isLoadingData = false
  const refetch = () => {}
  const startAudit = (arg: any) => ({ unwrap: async () => {} })
  const isStartingAudit = false

  const data: AuditItem[] = apiData?.items || []
  const isLoading = externalLoading || isLoadingData || isAuditing

  // Sync isAuditing with sessionStatus from parent (SSE updates)
  useEffect(() => {
    if (sessionStatus === 'auditing') {
      setIsAuditing(true)
    } else if (sessionStatus === 'completed' && isAuditing) {
      // When session completes, stop auditing state
      setIsAuditing(false)
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      // Refetch to get the completed audit results
      refetch()
    }
  }, [sessionStatus])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current)
      }
    }
  }, [])

  // Filter data based on search
  const filteredData = useMemo(() => {
    let filtered = data

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(item => 
        item.url.toLowerCase().includes(query) ||
        item.device.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [data, searchQuery])

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

  const toggleColumn = (column: keyof AuditItem) => {
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
  const getOrderedVisibleColumns = (): (keyof AuditItem)[] => {
    const ordered: (keyof AuditItem)[] = []
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

  const getColumnLabel = (column: keyof AuditItem): string => {
    const labels: Record<string, string> = {
      id: 'ID',
      url: 'URL',
      device: 'Device',
      runAt: 'Run Time',
      LCP_ms: 'LCP (ms)',
      TBT_ms: 'TBT (ms)',
      CLS: 'CLS',
      FCP_ms: 'FCP (ms)',
      TTFB_ms: 'TTFB (ms)',
      performanceScore: 'Performance Score',
      psiReportUrl: 'Report'
    }
    return labels[column] || column
  }

  // Columns that support sorting
  const sortableColumns: Set<keyof AuditItem> = new Set([
    'runAt', 'device', 'url', 'LCP_ms', 'TBT_ms', 'CLS', 'FCP_ms', 'TTFB_ms', 'performanceScore'
  ])

  const renderTableHeader = (column: keyof AuditItem) => {
    const isSortable = sortableColumns.has(column)
    const label = getColumnLabel(column)
    const isMinWidthColumn = ['url', 'psiReportUrl'].includes(column as string)
    
    return (
      <th
        key={String(column)}
        className={`px-3 py-2 text-center text-xs font-semibold text-white/80 whitespace-nowrap ${
          isSortable ? 'cursor-pointer hover:bg-white/5 select-none' : ''
        } ${
          isMinWidthColumn 
            ? column === 'url' 
              ? 'min-w-50' 
              : 'w-80'
            : ''
        }`}
        onClick={isSortable ? () => handleSort(column as SortField) : undefined}
      >
        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
          {label} {isSortable && <SortIcon field={column as SortField} />}
        </div>
      </th>
    )
  }

  const getScoreColor = (score?: number) => {
    if (!score) return 'bg-gray-500/20 text-gray-300 border-gray-500/30'
    if (score >= 90) return 'bg-green-500/20 text-green-300 border-green-500/30'
    if (score >= 50) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
    return 'bg-red-500/20 text-red-300 border-red-500/30'
  }

  const getStatusFromVitals = (lcp?: number, tbt?: number, cls?: number): { label: string, color: string } => {
    if (lcp == null && tbt == null && cls == null) return { label: '-', color: 'bg-gray-500/20 text-gray-300' }
    
    const goodLcp = lcp != null && lcp <= 2500
    const goodTbt = tbt != null && tbt <= 200
    const goodCls = cls != null && cls <= 0.1
    const poorLcp = lcp != null && lcp > 4000
    const poorTbt = tbt != null && tbt > 600
    const poorCls = cls != null && cls > 0.25
    
    if (poorLcp || poorTbt || poorCls) return { label: 'Poor', color: 'bg-red-500/20 text-red-300' }
    if (goodLcp && goodTbt && goodCls) return { label: 'Good', color: 'bg-green-500/20 text-green-300' }
    return { label: 'Needs Improvement', color: 'bg-yellow-500/20 text-yellow-300' }
  }

  const formatMs = (value?: number): string => {
    if (value == null || !Number.isFinite(value)) return '-'
    return `${Math.round(value)} ms`
  }

  const formatRunTime = (runAt?: string): string => {
    if (!runAt || String(runAt).trim() === '') return '-'
    const d = new Date(runAt)
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString()
  }

  const formatScore = (value?: number): string => {
    if (value == null || !Number.isFinite(value)) return '-'
    return `${Math.round(value)}/100`
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  const renderCellContent = (item: AuditItem, column: keyof AuditItem) => {
    const value = item[column]

    switch (column) {
      case 'url':
        return (
          <a 
            href={item.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer hover:underline"
          >
            <span>{item.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )
      case 'device':
        return (
          <Badge className={item.device === 'mobile' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}>
            {item.device}
          </Badge>
        )
      case 'runAt':
        return <span className="text-[10px]">{formatRunTime(item.runAt)}</span>
      case 'performanceScore':
        return (
          <Badge className={getScoreColor(item.performanceScore)}>
            {formatScore(item.performanceScore)}
          </Badge>
        )
      case 'LCP_ms':
        return formatMs(item.LCP_ms)
      case 'TBT_ms':
        return formatMs(item.TBT_ms)
      case 'CLS':
        return item.CLS != null ? item.CLS.toFixed(3) : '-'
      case 'FCP_ms':
        return formatMs(item.FCP_ms)
      case 'TTFB_ms':
        return formatMs(item.TTFB_ms)
      case 'psiReportUrl':
        return item.psiReportUrl ? (
          <a 
            href={item.psiReportUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1 cursor-pointer hover:underline"
          >
            Open Report
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : '-'
      default:
        return value != null ? String(value) : '-'
    }
  }

  const handleStartAudit = async () => {
    try {
      setIsAuditing(true)
      // Start the audit for this session
      await startAudit({ sessionId, device: deviceFilter === 'all' ? 'desktop' : deviceFilter }).unwrap()
      
      // Set a timeout to stop showing auditing state after 5 minutes
      const timeoutId = setTimeout(() => {
        setIsAuditing(false)
      }, 300000) // 5 minutes
      
      // Store timeout so we can clear it if needed
      if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current)
      pollIntervalRef.current = timeoutId as any
    } catch (error) {
      console.error('Error starting audit:', error)
      setIsAuditing(false)
    }
  }

  const handleRefresh = () => {
    refetch()
    onRefresh?.()
  }

  const status = getStatusFromVitals(
    paginatedData[0]?.LCP_ms,
    paginatedData[0]?.TBT_ms,
    paginatedData[0]?.CLS
  )

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

            {/* Device Filter */}
            <div className="mb-4">
              <label className="text-xs text-white/60 mb-1 block">Device Filter</label>
              <div className="relative">
                <select
                  value={deviceFilter}
                  onChange={(e) => {
                    setDeviceFilter(e.target.value as 'all' | 'mobile' | 'desktop')
                    setCurrentPage(1)
                  }}
                  className="w-full bg-white/5 border border-white/20 text-white text-xs h-8 rounded-full px-3 pr-8 cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Devices</option>
                  <option value="mobile">Mobile</option>
                  <option value="desktop">Desktop</option>
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-3 h-3 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Column Visibility by Category */}
            <div className="space-y-3">
              {COLUMN_CATEGORIES.map((category) => {
                const { visible, total } = getCategoryVisibleCount(category)
                return (
                  <div key={category.name} className="space-y-2">
                    <button
                      onClick={() => toggleCategoryColumns(category)}
                      className="flex items-center justify-between w-full text-xs font-medium text-white/80 hover:text-white cursor-pointer"
                    >
                      <span>{category.name}</span>
                      <span className="text-white/40">{visible}/{total}</span>
                    </button>
                    <div className="space-y-1 pl-2">
                      {category.columns.map((column) => (
                        <label
                          key={String(column)}
                          className="flex items-center gap-2 text-xs text-white/70 hover:text-white cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns.has(column)}
                            onChange={() => toggleColumn(column)}
                            className="rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-0 cursor-pointer"
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

        {/* Start Auditing Button */}
        <div className="mb-4">
          <Button
            onClick={handleStartAudit}
            disabled={isStartingAudit || isAuditing}
            className="bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-500 disabled:cursor-not-allowed cursor-pointer"
          >
            <Play className={`h-4 w-4 mr-2 ${(isStartingAudit || isAuditing) ? 'animate-spin' : ''}`} />
            {isStartingAudit ? 'Starting Audit...' : isAuditing ? 'Auditing in Progress...' : 'Start Auditing'}
          </Button>
        </div>

        {/* Header with Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
          <div className="flex-1 w-full sm:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                placeholder="Search by URL or device..."
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
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/20 text-white hover:bg-white/10"
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
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
            <div className="text-xs text-white/60">Total Audits</div>
            <div className="text-xl font-bold text-white mt-1">{data.length}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/60">Filtered</div>
            <div className="text-xl font-bold text-white mt-1">{filteredData.length}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/60">Avg Performance</div>
            <div className="text-xl font-bold text-white mt-1">
              {data.length > 0 
                ? Math.round(data.reduce((sum, p) => sum + (p.performanceScore || 0), 0) / data.length) 
                : 0}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/60">Status</div>
            <div className="mt-1">
              <Badge className={status.color}>{status.label}</Badge>
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
                {isAuditing ? (
                  <tr>
                    <td colSpan={visibleColumns.size} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-3 text-white/80">
                        <RefreshCw className="h-8 w-8 animate-spin text-green-400" />
                        <div className="space-y-1">
                          <p className="text-lg font-semibold">Running Performance Audits...</p>
                          <p className="text-sm text-white/60">Analyzing page performance metrics</p>
                          <p className="text-xs text-white/40 mt-2">This may take a few minutes depending on the number of pages</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : isLoading ? (
                  <tr>
                    <td colSpan={visibleColumns.size} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-white/60">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Loading audits...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.size} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-3 text-white/60">
                        {searchQuery ? (
                          <p>No audits found. Try adjusting your filters.</p>
                        ) : (
                          <>
                            <p className="text-lg">No performance audits available yet</p>
                            <p className="text-sm text-white/40">Click "Start Auditing" above to run performance audits on this session</p>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item) => (
                    <tr 
                      key={item.id}
                      className="hover:bg-white/5 transition-colors"
                    >
                      {orderedVisibleColumns.map((column) => (
                        <td key={String(column)} className="px-3 py-2 text-white/80 text-center whitespace-normal overflow-wrap-break-word">
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
                      className={`cursor-pointer ${
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
