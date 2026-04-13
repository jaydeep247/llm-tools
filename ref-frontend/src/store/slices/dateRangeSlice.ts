import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type DateRangePreset = '7d' | '30d'

export interface DateRangeState {
  preset: DateRangePreset
}

const STORAGE_KEY = 'colytics_date_range_preset'

function loadPreset(): DateRangePreset {
  if (typeof window === 'undefined') return '7d'
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === '30d' ? '30d' : '7d'
}

const initialState: DateRangeState = {
  preset: loadPreset(),
}

export const dateRangeSlice = createSlice({
  name: 'dateRange',
  initialState,
  reducers: {
    setPreset(state, action: PayloadAction<DateRangePreset>) {
      state.preset = action.payload
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, action.payload)
      }
    },
  },
})

export const { setPreset } = dateRangeSlice.actions
export default dateRangeSlice.reducer

export const selectDateRangePreset = (s: { dateRange: DateRangeState }) => s.dateRange.preset
