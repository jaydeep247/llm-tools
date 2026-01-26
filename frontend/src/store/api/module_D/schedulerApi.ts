import { baseApi } from '../baseApi';

export interface Schedule {
  id: number;
  name: string;
  url: string;
  cronExpression: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleStats {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastRun?: string;
  nextRun?: string;
}

export interface CreateScheduleRequest {
  name: string;
  url: string;
  cronExpression: string;
}

export interface UpdateScheduleRequest {
  name?: string;
  url?: string;
  cronExpression?: string;
}

export interface ValidateCronRequest {
  cronExpression: string;
}

export interface ValidateCronResponse {
  valid: boolean;
  nextRuns?: string[];
  error?: string;
}

export interface CronHistoryParams {
  limit?: number;
  offset?: number;
  scheduleId?: number;
}

export interface CronHistoryItem {
  id: number;
  scheduleId: number;
  status: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface CronStats {
  total: number;
  successful: number;
  failed: number;
}

export interface ExportCronParams {
  format?: 'csv' | 'json';
  scheduleId?: number;
  limit?: number;
}

export const schedulerApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSchedules: builder.query<Schedule[], void>({
      query: () => '/api/schedules',
      providesTags: ['Schedule'],
    }),
    getScheduleStats: builder.query<ScheduleStats, number>({
      query: (scheduleId) => `/api/schedules/${scheduleId}/stats`,
      providesTags: (result, error, scheduleId) => [{ type: 'Schedule', id: scheduleId }],
    }),
    createSchedule: builder.mutation<Schedule, CreateScheduleRequest>({
      query: (data) => ({
        url: '/api/schedules',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Schedule'],
    }),
    updateSchedule: builder.mutation<Schedule, { id: number; data: UpdateScheduleRequest }>({
      query: ({ id, data }) => ({
        url: `/api/schedules/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Schedule'],
    }),
    deleteSchedule: builder.mutation<void, number>({
      query: (id) => ({
        url: `/api/schedules/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Schedule'],
    }),
    toggleSchedule: builder.mutation<Schedule, number>({
      query: (id) => ({
        url: `/api/schedules/${id}/toggle`,
        method: 'POST',
      }),
      invalidatesTags: ['Schedule'],
    }),
    triggerSchedule: builder.mutation<void, number>({
      query: (id) => ({
        url: `/api/schedules/${id}/trigger`,
        method: 'POST',
      }),
      invalidatesTags: ['Schedule'],
    }),
    validateCron: builder.mutation<ValidateCronResponse, ValidateCronRequest>({
      query: (data) => ({
        url: '/api/scheduler/validate-cron',
        method: 'POST',
        body: data,
      }),
    }),
    getCronHistory: builder.query<CronHistoryItem[], CronHistoryParams>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.limit) searchParams.set('limit', String(params.limit));
        if (params.offset) searchParams.set('offset', String(params.offset));
        if (params.scheduleId) searchParams.set('scheduleId', String(params.scheduleId));
        return `/api/cron/history?${searchParams.toString()}`;
      },
      providesTags: ['Cron'],
    }),
    getCronStats: builder.query<CronStats, void>({
      query: () => '/api/cron/stats',
      providesTags: ['Cron'],
    }),
    exportCron: builder.query<Blob, ExportCronParams>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.format) searchParams.set('format', params.format);
        if (params.scheduleId) searchParams.set('scheduleId', String(params.scheduleId));
        if (params.limit) searchParams.set('limit', String(params.limit));
        return {
          url: `/api/cron/export?${searchParams.toString()}`,
          responseHandler: (response) => response.blob(),
        };
      },
    }),
  }),
});

export const {
  useGetSchedulesQuery,
  useGetScheduleStatsQuery,
  useCreateScheduleMutation,
  useUpdateScheduleMutation,
  useDeleteScheduleMutation,
  useToggleScheduleMutation,
  useTriggerScheduleMutation,
  useValidateCronMutation,
  useGetCronHistoryQuery,
  useGetCronStatsQuery,
  useLazyExportCronQuery,
} = schedulerApi;
