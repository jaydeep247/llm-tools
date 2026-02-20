'use client'

import { useState, useMemo } from 'react'
import { 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  Search,
  Download,
  RefreshCw,
  X,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  Link as LinkIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export interface BrokenLink {
  url: string
  sourceUrl?: string
  statusCode: number
  errorType?: string
  error?: string
  missingType?: string
}

export interface LinkCheckResults {
  brokenInternalLinks: { count: number; links: BrokenLink[] }
  brokenExternalLinks: { count: number; links: BrokenLink[] }
  missingPages: { count: number; links: BrokenLink[] }
  serverErrors: { count: number; links: BrokenLink[] }
  timeoutUnreachable: { count: number; links: BrokenLink[] }
  totalChecked?: number
  totalPageLinks?: number
}

interface BrokenLinkCheckerProps {
  sessionId: string | number
  onCheck?: (sessionId: string | number) => Promise<LinkCheckResults>
  checkResults?: LinkCheckResults | null
  isChecking?: boolean
}

type LinkCategory = 'brokenInternal' | 'brokenExternal' | 'missingPages' | 'serverErrors' | 'timeoutUnreachable'

export default function BrokenLinkChecker({ 
  sessionId, 
  onCheck,
  checkResults,
  isChecking = false 
}: BrokenLinkCheckerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<'url' | 'sourceUrl' | 'statusCode' | 'errorType'>('url')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [selectedCategories, setSelectedCategories] = useState<LinkCategory[]>([
    'brokenInternal',
    'brokenExternal',
    'missingPages',
    'serverErrors',
    'timeoutUnreachable'
  ])
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Flatten all links from different categories
  const allLinks = useMemo(() => {
    if (!checkResults) return []

    const links: (BrokenLink & { category: LinkCategory; categoryLabel: string; categoryColor: string })[] = []

    const categories: { key: LinkCategory; label: string; color: string; data: { count: number; links: BrokenLink[] } }[] = [
      { key: 'brokenInternal', label: 'Broken Internal', color: '#ef4444', data: checkResults.brokenInternalLinks },
      { key: 'brokenExternal', label: 'Broken External', color: '#f59e0b', data: checkResults.brokenExternalLinks },
      { key: 'missingPages', label: 'Missing Page', color: '#dc2626', data: checkResults.missingPages },
      { key: 'serverErrors', label: 'Server Error', color: '#991b1b', data: checkResults.serverErrors },
      { key: 'timeoutUnreachable', label: 'Timeout', color: '#7c2d12', data: checkResults.timeoutUnreachable }
    ]

    categories.forEach(({ key, label, color, data }) => {
      if (selectedCategories.includes(key)) {
        data.links.forEach(link => {
          links.push({
            ...link,
            category: key,
            categoryLabel: label,
            categoryColor: color
          })
        })
      }
    })

    return links
  }, [checkResults, selectedCategories])

  // Filter and search
  const filteredLinks = useMemo(() => {
    return allLinks.filter(link => {
      const searchLower = searchTerm.toLowerCase()
      return (
        link.url.toLowerCase().includes(searchLower) ||
        link.sourceUrl?.toLowerCase().includes(searchLower) ||
        link.errorType?.toLowerCase().includes(searchLower) ||
        link.error?.toLowerCase().includes(searchLower)
      )
    })
  }, [allLinks, searchTerm])

  // Sort
  const sortedLinks = useMemo(() => {
    const sorted = [...filteredLinks]
    sorted.sort((a, b) => {
      let aValue = a[sortField] || ''
      let bValue = b[sortField] || ''
      
      if (sortField === 'statusCode') {
        aValue = a.statusCode || 0
        bValue = b.statusCode || 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredLinks, sortField, sortDirection])

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const toggleCategory = (category: LinkCategory) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const handleCheckLinks = async () => {
    if (onCheck) {
      await onCheck(sessionId)
    }
  }

  const toggleRowExpansion = (url: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(url)) {
        next.delete(url)
      } else {
        next.add(url)
      }
      return next
    })
  }

  const totalIssues = checkResults 
    ? checkResults.brokenInternalLinks.count +
      checkResults.brokenExternalLinks.count +
      checkResults.missingPages.count +
      checkResults.serverErrors.count +
      checkResults.timeoutUnreachable.count
    : 0

  return (
    <div className="w-full h-full flex flex-col gap-4">
      {/* Header with Check Button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <Button
            onClick={handleCheckLinks}
            disabled={isChecking}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isChecking ? (
              <>
                <Clock className="w-4 h-4 mr-2 animate-spin" />
                Checking Links...
              </>
            ) : (
              <>
                <LinkIcon className="w-4 h-4 mr-2" />
                Check Links
              </>
            )}
          </Button>
          
          {checkResults && (
            <div className="flex items-center gap-2">
              {totalIssues > 0 ? (
                <Badge variant="destructive" className="text-sm">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {totalIssues} Issues Found
                </Badge>
              ) : (
                <Badge variant="default" className="bg-green-600 text-sm">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  No Issues
                </Badge>
              )}
              {checkResults.totalChecked !== undefined && (
                <span className="text-sm text-white/60">
                  Checked: {checkResults.totalChecked}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search broken links..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {checkResults && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { key: 'brokenInternal' as LinkCategory, label: 'Broken Internal', count: checkResults.brokenInternalLinks.count, icon: '🔗', color: 'bg-red-500/20 border-red-500/40 text-red-400' },
            { key: 'brokenExternal' as LinkCategory, label: 'Broken External', count: checkResults.brokenExternalLinks.count, icon: '🌐', color: 'bg-orange-500/20 border-orange-500/40 text-orange-400' },
            { key: 'missingPages' as LinkCategory, label: 'Missing Pages', count: checkResults.missingPages.count, icon: '❌', color: 'bg-red-600/20 border-red-600/40 text-red-300' },
            { key: 'serverErrors' as LinkCategory, label: 'Server Errors', count: checkResults.serverErrors.count, icon: '⚠️', color: 'bg-red-700/20 border-red-700/40 text-red-200' },
            { key: 'timeoutUnreachable' as LinkCategory, label: 'Timeout', count: checkResults.timeoutUnreachable.count, icon: '⏱️', color: 'bg-amber-900/20 border-amber-900/40 text-amber-300' }
          ].map(({ key, label, count, icon, color }) => (
            <button
              key={key}
              onClick={() => toggleCategory(key)}
              className={`p-4 rounded-lg border transition-all ${
                selectedCategories.includes(key)
                  ? color
                  : 'bg-white/5 border-white/10 text-white/40'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">{icon}</span>
                <span className="text-2xl font-bold">{count}</span>
              </div>
              <div className="text-xs font-medium">{label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      {checkResults && sortedLinks.length > 0 ? (
        <div className="flex-1 rounded-lg border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-125">
            <table className="w-full">
              <thead className="bg-white/10 sticky top-0 z-10">
                <tr>
                  <th className="w-8 px-4 py-3"></th>
                  <th 
                    className="px-4 py-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => handleSort('url')}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                      Broken Link
                      {sortField === 'url' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => handleSort('sourceUrl')}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                      Source Page
                      {sortField === 'sourceUrl' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => handleSort('statusCode')}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                      Status
                      {sortField === 'statusCode' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <div className="text-sm font-semibold text-white/90">Category</div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => handleSort('errorType')}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                      Error Type
                      {sortField === 'errorType' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedLinks.map((link, index) => {
                  const rowKey = `${link.url}-${link.sourceUrl}-${index}`
                  const isExpanded = expandedRows.has(rowKey)
                  
                  return (
                    <tr
                      key={rowKey}
                      className="border-t border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRowExpansion(rowKey)}
                          className="text-white/60 hover:text-white/90 transition-colors"
                        >
                          <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1 hover:underline break-all"
                          >
                            {link.url}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                          {isExpanded && link.error && (
                            <div className="text-xs text-red-300/70 mt-1 p-2 bg-red-500/10 rounded border border-red-500/20">
                              <span className="font-semibold">Error: </span>{link.error}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {link.sourceUrl ? (
                          <a
                            href={link.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline break-all"
                          >
                            {link.sourceUrl}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-sm text-white/40">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge 
                          variant="destructive" 
                          className="text-xs"
                          style={{ backgroundColor: `${link.categoryColor}40`, borderColor: `${link.categoryColor}80` }}
                        >
                          {link.statusCode || link.errorType || 'Error'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-white/70">{link.categoryLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-white/70">
                          {link.errorType || link.missingType || '-'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : checkResults ? (
        <div className="flex-1 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 backdrop-blur-xl">
          <div className="text-center p-8">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-white/90 font-medium mb-1">No Broken Links Found</p>
            <p className="text-white/60 text-sm">All links are working correctly</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 backdrop-blur-xl">
          <div className="text-center p-8">
            <LinkIcon className="w-12 h-12 text-white/40 mx-auto mb-3" />
            <p className="text-white/60">Click "Check Links" to analyze all links in this session</p>
          </div>
        </div>
      )}

      {/* Results Summary */}
      {sortedLinks.length > 0 && (
        <div className="text-sm text-white/60 px-1">
          Showing {sortedLinks.length} broken link{sortedLinks.length !== 1 ? 's' : ''}
          {searchTerm && ` matching "${searchTerm}"`}
        </div>
      )}
    </div>
  )
}
