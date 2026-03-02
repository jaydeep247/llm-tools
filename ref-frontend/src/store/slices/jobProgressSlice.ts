/**
 * jobProgressSlice
 *
 * Persists per-job progress percentages in sessionStorage so that a page
 * refresh never resets the progress bar to 0%.
 *
 * Race-condition guard: `updateJobProgress` is a no-op when the incoming
 * percent is strictly less than what we already stored — ensuring the bar
 * never moves backward regardless of event ordering.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from '../store'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobProgressEntry {
  /** Last known progress %, 0–100 */
  percent: number
  /** Unix-ms when this entry was last written (for TTL pruning) */
  updatedAt: number
}

interface JobProgressState {
  jobs: Record<string, JobProgressEntry>
}

// ─── sessionStorage helpers ───────────────────────────────────────────────────

const STORAGE_KEY = 'ygrt_job_progress'
/** Keep entries for 4 hours max */
const TTL_MS = 4 * 60 * 60 * 1000

function loadFromStorage(): Record<string, JobProgressEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: Record<string, JobProgressEntry> = JSON.parse(raw)
    const cutoff = Date.now() - TTL_MS
    // Prune stale entries at load time
    return Object.fromEntries(
      Object.entries(parsed).filter(([, e]) => e.updatedAt > cutoff),
    )
  } catch {
    return {}
  }
}

function saveToStorage(jobs: Record<string, JobProgressEntry>) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  } catch {
    // sessionStorage may be unavailable (private mode quota exceeded, etc.)
  }
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const jobProgressSlice = createSlice({
  name: 'jobProgress',
  initialState: (): JobProgressState => ({
    jobs: loadFromStorage(),
  }),
  reducers: {
    /**
     * Update progress for a job.
     *
     * Only persists when `percent >= existing percent` — monotonic guard that
     * prevents out-of-order events from moving the bar backward.
     */
    updateJobProgress(
      state,
      action: PayloadAction<{ jobId: string; percent: number }>,
    ) {
      const { jobId, percent } = action.payload
      const existing = state.jobs[jobId]
      if (existing && percent < existing.percent) return // race-condition guard

      state.jobs[jobId] = { percent, updatedAt: Date.now() }
      saveToStorage(state.jobs)
    },

    /** Call this when a job finishes (or is cancelled/failed) to clean up. */
    clearJobProgress(state, action: PayloadAction<string>) {
      delete state.jobs[action.payload]
      saveToStorage(state.jobs)
    },
  },
})

export const { updateJobProgress, clearJobProgress } = jobProgressSlice.actions
export default jobProgressSlice.reducer

// ─── Selectors ────────────────────────────────────────────────────────────────

/** Returns the last persisted percent for the given jobId, or 0. */
export const selectStoredPercent = (jobId: string) => (state: RootState): number =>
  state.jobProgress?.jobs?.[jobId]?.percent ?? 0
