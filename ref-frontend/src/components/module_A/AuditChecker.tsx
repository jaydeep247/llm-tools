'use client'

import { useEffect, useState } from 'react'
import { useLazyGetJobRedirectAuditQuery } from '@/store/api/jobApi'

interface PageData {
  url: string
}

interface RedirectHop {
  url: string
  statusCode: number
  redirectType: '301' | '302' | '307' | '308' | null
  redirectUrl: string | null
  headers: Record<string, string>
}

interface RedirectAuditResult {
  originalUrl: string
  finalUrl: string
  finalStatusCode: number
  has301Redirect: boolean
  has302Redirect: boolean
  has307Redirect: boolean
  redirectChain: RedirectHop[]
  chainLength: number
  hasRedirectChain: boolean
  hasRedirectLoop: boolean
  loopDetectedAt?: string
  finalUrlStatus: 'ok' | 'broken' | 'server_error' | 'unreachable'
  finalUrlStatusCode: number
  isBrokenRedirect: boolean
  brokenReason?: string
  canonicalUrl?: string
  canonicalAlignment: 'match' | 'mismatch' | 'not_found' | 'error'
  canonicalMismatchReason?: string
  overallStatus: 'ok' | 'warning' | 'error'
  issues: string[]
}

interface AuditSummary {
  totalChecked: number
  total301Redirects: number
  total302Redirects: number
  total307Redirects: number
  totalRedirectChains: number
  totalRedirectLoops: number
  totalBrokenRedirects: number
  totalCanonicalMismatches: number
  totalOk: number
  totalWarnings: number
  totalErrors: number
}

interface AuditResponse {
  success: boolean
  sessionId: number | string
  summary: AuditSummary
  results: RedirectAuditResult[]
}

interface AuditCheckerProps {
  sessionId: number | string
  jobId?: string | null
  pages: any[]
}

const itemsPerPage = 20

