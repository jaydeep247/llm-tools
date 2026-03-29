'use client'

import { useEffect, useMemo, useState } from 'react'

import { useRunContentAuditMetricMutation, type ContentAuditMetricType } from '@/store/api/jobApi'

interface PersistedState {
  runAt: number
  urls: string[]
}

type UrlRow = {
  url: string
}

interface UseContentAuditMetricRunnerOptions<T extends UrlRow> {
  jobId?: string | null
  metric: ContentAuditMetricType
  data: T[]
  onRefresh?: () => void
  getLastRunAt: (row: T) => string | null | undefined
  /**
   * When true, persists the "processing" state in localStorage so that a
   * loading indicator continues to show even after the user refreshes the page.
   * Clears automatically once all rows report a lastRunAt >= the run start time.
   */
  persistLoading?: boolean
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeUrlKey(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return ''
  }

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsed = new URL(withProtocol)
    const pathname = parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '/'
    const search = parsed.search || ''
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${search}`
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

function readPersistedState(storageKey: string | null): PersistedState | null {
  if (!storageKey || typeof window === 'undefined') {
    return null
  }

  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)
    if (typeof parsed === 'number') {
      return { runAt: parsed, urls: [] }
    }

    if (
      typeof parsed?.runAt !== 'number'
      || !Array.isArray(parsed?.urls)
    ) {
      return null
    }

    return {
      runAt: parsed.runAt,
      urls: parsed.urls.filter((url: unknown): url is string => typeof url === 'string'),
    }
  } catch {
    return null
  }
}

export function useContentAuditMetricRunner<T extends UrlRow>({
  jobId,
  metric,
  data,
  onRefresh,
  getLastRunAt,
  persistLoading = false,
}: UseContentAuditMetricRunnerOptions<T>) {
  const [runMetric, { isLoading: isSubmitting }] = useRunContentAuditMetricMutation()
  const [pendingRuns, setPendingRuns] = useState<Record<string, number>>({})

  // ── Persistent loading (survives page refresh via localStorage) ──────────
  const storageKey =
    persistLoading && jobId ? `ca-run-${jobId}-${metric}` : null

  const [persistedState, setPersistedState] = useState<PersistedState | null>(() => readPersistedState(storageKey))

  useEffect(() => {
    setPersistedState(readPersistedState(storageKey))
  }, [storageKey])

  // ── Staleness safety net: clear persisted state if stuck too long ──────
  const STALE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

  // Detect when the persisted run is complete: every tracked URL has lastRunAt >= runAt
  useEffect(() => {
    if (!persistedState || !storageKey || data.length === 0) return
    const { runAt, urls: trackedUrls } = persistedState

    // Safety net: if the persisted state is older than 10 minutes, clear it
    if (Date.now() - runAt > STALE_TIMEOUT_MS) {
      localStorage.removeItem(storageKey)
      setPersistedState(null)
      return
    }

    // If we have a specific URL list, check only those; otherwise check all rows
    const trackedUrlSet = new Set(trackedUrls.map((url) => normalizeUrlKey(url)))
    const rowsToCheck = trackedUrls.length > 0
      ? data.filter((row) => trackedUrlSet.has(normalizeUrlKey(row.url)))
      : data

    // If tracked URLs are no longer in the data, clear the stuck state
    if (rowsToCheck.length === 0) {
      localStorage.removeItem(storageKey)
      setPersistedState(null)
      return
    }

    const allComplete = rowsToCheck.every((row) => {
      const ts = toTimestamp(getLastRunAt(row))
      // Use 30s tolerance to handle clock skew between browser and server (Docker)
      return ts !== null && ts >= runAt - 30_000
    })
    if (allComplete) {
      localStorage.removeItem(storageKey)
      setPersistedState(null)
    }
  }, [data, persistedState, storageKey, getLastRunAt])

  // While persisted loading is active (and no in-flight pendingRuns to avoid
  // double-polling), keep refreshing at 3-second intervals.
  useEffect(() => {
    if (!persistedState || !onRefresh || Object.keys(pendingRuns).length > 0) return
    const intervalId = window.setInterval(onRefresh, 3000)
    return () => window.clearInterval(intervalId)
  }, [persistedState, onRefresh, pendingRuns])

  // ── Existing in-flight run tracking ─────────────────────────────────────

  const allUrls = useMemo(() => {
    const seen = new Set<string>()
    return data
      .map((row) => row.url)
      .filter((url) => {
        const normalizedUrl = normalizeUrlKey(url)
        if (!normalizedUrl || seen.has(normalizedUrl)) {
          return false
        }
        seen.add(normalizedUrl)
        return true
      })
  }, [data])

  const isPersistedBulkRun = useMemo(() => {
    if (!persistedState) {
      return false
    }

    if (persistedState.urls.length === 0) {
      return true
    }

    if (allUrls.length === 0) {
      return persistedState.urls.length > 1
    }

    const persistedUrls = new Set(persistedState.urls.map((url) => normalizeUrlKey(url)))
    return allUrls.every((url) => persistedUrls.has(url))
  }, [allUrls, persistedState])

  useEffect(() => {
    if (!Object.keys(pendingRuns).length) {
      return
    }

    const completed = new Set<string>()
    data.forEach((row) => {
      const rowKey = normalizeUrlKey(row.url)
      const startedAt = pendingRuns[rowKey]
      if (!startedAt) {
        return
      }

      const lastRunAt = toTimestamp(getLastRunAt(row))
      if (lastRunAt != null && lastRunAt >= startedAt - 30_000) {
        completed.add(rowKey)
      }
    })

    if (!completed.size) {
      return
    }

    setPendingRuns((current) => {
      const next = { ...current }
      completed.forEach((url) => {
        delete next[url]
      })
      return next
    })
  }, [data, getLastRunAt, pendingRuns])

  useEffect(() => {
    if (!Object.keys(pendingRuns).length || !onRefresh) {
      return
    }

    const intervalId = window.setInterval(() => {
      onRefresh()
    }, 3000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [onRefresh, pendingRuns])

  const clearPending = (urls: string[]) => {
    setPendingRuns((current) => {
      const next = { ...current }
      urls.forEach((url) => {
        delete next[normalizeUrlKey(url)]
      })
      return next
    })
  }

  const runUrls = async (urls: string[], options?: { persist?: boolean }) => {
    const cleanedUrls = urls.filter((url) => {
      const normalizedUrl = normalizeUrlKey(url)
      return Boolean(normalizedUrl) && !pendingRuns[normalizedUrl]
    })
    if (!jobId || !cleanedUrls.length) {
      return
    }

    const trackedUrlKeys = cleanedUrls.map((url) => normalizeUrlKey(url))
    const shouldPersist = Boolean(storageKey && options?.persist)

    const fallbackStartedAt = Date.now()
    setPendingRuns((current) => ({
      ...current,
      ...Object.fromEntries(trackedUrlKeys.map((url) => [url, fallbackStartedAt])),
    }))

    // Persist only true bulk runs so single-row actions stay row-scoped.
    if (shouldPersist && storageKey) {
      const state: PersistedState = { runAt: fallbackStartedAt, urls: trackedUrlKeys }
      localStorage.setItem(storageKey, JSON.stringify(state))
      setPersistedState(state)
    }

    try {
      const result = await runMetric({ jobId, metric, urls: cleanedUrls }).unwrap()

      // Use the server's run_at timestamp if available to avoid clock skew issues
      const serverRunAt = result.run_at ? toTimestamp(result.run_at) : null
      if (serverRunAt) {
        setPendingRuns((current) => ({
          ...current,
          ...Object.fromEntries(trackedUrlKeys.map((url) => [url, serverRunAt])),
        }))

        if (shouldPersist && storageKey) {
          const state: PersistedState = { runAt: serverRunAt, urls: trackedUrlKeys }
          localStorage.setItem(storageKey, JSON.stringify(state))
          setPersistedState(state)
        }
      }
    } catch (error) {
      clearPending(cleanedUrls)
      // Clear persisted state on error so loading doesn't persist
      if (storageKey) {
        localStorage.removeItem(storageKey)
        setPersistedState(null)
      }
      throw error
    }
  }

  const hasPendingRuns = Object.keys(pendingRuns).length > 0

  return {
    runOne: (url: string) => runUrls([url], { persist: false }),
    runAll: () => runUrls(allUrls, { persist: true }),
    isRunning: (url: string) => Boolean(pendingRuns[normalizeUrlKey(url)]),
    pendingCount: Object.keys(pendingRuns).length,
    hasPendingRuns,
    isSubmitting,
    allUrls,
    /**
     * True while any individual runs are in-flight OR the persisted bulk run
     * has not yet completed (survives refresh). Use for disabling the Run All button.
     */
    isProcessing: hasPendingRuns || persistedState !== null,
    /**
     * True only while the persisted bulk run has not yet completed.
     * Use for full-table loading indicators (does NOT trigger on single-URL runs).
     */
    isBulkProcessing: isPersistedBulkRun,
  }
}