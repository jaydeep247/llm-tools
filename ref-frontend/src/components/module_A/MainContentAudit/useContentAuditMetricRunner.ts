'use client'

import { useEffect, useMemo, useState } from 'react'

import { useRunContentAuditMetricMutation, type ContentAuditMetricType } from '@/store/api/jobApi'

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

  // Stored as JSON: { runAt: number, urls: string[] }
  interface PersistedState { runAt: number; urls: string[] }

  const [persistedState, setPersistedState] = useState<PersistedState | null>(() => {
    if (!storageKey || typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      // Support legacy format (plain number)
      if (typeof parsed === 'number') return { runAt: parsed, urls: [] }
      return parsed as PersistedState
    } catch {
      return null
    }
  })

  // Detect when the persisted run is complete: every tracked URL has lastRunAt >= runAt
  useEffect(() => {
    if (!persistedState || !storageKey || data.length === 0) return
    const { runAt, urls: trackedUrls } = persistedState
    // If we have a specific URL list, check only those; otherwise check all rows
    const rowsToCheck = trackedUrls.length > 0
      ? data.filter((row) => trackedUrls.includes(row.url))
      : data
    if (rowsToCheck.length === 0) return
    const allComplete = rowsToCheck.every((row) => {
      const ts = toTimestamp(getLastRunAt(row))
      return ts !== null && ts >= runAt - 1000
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
    onRefresh()
    const intervalId = window.setInterval(onRefresh, 3000)
    return () => window.clearInterval(intervalId)
  }, [persistedState, onRefresh, pendingRuns])

  // ── Existing in-flight run tracking ─────────────────────────────────────

  const allUrls = useMemo(() => {
    const seen = new Set<string>()
    return data
      .map((row) => row.url)
      .filter((url) => {
        if (!url || seen.has(url)) {
          return false
        }
        seen.add(url)
        return true
      })
  }, [data])

  useEffect(() => {
    if (!Object.keys(pendingRuns).length) {
      return
    }

    const completed = new Set<string>()
    data.forEach((row) => {
      const startedAt = pendingRuns[row.url]
      if (!startedAt) {
        return
      }

      const lastRunAt = toTimestamp(getLastRunAt(row))
      if (lastRunAt != null && lastRunAt >= startedAt - 1000) {
        completed.add(row.url)
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

    onRefresh()
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
        delete next[url]
      })
      return next
    })
  }

  const runUrls = async (urls: string[]) => {
    const cleanedUrls = urls.filter((url) => url && !pendingRuns[url])
    if (!jobId || !cleanedUrls.length) {
      return
    }

    const startedAt = Date.now()
    setPendingRuns((current) => ({
      ...current,
      ...Object.fromEntries(cleanedUrls.map((url) => [url, startedAt])),
    }))

    // Persist to localStorage so the loading indicator survives page refreshes
    if (storageKey) {
      const state: PersistedState = { runAt: startedAt, urls: cleanedUrls }
      localStorage.setItem(storageKey, JSON.stringify(state))
      setPersistedState(state)
    }

    try {
      await runMetric({ jobId, metric, urls: cleanedUrls }).unwrap()
      onRefresh?.()
    } catch (error) {
      clearPending(cleanedUrls)
      throw error
    }
  }

  const hasPendingRuns = Object.keys(pendingRuns).length > 0

  return {
    runOne: (url: string) => runUrls([url]),
    runAll: () => runUrls(allUrls),
    isRunning: (url: string) => Boolean(pendingRuns[url]),
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
    isBulkProcessing: persistedState !== null,
  }
}