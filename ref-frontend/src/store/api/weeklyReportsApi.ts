import { baseApi } from './baseApi'

export interface WeeklyReportWinRow {
  metric: string
  model: string
  previous: number
  current: number
  delta: number
}

export interface WeeklyReportLossRow extends WeeklyReportWinRow {
  fix_title: string | null
  fix_link: string | null
}

export interface WeeklyReportTopPage {
  url: string
  citations: number
  primary_model: string
}

export interface WeeklyReportRecommendation {
  action: string
  impact: string
  effort: string
  module_link: string
}

export interface WeeklyReportCompetitorMovement {
  name: string
  sov_change: number | null
  prompts_gained: number
  prompts_lost: number
}

export interface WeeklyReportData {
  meta: {
    domain_label: string
    is_first_week: boolean
    job_id: string
    period_days: number
  }
  aivs_score: number | null
  aivs_delta: number | null
  health_score: number | null
  health_delta: number | null
  citation_count: number
  citation_delta: number
  sov_percent: number | null
  sov_delta: number | null
  wins: WeeklyReportWinRow[]
  losses: WeeklyReportLossRow[]
  top_pages: WeeklyReportTopPage[]
  recommendations: WeeklyReportRecommendation[]
  competitor_movements: WeeklyReportCompetitorMovement[]
}

export interface WeeklyReport {
  id: string
  projectId: string
  weekStart: string
  weekEnd: string
  jobId: string
  reportData: WeeklyReportData
  generatedAt: string
  deliveredVia?: string | null
}

export const weeklyReportsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWeeklyReports: builder.query<WeeklyReport[], { projectId: string; limit?: number }>({
      query: ({ projectId, limit = 12 }) =>
        `/reports/weekly?project_id=${encodeURIComponent(projectId)}&limit=${limit}`,
      transformResponse: (response: { data?: { reports?: WeeklyReport[] } }) =>
        response.data?.reports ?? [],
      providesTags: (result, _e, { projectId }) =>
        result
          ? [
              ...result.map((r) => ({ type: 'WeeklyReport' as const, id: r.id })),
              { type: 'WeeklyReport' as const, id: `LIST-${projectId}` },
            ]
          : [{ type: 'WeeklyReport' as const, id: `LIST-${projectId}` }],
    }),
    getWeeklyReport: builder.query<WeeklyReport, string>({
      query: (reportId) => `/reports/weekly/${encodeURIComponent(reportId)}`,
      transformResponse: (response: { data?: { report?: WeeklyReport } }) => {
        const r = response.data?.report
        if (!r) throw new Error('Report not found')
        return r
      },
      providesTags: (_r, _e, id) => [{ type: 'WeeklyReport' as const, id }],
    }),
    generateWeeklyReport: builder.mutation<WeeklyReport, { jobId: string; projectId: string }>({
      query: ({ jobId }) => ({
        url: '/reports/weekly/generate',
        method: 'POST',
        body: { jobId },
      }),
      transformResponse: (response: { data?: { report?: WeeklyReport } }) => {
        const r = response.data?.report
        if (!r) throw new Error('Generate failed')
        return r
      },
      invalidatesTags: (_r, _e, { projectId }) => [
        { type: 'WeeklyReport' as const, id: `LIST-${projectId}` },
        'WeeklyReport' as const,
      ],
    }),
  }),
})

export const {
  useGetWeeklyReportsQuery,
  useGetWeeklyReportQuery,
  useGenerateWeeklyReportMutation,
} = weeklyReportsApi
