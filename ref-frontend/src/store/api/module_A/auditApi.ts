import { baseApi } from '../baseApi';

export interface AuditSchedule {
  id: number;
  sessionId: number;
  enabled: boolean;
  cronExpression: string;
  auditDevice: 'mobile' | 'desktop';
  createdAt: string;
  updatedAt: string;
}

export interface AuditExecution {
  id: number;
  scheduleId: number;
  status: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface CreateScheduleRequest {
  sessionId: number;
  cronExpression: string;
  auditDevice: 'mobile' | 'desktop';
}

export interface UpdateScheduleRequest {
  cronExpression?: string;
  auditDevice?: 'mobile' | 'desktop';
}

export interface AuditExecutionsParams {
  limit?: number;
  scheduleId?: number;
}

export const auditApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSchedules: builder.query<AuditSchedule[], void>({
      query: () => '/api/audit-schedules/schedules',
      providesTags: ['Audit'],
    }),
    getExecutions: builder.query<AuditExecution[], AuditExecutionsParams>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.limit) searchParams.set('limit', String(params.limit));
        if (params.scheduleId) searchParams.set('scheduleId', String(params.scheduleId));
        return `/api/audit-schedules/executions?${searchParams.toString()}`;
      },
      providesTags: ['Audit'],
    }),
    createSchedule: builder.mutation<AuditSchedule, CreateScheduleRequest>({
      query: (data) => ({
        url: '/api/audit-schedules/schedules',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Audit'],
    }),
    updateSchedule: builder.mutation<AuditSchedule, { id: number; data: UpdateScheduleRequest }>({
      query: ({ id, data }) => ({
        url: `/api/audit-schedules/schedules/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Audit'],
    }),
    deleteSchedule: builder.mutation<void, number>({
      query: (id) => ({
        url: `/api/audit-schedules/schedules/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Audit'],
    }),
    toggleSchedule: builder.mutation<AuditSchedule, number>({
      query: (id) => ({
        url: `/api/audit-schedules/schedules/${id}/toggle`,
        method: 'POST',
      }),
      invalidatesTags: ['Audit'],
    }),
    triggerSchedule: builder.mutation<void, number>({
      query: (id) => ({
        url: `/api/audit-schedules/schedules/${id}/trigger`,
        method: 'POST',
      }),
      invalidatesTags: ['Audit'],
    }),
    getAuditResults: builder.query<any, { sessionId: number; device?: 'mobile' | 'desktop' }>({
      query: ({ sessionId, device }) => {
        const searchParams = new URLSearchParams();
        searchParams.set('sessionId', String(sessionId));
        if (device) searchParams.set('device', device);
        return `/api/audits?${searchParams.toString()}`;
      },
      providesTags: ['Audit'],
    }),
    startAudit: builder.mutation<void, { sessionId: number; device?: 'mobile' | 'desktop' }>({
      query: ({ sessionId, device }) => ({
        url: `/api/crawl/${sessionId}/run-audits`,
        method: 'POST',
        body: { device: device || 'desktop' },
      }),
      invalidatesTags: ['Audit'],
    }),
  }),
});

export const {
  useGetSchedulesQuery,
  useGetExecutionsQuery,
  useCreateScheduleMutation,
  useUpdateScheduleMutation,
  useDeleteScheduleMutation,
  useToggleScheduleMutation,
  useTriggerScheduleMutation,
  useGetAuditResultsQuery,
  useLazyGetAuditResultsQuery,
  useStartAuditMutation,
} = auditApi;
