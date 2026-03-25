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
}: UseContentAuditMetricRunnerOptions<T>) {
  const [runMetric, { isLoading: isSubmitting }] = useRunContentAuditMetricMutation()
  const [pendingRuns, setPendingRuns] = useState<Record<string, number>>({})

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

    try {
      await runMetric({ jobId, metric, urls: cleanedUrls }).unwrap()
      onRefresh?.()
    } catch (error) {
      clearPending(cleanedUrls)
      throw error
    }
  }

  return {
    runOne: (url: string) => runUrls([url]),
    runAll: () => runUrls(allUrls),
    isRunning: (url: string) => Boolean(pendingRuns[url]),
    pendingCount: Object.keys(pendingRuns).length,
    hasPendingRuns: Object.keys(pendingRuns).length > 0,
    isSubmitting,
    allUrls,
  }
}