export default function AuditChecker({ sessionId, jobId, pages }: AuditCheckerProps) {
  const [data, setData] = useState<PageData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [auditData, setAuditData] = useState<AuditResponse | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({})
  const [currentPage, setCurrentPage] = useState(1)

  const [triggerRedirectAudit, { isFetching: isFetchingAudit }] =
    useLazyGetJobRedirectAuditQuery()

  const loadData = () => {
    try {
      if (!sessionId) {
        setData([])
        setSelectedUrl(null)
        setLoading(false)
        return
      }

      const transformedData: PageData[] = (pages || [])
        .filter((page) => page && page.url)
        .map((page) => ({
          url: page.url as string,
        }))

      setData(transformedData)

      if (transformedData.length > 0 && !selectedUrl) {
        setSelectedUrl(transformedData[0].url)
      }

      setLoading(false)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load pages')
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [sessionId, pages])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const filteredData = data.filter((item) =>
    (item.url || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentPageData = filteredData.slice(startIndex, endIndex)

  const deriveAuditResults = (): AuditResponse => {
    const results: RedirectAuditResult[] = []

    ;(pages || []).forEach((page) => {
      const url = page.url as string | undefined
      const fieldData = page.fields || {}
      const redirectData = fieldData.Redirects_audit || fieldData.redirects_audit

      if (!url || !redirectData) {
        return
      }

      const redirectChainRaw = redirectData.redirectChain || redirectData.redirect_chain || []

      const redirectChain: RedirectHop[] = (redirectChainRaw || []).map((hop: any) => ({
        url: hop.url || '',
        statusCode: hop.statusCode ?? hop.status_code ?? 0,
        redirectType:
          (hop.redirectType ??
            hop.redirect_type ??
            null) as '301' | '302' | '307' | '308' | null,
        redirectUrl: hop.redirectUrl ?? hop.redirect_url ?? null,
        headers: hop.headers || {},
      }))

      const finalStatusCode =
        redirectData.finalStatusCode ??
        redirectData.final_status_code ??
        (redirectData.finalUrlStatusCode ?? 0)

      const result: RedirectAuditResult = {
        originalUrl: redirectData.originalUrl || url,
        finalUrl: redirectData.finalUrl || url,
        finalStatusCode,
        has301Redirect: !!redirectData.has301Redirect,
        has302Redirect: !!redirectData.has302Redirect,
        has307Redirect: !!redirectData.has307Redirect,
        redirectChain,
        chainLength:
          redirectData.chainLength ??
          redirectData.chain_length ??
          Math.max(redirectChain.length - 1, 0),
        hasRedirectChain: !!redirectData.hasRedirectChain,
        hasRedirectLoop: !!redirectData.hasRedirectLoop,
        loopDetectedAt: redirectData.loopDetectedAt,
        finalUrlStatus:
          redirectData.finalUrlStatus ||
          redirectData.final_url_status ||
          (finalStatusCode >= 400 ? 'broken' : 'ok'),
        finalUrlStatusCode:
          redirectData.finalUrlStatusCode ??
          redirectData.final_url_status_code ??
          finalStatusCode,
        isBrokenRedirect:
          redirectData.isBrokenRedirect ?? (finalStatusCode >= 400 ? true : false),
        brokenReason: redirectData.brokenReason,
        canonicalUrl: redirectData.canonicalUrl,
        canonicalAlignment:
          redirectData.canonicalAlignment ||
          redirectData.canonical_alignment ||
          'not_found',
        canonicalMismatchReason: redirectData.canonicalMismatchReason,
        overallStatus: redirectData.overallStatus || redirectData.status || 'ok',
        issues: Array.isArray(redirectData.issues) ? redirectData.issues : [],
      }

      results.push(result)
    })

    const summary: AuditSummary = {
      totalChecked: results.length,
      total301Redirects: results.filter((r) => r.has301Redirect).length,
      total302Redirects: results.filter((r) => r.has302Redirect).length,
      total307Redirects: results.filter((r) => r.has307Redirect).length,
      totalRedirectChains: results.filter((r) => r.hasRedirectChain).length,
      totalRedirectLoops: results.filter((r) => r.hasRedirectLoop).length,
      totalBrokenRedirects: results.filter((r) => r.isBrokenRedirect).length,
      totalCanonicalMismatches: results.filter(
        (r) => r.canonicalAlignment === 'mismatch'
      ).length,
      totalOk: results.filter((r) => r.overallStatus === 'ok').length,
      totalWarnings: results.filter((r) => r.overallStatus === 'warning').length,
      totalErrors: results.filter((r) => r.overallStatus === 'error').length,
    }

    return {
      success: true,
      sessionId,
      summary,
      results,
    }
  }

  const handleCheckAudit = async () => {
    if (!sessionId) {
      setCheckError('No session selected')
      return
    }

    setChecking(true)
    setCheckError(null)

    try {
      let finalResult: AuditResponse | null = null

      if (jobId) {
        try {
          const response = await triggerRedirectAudit(jobId).unwrap()
          if (response && response.results && response.results.length > 0) {
            finalResult = {
              success: true,
              sessionId: response.sessionId,
              summary: response.summary,
              results: response.results,
            }
          }
        } catch {
          finalResult = null
        }
      }

      if (!finalResult) {
        const localResult = deriveAuditResults()

        if (!localResult.results || localResult.results.length === 0) {
          setAuditData(null)
          setCheckError('No redirect audit data available')
        } else {
          setAuditData(localResult)
        }
      } else {
        setAuditData(finalResult)
      }
    } catch (err: any) {
      const message =
        (err && (err.data?.message || err.message)) ||
        'Failed to analyze redirects'
      setCheckError(message)
    } finally {
      setChecking(false)
    }
  }

  const effectiveLoading = loading && data.length === 0

  if (effectiveLoading) {
    return (
      <div className="flex w-full items-center justify-center p-10 text-center">
        <div className="text-sm text-white/70">Loading pages...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-3 p-10">
        <div className="text-sm text-red-400">Error: {error}</div>
        <button
          onClick={loadData}
          className="rounded-md border border-white/20 bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/40 px-6 py-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
          <span>🔍</span>
          <span>Audit Checker</span>
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-b border-white/10 bg-black/40 px-6 py-4">
        <div className="min-w-[280px] flex-1">
          <input
            type="text"
            placeholder="Search by URL..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-white/20 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 bg-black/40">
        <div className="flex h-full min-w-[280px] max-w-sm flex-[0_0_340px] flex-col overflow-hidden border-r border-white/10 bg-black/30">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 bg-black/40 px-5 py-3">
            <h3 className="text-sm font-semibold text-white">
              URLs ({filteredData.length})
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {currentPageData.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/60">
                {!sessionId ? 'No session selected' : 'No URLs found'}
              </div>
            ) : (
              currentPageData.map((item, index) => {
                const result = auditData?.results.find(
                  (r) => r.originalUrl === item.url
                )

                let statusVariant: 'ok' | 'warning' | 'error' | 'unknown' = 'unknown'
                if (result?.overallStatus === 'ok') statusVariant = 'ok'
                else if (result?.overallStatus === 'warning') statusVariant = 'warning'
                else if (result?.overallStatus === 'error') statusVariant = 'error'

                const isSelected = selectedUrl === item.url

                const statusDotClass =
                  statusVariant === 'ok'
                    ? 'bg-emerald-400'
                    : statusVariant === 'warning'
                      ? 'bg-amber-400'
                      : statusVariant === 'error'
                        ? 'bg-rose-500'
                        : 'bg-slate-400'

                const borderClass =
                  statusVariant === 'ok'
                    ? 'border-emerald-400/50'
                    : statusVariant === 'warning'
                      ? 'border-amber-400/50'
                      : statusVariant === 'error'
                        ? 'border-rose-500/50'
                        : 'border-white/10'

                return (
                  <button
                    key={startIndex + index}
                    type="button"
                    onClick={() => setSelectedUrl(item.url)}
                    className={[
                      'mb-2 w-full rounded-md border px-3 py-2 text-left text-xs transition-colors',
                      'break-words',
                      isSelected
                        ? 'border-indigo-400 bg-indigo-500/30 text-white'
                        : `bg-white/5 text-slate-100 hover:bg-white/10 ${borderClass}`,
                    ].join(' ')}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {result && (
                        <span className={['h-2 w-2 rounded-full', statusDotClass].join(' ')} />
                      )}
                      <span className="flex-1 leading-snug">{item.url}</span>
                    </div>
                    {result && (
                      <div className="mt-1 text-[10px] text-slate-400">
                        {result.overallStatus.toUpperCase()} • {result.chainLength} hop
                        {result.chainLength !== 1 ? 's' : ''}
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-shrink-0 items-center justify-between border-t border-white/10 bg-black/40 px-5 py-3 text-xs text-white">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded border border-white/20 px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="rounded border border-white/20 px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="flex h-full flex-1 flex-col overflow-hidden bg-black/20">
          <div className="flex flex-shrink-0 items-center border-b border-white/10 bg-black/40 px-6 py-4">
            <button
              type="button"
              onClick={handleCheckAudit}
              disabled={checking || isFetchingAudit || !sessionId}
              className={[
                'w-full rounded-md px-4 py-2 text-sm font-semibold text-white transition',
                checking || isFetchingAudit || !sessionId
                  ? 'cursor-not-allowed bg-slate-500/40'
                  : 'bg-indigo-500 hover:bg-indigo-600',
              ].join(' ')}
            >
              {checking || isFetchingAudit ? 'Checking Audit...' : 'Check audit'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {checkError && (
              <div className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                Error: {checkError}
              </div>
            )}

            {checking && (
              <div className="mb-4 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                This will take a few moments while redirects are analyzed.
              </div>
            )}

            {auditData && auditData.results && auditData.results.length > 0 && (
              <div className="flex flex-col gap-4">
                {auditData.summary.totalChecked !== undefined && (
                  <div className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-300">
                      Summary
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <div>
                        <span className="text-white/60">Checked: </span>
                        <span className="font-semibold text-white">
                          {auditData.summary.totalChecked}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Total issues: </span>
                        <span className="font-semibold text-rose-400">
                          {auditData.summary.total301Redirects +
                            auditData.summary.total302Redirects +
                            auditData.summary.total307Redirects +
                            auditData.summary.totalRedirectChains +
                            auditData.summary.totalRedirectLoops +
                            auditData.summary.totalBrokenRedirects +
                            auditData.summary.totalCanonicalMismatches}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {([
                  {
                    key: '301_redirects',
                    title: 'Detect 301 Redirects',
                    icon: '🔹',
                    filter: (r: RedirectAuditResult) => r.has301Redirect,
                  },
                  {
                    key: '302_redirects',
                    title: 'Detect 302 Redirects',
                    icon: '🔹',
                    filter: (r: RedirectAuditResult) => r.has302Redirect,
                  },
                  {
                    key: '307_redirects',
                    title: 'Detect 307 Redirects',
                    icon: '🔹',
                    filter: (r: RedirectAuditResult) => r.has307Redirect,
                  },
                  {
                    key: 'redirect_chains',
                    title: 'Identify Redirect Chains',
                    icon: '🔗',
                    filter: (r: RedirectAuditResult) => r.hasRedirectChain,
                  },
                  {
                    key: 'redirect_loops',
                    title: 'Identify Redirect Loops',
                    icon: '⚠️',
                    filter: (r: RedirectAuditResult) => r.hasRedirectLoop,
                  },
                  {
                    key: 'final_url_status',
                    title: 'Check HTTP Status Code of Final URL',
                    icon: '🎯',
                    filter: (r: RedirectAuditResult) => true,
                  },
                  {
                    key: 'broken_redirects',
                    title: 'Identify Broken Redirects',
                    icon: '❌',
                    filter: (r: RedirectAuditResult) => r.isBrokenRedirect,
                  },
                  {
                    key: 'canonical_alignment',
                    title: 'Verify Canonical URL Alignment',
                    icon: '🔗',
                    filter: (r: RedirectAuditResult) =>
                      r.canonicalUrl !== undefined &&
                      r.canonicalAlignment !== 'match',
                  },
                ] as const).map(({ key, title, icon, filter }) => {
                  const matchingResults = auditData.results.filter(filter)
                  const isExpanded = expandedResults[key] || false
                  const hasIssues = matchingResults.length > 0

                  let statusForCard: 'ok' | 'warning' | 'error' = 'ok'
                  if (key === 'broken_redirects' || key === 'redirect_loops') {
                    statusForCard = 'error'
                  } else if (
                    key === 'redirect_chains' ||
                    key === '302_redirects' ||
                    key === '307_redirects' ||
                    key === 'canonical_alignment'
                  ) {
                    statusForCard = 'warning'
                  }

                  const cardClasses =
                    statusForCard === 'ok'
                      ? 'border-emerald-400/40 bg-emerald-500/10'
                      : statusForCard === 'warning'
                        ? 'border-amber-400/40 bg-amber-500/10'
                        : 'border-rose-500/40 bg-rose-500/10'

                  return (
                    <div
                      key={key}
                      className={[
                        'rounded-lg border p-4 transition',
                        hasIssues ? cardClasses : 'border-white/10 bg-black/40',
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 text-left"
                        onClick={() =>
                          hasIssues &&
                          setExpandedResults((prev) => ({
                            ...prev,
                            [key]: !prev[key],
                          }))
                        }
                      >
                        <div className="flex flex-1 items-center gap-3">
                          <span className="text-lg">{icon}</span>
                          <span className="text-sm font-medium text-white">
                            {title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={[
                              'rounded-full px-2 py-1 font-semibold',
                              hasIssues
                                ? statusForCard === 'ok'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : statusForCard === 'warning'
                                    ? 'bg-amber-500/20 text-amber-200'
                                    : 'bg-rose-500/20 text-rose-200'
                                : 'bg-emerald-500/20 text-emerald-200',
                            ].join(' ')}
                          >
                            {hasIssues
                              ? `${matchingResults.length} found`
                              : '✓ Done'}
                          </span>
                          {hasIssues && (
                            <span className="text-[10px] text-white/60">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                          )}
                        </div>
                      </button>

                      {hasIssues && isExpanded && (
                        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto border-t border-white/10 pt-3 text-xs text-white">
                          {matchingResults.map((result, idx) => (
                            <div
                              key={idx}
                              className="space-y-3 rounded-md border border-white/5 bg-black/40 p-3"
                            >
                              <div className="rounded-md border border-indigo-400/40 bg-indigo-500/10 p-2">
                                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
                                  📄 Original URL:
                                </div>
                                <a
                                  href={result.originalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block break-words text-xs text-sky-300 underline-offset-2 hover:text-indigo-300 hover:underline"
                                >
                                  {result.originalUrl}
                                </a>
                              </div>

                              {(key === '301_redirects' ||
                                key === '302_redirects' ||
                                key === '307_redirects') && (
                                <div className="space-y-1 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-300">
                                    🔗 Redirect Type:{' '}
                                    {key === '301_redirects'
                                      ? '301'
                                      : key === '302_redirects'
                                        ? '302'
                                        : '307'}
                                  </div>
                                  <div className="break-words text-white/80">
                                    Final URL: {result.finalUrl || 'N/A'}
                                  </div>
                                  {result.redirectChain &&
                                    result.redirectChain.length > 0 && (
                                      <div className="mt-1 text-[10px] text-white/60">
                                        Chain:{' '}
                                        {result.redirectChain
                                          .filter(
                                            (h) =>
                                              h.redirectType ===
                                              (key === '301_redirects'
                                                ? '301'
                                                : key === '302_redirects'
                                                  ? '302'
                                                  : '307')
                                          )
                                          .map((h) => h.url)
                                          .join(' → ')}
                                      </div>
                                    )}
                                </div>
                              )}

                              {key === 'redirect_chains' && (
                                <div className="space-y-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-xs">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                                    🔗 Redirect Chain ({result.chainLength} hop
                                    {result.chainLength !== 1 ? 's' : ''})
                                  </div>
                                  <div className="space-y-1">
                                    {result.redirectChain.map((hop, hopIdx) => (
                                      <div
                                        key={hopIdx}
                                        className="break-words text-white/80"
                                      >
                                        {hopIdx + 1}. {hop.url}{' '}
                                        {hop.redirectType && `(${hop.redirectType})`}{' '}
                                        {hop.redirectUrl && `→ ${hop.redirectUrl}`}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {key === 'redirect_loops' && (
                                <div className="space-y-1 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-300">
                                    ⚠️ Loop Detected
                                  </div>
                                  <div className="break-words text-rose-100">
                                    {result.loopDetectedAt || 'Unknown location'}
                                  </div>
                                </div>
                              )}

                              {key === 'final_url_status' && (
                                <div
                                  className={[
                                    'space-y-1 rounded-md border p-2 text-xs',
                                    result.finalUrlStatus === 'ok'
                                      ? 'border-emerald-400/40 bg-emerald-500/10'
                                      : 'border-rose-500/40 bg-rose-500/10',
                                  ].join(' ')}
                                >
                                  <div
                                    className={[
                                      'text-[10px] font-semibold uppercase tracking-wide',
                                      result.finalUrlStatus === 'ok'
                                        ? 'text-emerald-300'
                                        : 'text-rose-300',
                                    ].join(' ')}
                                  >
                                    🎯 Final URL Status
                                  </div>
                                  <div className="break-words text-white/80">
                                    {result.finalUrl || 'N/A'}
                                  </div>
                                  <div className="text-[11px] text-white/70">
                                    Status Code:{' '}
                                    <span
                                      className={
                                        result.finalUrlStatusCode === 200
                                          ? 'font-semibold text-emerald-300'
                                          : 'font-semibold text-rose-300'
                                      }
                                    >
                                      {result.finalUrlStatusCode}
                                    </span>{' '}
                                    ({result.finalUrlStatus})
                                  </div>
                                </div>
                              )}

                              {key === 'broken_redirects' && (
                                <div className="space-y-1 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-300">
                                    ❌ Broken Redirect
                                  </div>
                                  <div className="break-words text-white/80">
                                    Final URL: {result.finalUrl || 'N/A'}
                                  </div>
                                  <div className="text-[11px] text-rose-200">
                                    Status: {result.finalUrlStatusCode} -{' '}
                                    {result.brokenReason || 'Unknown error'}
                                  </div>
                                </div>
                              )}

                              {key === 'canonical_alignment' && (
                                <div className="space-y-1 rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-xs">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                                    🔗 Canonical Alignment:{' '}
                                    {result.canonicalAlignment?.toUpperCase()}
                                  </div>
                                  <div className="break-words text-white/80">
                                    Final URL: {result.finalUrl || 'N/A'}
                                  </div>
                                  <div className="break-words text-white/80">
                                    Canonical:{' '}
                                    {result.canonicalUrl || 'Not found'}
                                  </div>
                                  {result.canonicalMismatchReason && (
                                    <div className="text-[11px] text-rose-200">
                                      {result.canonicalMismatchReason}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {hasIssues && !isExpanded && matchingResults.length > 0 && (
                        <div className="mt-3 rounded-md bg-black/40 px-3 py-2 text-[11px] text-white/70">
                          <div className="break-words">
                            {matchingResults[0].originalUrl}
                          </div>
                          {matchingResults.length > 1 && (
                            <div className="mt-1 italic text-white/50">
                              +{matchingResults.length - 1} more... (Click to expand)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {!auditData && !checkError && !checking && (
              <div className="flex h-full items-center justify-center text-sm text-white/60">
                Click "Check audit" to analyze redirects
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


