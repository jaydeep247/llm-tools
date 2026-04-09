import { baseApi } from './baseApi'

export interface ApiKey {
  key: string
  createdAt: string
  lastUsedAt: string | null
  rateLimit: number
}

export interface GetApiKeyResponse {
  apiKey: ApiKey | null
}

export interface RegenerateApiKeyResponse {
  apiKey: ApiKey
}

export interface ScheduledExport {
  id: string
  email: string
  frequency: 'weekly'
  reportType: string
  dayOfWeek: number
  hour: number
  createdAt: string
}

export interface SaveScheduleRequest {
  email: string
  frequency: 'weekly'
  reportType: string
  dayOfWeek: number
  hour: number
}

export interface SaveScheduleResponse {
  schedule: ScheduledExport
}

export const exportApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getApiKey: builder.query<GetApiKeyResponse, void>({
      query: () => '/export/api-key',
      transformResponse: (response: { data: GetApiKeyResponse }) => response.data,
      providesTags: ['Export'],
    }),

    regenerateApiKey: builder.mutation<RegenerateApiKeyResponse, void>({
      query: () => ({
        url: '/export/api-key/regenerate',
        method: 'POST',
      }),
      transformResponse: (response: { data: RegenerateApiKeyResponse }) => response.data,
      invalidatesTags: ['Export'],
    }),

    getScheduledExports: builder.query<{ schedule: ScheduledExport | null }, void>({
      query: () => '/export/schedule',
      transformResponse: (response: { data: { schedule: ScheduledExport | null } }) => response.data,
      providesTags: ['Export'],
    }),

    saveSchedule: builder.mutation<SaveScheduleResponse, SaveScheduleRequest>({
      query: (body) => ({
        url: '/export/schedule',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: SaveScheduleResponse }) => response.data,
      invalidatesTags: ['Export'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetApiKeyQuery,
  useRegenerateApiKeyMutation,
  useGetScheduledExportsQuery,
  useSaveScheduleMutation,
} = exportApi
