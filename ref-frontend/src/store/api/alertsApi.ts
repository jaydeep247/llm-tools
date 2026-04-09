import { baseApi } from './baseApi';

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'info';
export type AlertType =
  | 'score_drop'
  | 'citation_loss'
  | 'crawl_fail'
  | 'competitor_citation_gain'
  | 'schema_error'
  | 'prompt_zero_visibility'
  | 'sov_drop'
  | 'competitor_new_page';

export interface AlertItem {
  id: string;
  jobId: string;
  projectId: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  triggered_at: string;
  resolved_at: string | null;
  snoozed_until: string | null;
  message: string;
  recommendation: string;
  affected_metric: string | null;
  affected_model: string | null;
  is_dismissed: boolean;
  days_unresolved: number;
  is_snoozed: boolean;
  is_active: boolean;
}

export interface AlertsData {
  alerts: AlertItem[];
  active_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  info_count: number;
}

export interface AlertCountData {
  count: number;
  critical: number;
}

export const alertsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAlerts: builder.query<AlertsData, string>({
      query: (jobId) => `/jobs/${jobId}/alerts`,
      transformResponse: (response: { data: AlertsData }) => response.data,
      providesTags: (_result, _err, jobId) => [{ type: 'Alerts', id: jobId }],
    }),
    getAlertCount: builder.query<AlertCountData, string>({
      query: (jobId) => `/jobs/${jobId}/alerts/count`,
      transformResponse: (response: { data: AlertCountData }) => response.data,
      providesTags: (_result, _err, jobId) => [{ type: 'Alerts', id: `count-${jobId}` }],
    }),
    dismissAlert: builder.mutation<{ success: boolean }, string>({
      query: (alertId) => ({ url: `/alerts/${alertId}/dismiss`, method: 'POST' }),
      transformResponse: (response: { data: { success: boolean } }) => response.data,
      invalidatesTags: ['Alerts'],
    }),
    resolveAlert: builder.mutation<{ success: boolean }, string>({
      query: (alertId) => ({ url: `/alerts/${alertId}/resolve`, method: 'POST' }),
      transformResponse: (response: { data: { success: boolean } }) => response.data,
      invalidatesTags: ['Alerts'],
    }),
    snoozeAlert: builder.mutation<{ success: boolean; snoozed_until: string }, { alertId: string; days?: number }>({
      query: ({ alertId, days = 7 }) => ({
        url: `/alerts/${alertId}/snooze`,
        method: 'POST',
        body: { days },
      }),
      transformResponse: (response: { data: { success: boolean; snoozed_until: string } }) => response.data,
      invalidatesTags: ['Alerts'],
    }),
  }),
});

export const {
  useGetAlertsQuery,
  useGetAlertCountQuery,
  useDismissAlertMutation,
  useResolveAlertMutation,
  useSnoozeAlertMutation,
} = alertsApi;
