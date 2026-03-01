'use client'

import { useState, useMemo } from 'react'
import { 
  ExternalLink, 
  Download,
  Link as LinkIcon,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface PageLinkData {
  pageId: number
  url: string
  title: string
  outlinks: number
  inlinks: number
  uniqueInlinks: number
  uniqueJsInlinks: number
  percentOfTotal: number
  externalOutlinks: number
  internalOutlinks: number
  linkScore?: number
}

interface LinkData {
  id: number
  sourceUrl: string
  targetUrl: string
  anchorText: string
  position: string
  isInternal: boolean
  rel: string
  nofollow: boolean
  xpath?: string
}

interface LinkStats {
  totalLinks: number
  internalLinks: number
  externalLinks: number
  linksByPosition: Record<string, number>
}

interface LinkAnalysisProps {
  pageStats: PageLinkData[]
  linkStats: LinkStats | null
  isLoading?: boolean
  onPageSelect?: (pageId: number, linkType: 'out' | 'in') => Promise<LinkData[]>
  onRefresh?: () => void
}

export default function LinkAnalysis({ 
  pageStats, 
  linkStats,
  isLoading = false,
  onPageSelect,
  onRefresh 
}: LinkAnalysisProps) {
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null)
  const [linkType, setLinkType] = useState<'out' | 'in'>('out')
  const [pageLinks, setPageLinks] = useState<LinkData[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [linkSearchTerm, setLinkSearchTerm] = useState('')
  const [internalFilter, setInternalFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [computedStats, setComputedStats] = useState<Record<number, Partial<PageLinkData>>>({})
  const itemsPerPage = 20

  // Filter links
  const filteredLinks = useMemo(() => {
    return pageLinks.filter(link => {
      // Internal/External filter
      if (internalFilter !== 'all') {
        if (internalFilter === 'internal' && !link.isInternal) return false
        if (internalFilter === 'external' && link.isInternal) return false
      }
      
      // Search filter
      const searchLower = linkSearchTerm.toLowerCase()
      return (
        link.sourceUrl?.toLowerCase().includes(searchLower) ||
        link.targetUrl?.toLowerCase().includes(searchLower) ||
        link.anchorText?.toLowerCase().includes(searchLower) ||
        link.xpath?.toLowerCase().includes(searchLower)
      )
    })
  }, [pageLinks, linkSearchTerm, internalFilter])

  // Paginate links
  const paginatedLinks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredLinks.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredLinks, currentPage])

  const totalPages = Math.ceil(filteredLinks.length / itemsPerPage)

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1)
  }, [linkSearchTerm, internalFilter, selectedPageId, linkType])

  // Get selected page data with computed stats merged in
  const selectedPage = useMemo(() => {
    const basePage = pageStats.find(p => p.pageId === selectedPageId)
    if (!basePage) return undefined
    
    // Merge with computed stats if available
    const computed = computedStats[selectedPageId!] || {}
    return {
      ...basePage,
      ...computed
    }
  }, [pageStats, selectedPageId, computedStats])


  const handlePageSelect = async (pageId: number) => {
    setSelectedPageId(pageId)
    if (onPageSelect) {
      setLoadingLinks(true)
      try {
        const links = await onPageSelect(pageId, linkType)
        setPageLinks(links)
        
        // Compute stats from the loaded links
        const stats = computePageStats(links, linkType)
        setComputedStats(prev => ({
          ...prev,
          [pageId]: stats
        }))
      } catch (error) {
        console.error('Error loading links:', error)
      } finally {
        setLoadingLinks(false)
      }
    }
  }

  const handleLinkTypeChange = async (type: 'out' | 'in') => {
    setLinkType(type)
    if (selectedPageId && onPageSelect) {
      setLoadingLinks(true)
      try {
        const links = await onPageSelect(selectedPageId, type)
        setPageLinks(links)
        
        // Compute stats from the loaded links
        const stats = computePageStats(links, type)
        setComputedStats(prev => ({
          ...prev,
          [selectedPageId]: stats
        }))
      } catch (error) {
        console.error('Error loading links:', error)
      } finally {
        setLoadingLinks(false)
      }
    }
  }

  // Compute page-level statistics from link data
  const computePageStats = (links: LinkData[], type: 'out' | 'in'): Partial<PageLinkData> => {
    if (links.length === 0) return {}
    
    const internalLinks = links.filter(l => l.isInternal)
    const externalLinks = links.filter(l => !l.isInternal)
    
    // Get unique URLs
    const uniqueTargets = new Set(links.map(l => l.targetUrl))
    const uniqueSources = new Set(links.map(l => l.sourceUrl))
    
    return {
      outlinks: type === 'out' ? links.length : undefined,
      inlinks: type === 'in' ? links.length : undefined,
      uniqueInlinks: type === 'in' ? uniqueSources.size : undefined,
      externalOutlinks: type === 'out' ? externalLinks.length : undefined,
      internalOutlinks: type === 'out' ? internalLinks.length : undefined,
    }
  }

  const getLinkScoreColor = (score?: number) => {
    if (!score) return 'text-zinc-500'
    if (score >= 80) return 'text-green-400'
    if (score >= 60) return 'text-blue-400'
    if (score >= 40) return 'text-yellow-400'
    if (score >= 20) return 'text-orange-400'
    return 'text-red-400'
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      {/* Stats Summary */}
      {linkStats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-800/50">
            <div className="text-3xl font-bold text-white">{linkStats.totalLinks}</div>
            <div className="text-sm text-zinc-400 uppercase">Total Links</div>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-800/50">
            <div className="text-3xl font-bold text-white">{linkStats.internalLinks}</div>
            <div className="text-sm text-zinc-400 uppercase">Internal</div>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-800/50">
            <div className="text-3xl font-bold text-white">{linkStats.externalLinks}</div>
            <div className="text-sm text-zinc-400 uppercase">External</div>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-800/50">
            <div className="text-3xl font-bold text-white">
              {pageStats.reduce((sum, page) => sum + (page.uniqueInlinks || 0), 0)}
            </div>
            <div className="text-sm text-zinc-400 uppercase">Unique Inlinks</div>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-800/50">
            <div className="text-3xl font-bold text-white">
              {pageStats.reduce((sum, page) => sum + (page.uniqueJsInlinks || 0), 0)}
            </div>
            <div className="text-sm text-zinc-400 uppercase">Unique JS Inlinks</div>
          </div>
          {linkStats.linksByPosition && linkStats.linksByPosition['Main'] !== undefined && (
            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-800/50">
              <div className="text-3xl font-bold text-white">{linkStats.linksByPosition['Main']}</div>
              <div className="text-sm text-zinc-400 uppercase">Main</div>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area with Sidebar and Links Table */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar - Page Selector */}
        <div className="w-80 shrink-0 rounded-lg border border-zinc-800 bg-zinc-800/50 overflow-hidden flex flex-col max-h-[calc(100vh-20rem)]">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="text-lg font-semibold text-white">Select Page</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {pageStats.map((page) => (
              <button
                key={page.pageId}
                onClick={() => handlePageSelect(page.pageId)}
                className={`w-full p-4 text-left border-b border-zinc-800/50 transition-colors hover:bg-zinc-800 cursor-pointer ${
                  selectedPageId === page.pageId ? 'bg-zinc-800' : ''
                }`}
              >
                <div className="text-sm font-medium text-white mb-1 truncate">{page.title}</div>
                <div className="text-xs text-blue-400 truncate">{page.url}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Links Content */}
        <div className="flex-1 rounded-lg border border-zinc-800 bg-zinc-800/50 overflow-hidden flex flex-col max-h-[calc(100vh-20rem)]">
          {/* Controls */}
          <div className="p-4 border-b border-zinc-800 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-200 font-medium">Link Type:</label>
              <div className="relative">
                <select
                  value={linkType}
                  onChange={(e) => handleLinkTypeChange(e.target.value as 'out' | 'in')}
                  className="px-3 py-2 pr-8 rounded-full bg-zinc-800/50 border border-zinc-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none"
                >
                  <option value="out">Outlinks</option>
                  <option value="in">Inlinks</option>
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-3 h-3 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-200 font-medium">Type:</label>
              <div className="relative">
                <select
                  value={internalFilter}
                  onChange={(e) => setInternalFilter(e.target.value)}
                  className="px-3 py-2 pr-8 rounded-full bg-zinc-800/50 border border-zinc-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none"
                >
                  <option value="all">All</option>
                  <option value="internal">INTERNAL</option>
                  <option value="external">EXTERNAL</option>
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-3 h-3 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            <input
              type="text"
              placeholder="Search links..."
              value={linkSearchTerm}
              onChange={(e) => setLinkSearchTerm(e.target.value)}
              className="flex-1 min-w-50 px-3 py-2 rounded-md bg-zinc-800/50 border border-zinc-800 text-white placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              className="px-4 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          {/* Links Table */}
          {loadingLinks ? (
            <div className="flex-1 flex items-center justify-center text-zinc-400">
              Loading links...
            </div>
          ) : selectedPageId && paginatedLinks.length > 0 ? (
            <>
              <div className="flex-1 overflow-auto">
                <table className="w-full">
                  <thead className="bg-gray-900 border-b border-zinc-700 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-white whitespace-nowrap min-w-50">
                        Anchor Text
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-white whitespace-nowrap min-w-75">
                        {linkType === 'in' ? 'Source URL' : 'Target URL'}
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                        Position
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                        Type
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                        Outlinks
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                        Inlinks
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                        Unique Inlinks
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                        JS Inlinks
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                        % Total
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                        External Out
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                        Internal Out
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap">
                        Link Score
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-white whitespace-nowrap min-w-75">
                        XPath
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLinks.map((link) => (
                      <tr
                        key={link.id}
                        className="border-t border-zinc-800/50 hover:bg-zinc-800/50 transition-colors"
                      >
                        <td className="px-3 py-2 text-zinc-200 text-sm whitespace-normal overflow-wrap-break-word">
                          {link.anchorText || <span className="text-zinc-500">(empty)</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-normal overflow-wrap-break-word">
                          <a
                            href={linkType === 'in' ? link.sourceUrl : link.targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            {linkType === 'in' ? link.sourceUrl : link.targetUrl}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal overflow-wrap-break-word">
                          <Badge variant="outline" className="text-xs">
                            {link.position || '-'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal overflow-wrap-break-word">
                          <Badge 
                            variant={link.isInternal ? 'default' : 'secondary'} 
                            className={`text-xs ${
                              link.isInternal 
                                ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                                : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {link.isInternal ? 'INTERNAL' : 'EXTERNAL'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal overflow-wrap-break-word">
                          <Badge variant="outline" className="text-xs">
                            {selectedPage?.outlinks || 0}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal overflow-wrap-break-word">
                          <Badge variant="outline" className="text-xs">
                            {selectedPage?.inlinks || 0}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal overflow-wrap-break-word">
                          <Badge variant="outline" className="text-xs text-indigo-400">
                            {selectedPage?.uniqueInlinks || 0}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal overflow-wrap-break-word">
                          <Badge variant="outline" className="text-xs text-amber-400">
                            {selectedPage?.uniqueJsInlinks || 0}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal overflow-wrap-break-word">
                          <Badge variant="outline" className="text-xs text-emerald-400">
                            {selectedPage?.percentOfTotal ? `${selectedPage.percentOfTotal.toFixed(2)}%` : '-'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal overflow-wrap-break-word">
                          <Badge variant="outline" className="text-xs text-orange-400">
                            {selectedPage?.externalOutlinks || 0}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal overflow-wrap-break-word">
                          <Badge variant="outline" className="text-xs text-green-400">
                            {selectedPage?.internalOutlinks || 0}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal overflow-wrap-break-word">
                          <span className={`text-sm font-semibold ${getLinkScoreColor(selectedPage?.linkScore)}`}>
                            {selectedPage?.linkScore ? selectedPage.linkScore.toFixed(1) : '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-500 font-mono whitespace-normal overflow-wrap-break-word">
                          {link.xpath || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
                  <div className="text-sm text-zinc-400">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredLinks.length)} of {filteredLinks.length} results
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-md bg-zinc-800/50 border border-zinc-700 text-white hover:bg-zinc-800 disabled:opacity-50 text-sm cursor-pointer"
                    >
                      Previous
                    </button>
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
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-3 py-1.5 rounded-md text-sm cursor-pointer ${
                              currentPage === pageNum
                                ? 'bg-white text-black'
                                : 'bg-zinc-800/50 border border-zinc-700 text-white hover:bg-zinc-800'
                            }`}
                          >
                            {pageNum}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-md bg-zinc-800/50 border border-zinc-700 text-white hover:bg-zinc-800 disabled:opacity-50 text-sm cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-400">
              {!selectedPageId ? 'Select a page to view links' : 'No links found'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
