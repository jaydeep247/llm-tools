import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from '../store'

export interface CrawlProgressEntry {
  pagesCrawled: number
  lastUrl: string
  lastTitle: string
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'idle'
  totalPages: number | null
  updatedAt: number
}

interface CrawlProgressState {
  jobs: Record<string, CrawlProgressEntry>
}

const STORAGE_KEY = 'ygrt_crawl_progress_v1'
const TTL_MS = 24 * 60 * 60 * 1000

function loadFromStorage(): Record<string, CrawlProgressEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, CrawlProgressEntry>
    const cutoff = Date.now() - TTL_MS
    return Object.fromEntries(
      Object.entries(parsed).filter(([, entry]) => entry.updatedAt > cutoff),
    )
  } catch {
    return {}
  }
}

function saveToStorage(jobs: Record<string, CrawlProgressEntry>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  } catch {
    // Ignore storage errors in constrained environments.
  }
}

const initialState: CrawlProgressState = {
  jobs: loadFromStorage(),
}

type CrawlProgressUpdate = {
  jobId: string
  pagesCrawled?: number
  lastUrl?: string
  lastTitle?: string
  status?: CrawlProgressEntry['status']
  totalPages?: number | null
}

const crawlProgressSlice = createSlice({
  name: 'crawlProgress',
  initialState,
  reducers: {
    upsertCrawlProgress(state, action: PayloadAction<CrawlProgressUpdate>) {
      const { jobId, pagesCrawled, lastUrl, lastTitle, status, totalPages } = action.payload
      const existing = state.jobs[jobId]

      const existingCount = existing?.pagesCrawled ?? 0
      const incomingCount = pagesCrawled ?? existingCount
      const nextCount = Math.max(existingCount, incomingCount)
      const countAdvanced = nextCount > existingCount

      state.jobs[jobId] = {
        pagesCrawled: nextCount,
        lastUrl:
          countAdvanced
            ? (lastUrl ?? existing?.lastUrl ?? '')
            : (lastUrl || existing?.lastUrl || ''),
        lastTitle:
          countAdvanced
            ? (lastTitle ?? existing?.lastTitle ?? '')
            : (lastTitle || existing?.lastTitle || ''),
        status: status ?? existing?.status ?? 'idle',
        totalPages: totalPages ?? existing?.totalPages ?? null,
        updatedAt: Date.now(),
      }

      saveToStorage(state.jobs)
    },

    clearCrawlProgress(state, action: PayloadAction<string>) {
      delete state.jobs[action.payload]
      saveToStorage(state.jobs)
    },
  },
})

export const { upsertCrawlProgress, clearCrawlProgress } = crawlProgressSlice.actions

export default crawlProgressSlice.reducer

export const selectCrawlProgressByJobId =
  (jobId: string) =>
  (state: RootState): CrawlProgressEntry | undefined =>
    state.crawlProgress?.jobs?.[jobId]
