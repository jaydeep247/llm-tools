'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  Link as LinkIcon,
  Search,
  X,
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { Input } from '@/components/ui/input'

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

type LinkCategory =
  | 'brokenInternal'
  | 'brokenExternal'
  | 'missingPages'
  | 'serverErrors'
  | 'timeoutUnreachable'

export default function BrokenLinkChecker({
  sessionId,
  onCheck,
  checkResults,
  isChecking = false,
}: BrokenLinkCheckerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<'url' | 'sourceUrl' | 'statusCode' | 'errorType'>('url')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [selectedCategories, setSelectedCategories] = useState<LinkCategory[]>([
    'brokenInternal',
    'brokenExternal',
    'missingPages',
    'serverErrors',
    'timeoutUnreachable',
  ])
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const allLinks = useMemo(() => {
    if (!checkResults) return []

    const links: (BrokenLink & {
      category: LinkCategory
      categoryLabel: string
      categoryColor: string
    })[] = []

    const categories: {
      key: LinkCategory
      label: string
      color: string
      data: { count: number; links: BrokenLink[] }
    }[] = [
      { key: 'brokenInternal', label: 'Broken Internal', color: '#ef4444', data: checkResults.brokenInternalLinks },
      { key: 'brokenExternal', label: 'Broken External', color: '#f59e0b', data: checkResults.brokenExternalLinks },
      { key: 'missingPages', label: 'Missing Page', color: '#dc2626', data: checkResults.missingPages },
      { key: 'serverErrors', label: 'Server Error', color: '#991b1b', data: checkResults.serverErrors },
      { key: 'timeoutUnreachable', label: 'Timeout', color: '#7c2d12', data: checkResults.timeoutUnreachable },
    ]

    categories.forEach(({ key, label, color, data }) => {
      if (selectedCategories.includes(key)) {
        data.links.forEach((link) => {
          links.push({
            ...link,
            category: key,
            categoryLabel: label,
            categoryColor: color,
          })
        })
      }
    })

    return links
  }, [checkResults, selectedCategories])

  const filteredLinks = useMemo(() => {
    return allLinks.filter((link) => {
      const searchLower = searchTerm.toLowerCase()
      return (
        link.url.toLowerCase().includes(searchLower) ||
        link.sourceUrl?.toLowerCase().includes(searchLower) ||
        link.errorType?.toLowerCase().includes(searchLower) ||
        link.error?.toLowerCase().includes(searchLower)
      )
    })
  }, [allLinks, searchTerm])

  const sortedLinks = useMemo(() => {
    const sorted = [...filteredLinks]
    sorted.sort((a, b) => {
      let aValue: string | number = a[sortField] || ''
      let bValue: string | number = b[sortField] || ''

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
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  const handleCheckLinks = async () => {
    if (onCheck) {
      await onCheck(sessionId)
    }
  }

  const toggleRowExpansion = (url: string) => {
    setExpandedRows((prev) => {
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

  const categoryCards = checkResults
    ? [
        {
          key: 'brokenInternal' as LinkCategory,
          label: 'Broken Internal',
          count: checkResults.brokenInternalLinks.count,
          icon: LinkIcon,
          active: 'text-red-700 border-red-200 bg-red-50',
        },
        {
          key: 'brokenExternal' as LinkCategory,
          label: 'Broken External',
          count: checkResults.brokenExternalLinks.count,
          icon: ExternalLink,
          active: 'text-orange-700 border-orange-200 bg-orange-50',
        },
        {
          key: 'missingPages' as LinkCategory,
          label: 'Missing Pages',
          count: checkResults.missingPages.count,
          icon: X,
          active: 'text-rose-700 border-rose-200 bg-rose-50',
        },
        {
          key: 'serverErrors' as LinkCategory,
          label: 'Server Errors',
          count: checkResults.serverErrors.count,
          icon: AlertTriangle,
          active: 'text-red-700 border-red-200 bg-red-50',
        },
        {
          key: 'timeoutUnreachable' as LinkCategory,
          label: 'Timeout',
          count: checkResults.timeoutUnreachable.count,
          icon: Clock,
          active: 'text-amber-700 border-amber-200 bg-amber-50',
        },
      ]
    : []

  const hasResults = Boolean(checkResults)

  return (
    <div className="h-full w-full space-y-6">
      <div className="rounded-2xl border border-(--nd-border) bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5">
              <LinkIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="nd-page-title">URL Explorer</h2>
              <p className="text-sm text-(--nd-text-muted)">
                Audit discovered links, isolate failures by type, and inspect root causes quickly.
              </p>
            </div>
          </div>

          {(!hasResults || totalIssues > 0) && (
            <button
              onClick={handleCheckLinks}
              disabled={isChecking}
              className="nd-btn-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isChecking ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  Checking Links...
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4" />
                  Check Links
                </>
              )}
            </button>
          )}
        </div>

        {hasResults && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {totalIssues > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                {totalIssues} issue{totalIssues === 1 ? '' : 's'} detected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                <CheckCircle className="h-3 w-3" />
                All links healthy
              </span>
            )}
            {checkResults?.totalChecked !== undefined && (
              <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border border-(--nd-border) text-(--nd-text-secondary)">
                Checked {checkResults.totalChecked}
              </span>
            )}
          </div>
        )}
      </div>

      {!hasResults ? (
        <AnalysisEmptyState
          icon={<LinkIcon className="h-8 w-8 text-(--nd-text-muted)" />}
          title="No URL Explorer Data"
          description="Run a link check to analyze internal and external URLs, identify failures, and inspect source pages."
          onRunAnalysis={handleCheckLinks}
          isAnalyzing={isChecking}
          buttonLabel="Check Links"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {categoryCards.map(({ key, label, count, icon: Icon, active }) => {
              const isSelected = selectedCategories.includes(key)
              return (
                <button
                  key={key}
                  onClick={() => toggleCategory(key)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    isSelected ? active : 'border-(--nd-border) bg-(--nd-bg) text-(--nd-text-muted) hover:border-(--nd-border)'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Icon className="h-4 w-4" />
                    <span className="text-xl font-semibold">{count}</span>
                  </div>
                  <div className="text-xs font-medium uppercase tracking-wide">{label}</div>
                </button>
              )
            })}
          </div>

          <div className="rounded-2xl border border-(--nd-border) bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-xs text-(--nd-text-muted)">
                <span>{sortedLinks.length} visible result{sortedLinks.length === 1 ? '' : 's'}</span>
                <span className="text-(--nd-text-muted)">•</span>
                <span>Sorted by {sortField}</span>
              </div>

              <div className="relative w-full lg:w-96">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--nd-text-muted)" />
                <Input
                  type="text"
                  placeholder="Search by URL, source, or error"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 rounded-xl border-(--nd-border) bg-(--nd-bg) pl-10 text-(--nd-text-primary) placeholder:text-(--nd-text-muted)"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-(--nd-text-muted) transition-colors hover:text-(--nd-text-secondary)"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {sortedLinks.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-(--nd-border) bg-white">
              <div className="max-h-125 overflow-auto">
                <table className="w-full min-w-230">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-(--nd-border)">
                      <th className="w-8 px-4 py-3" />
                      <th className="px-4 py-3 text-left">
                        <button
                          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--nd-text-muted) hover:text-(--nd-text-primary)"
                          onClick={() => handleSort('url')}
                        >
                          Broken Link
                          {sortField === 'url' &&
                            (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button
                          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--nd-text-muted) hover:text-(--nd-text-primary)"
                          onClick={() => handleSort('sourceUrl')}
                        >
                          Source Page
                          {sortField === 'sourceUrl' &&
                            (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button
                          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--nd-text-muted) hover:text-(--nd-text-primary)"
                          onClick={() => handleSort('statusCode')}
                        >
                          Status
                          {sortField === 'statusCode' &&
                            (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-(--nd-text-muted)">
                        Category
                      </th>
                      <th className="px-4 py-3 text-left">
                        <button
                          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--nd-text-muted) hover:text-(--nd-text-primary)"
                          onClick={() => handleSort('errorType')}
                        >
                          Error Type
                          {sortField === 'errorType' &&
                            (sortDirection === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLinks.map((link, index) => {
                      const rowKey = `${link.url}-${link.sourceUrl}-${index}`
                      const isExpanded = expandedRows.has(rowKey)

                      return (
                        <tr key={rowKey} className="border-t border-(--nd-border) transition-colors hover:bg-(--nd-bg)">
                          <td className="px-4 py-3 align-top">
                            <button
                              onClick={() => toggleRowExpansion(rowKey)}
                              className="mt-0.5 text-(--nd-text-muted) transition-colors hover:text-(--nd-text-primary)"
                            >
                              <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="space-y-1">
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-1 break-all text-sm text-rose-600 hover:text-rose-800 hover:underline"
                              >
                                <span>{link.url}</span>
                                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                              </a>
                              {isExpanded && link.error && (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                                  <span className="font-semibold">Error:</span> {link.error}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            {link.sourceUrl ? (
                              <a
                                href={link.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-1 break-all text-sm text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                <span>{link.sourceUrl}</span>
                                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                              </a>
                            ) : (
                              <span className="text-sm text-(--nd-text-muted)">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md border border-(--nd-border) bg-(--nd-bg) text-(--nd-text-secondary)">
                              {link.statusCode || link.errorType || 'Error'}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-(--nd-text-secondary)">{link.categoryLabel}</td>
                          <td className="px-4 py-3 align-top text-sm text-(--nd-text-secondary)">
                            {link.errorType || link.missingType || '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-(--nd-border) bg-white p-10 text-center">
              <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
              <p className="text-sm font-medium text-(--nd-text-primary)">
                {totalIssues > 0 ? 'No links match the current filters.' : 'No broken links found.'}
              </p>
              <p className="mt-1 text-xs text-(--nd-text-muted)">
                {totalIssues > 0 ? 'Try clearing search or re-enabling categories.' : 'Your latest scan shows all links are healthy.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
