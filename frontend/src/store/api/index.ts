// Export all API services for easier imports
export * from './baseApi';
export * from './authApi';
export * from './module_A/dataApi';
export * from './module_A/linksApi';
export * from './module_A/crawlApi';
export * from './module_B/seoApi';
export * from './module_C/aeoApi';
export * from './module_C/entityExtractorApi';
export * from './module_E/sentimentApi';

// Export auditApi separately to avoid conflicts
export {
  useGetSchedulesQuery as useGetAuditSchedulesQuery,
  useGetExecutionsQuery,
  useCreateScheduleMutation as useCreateAuditScheduleMutation,
  useUpdateScheduleMutation as useUpdateAuditScheduleMutation,
  useDeleteScheduleMutation as useDeleteAuditScheduleMutation,
  useToggleScheduleMutation as useToggleAuditScheduleMutation,
  useTriggerScheduleMutation as useTriggerAuditScheduleMutation,
  useGetAuditResultsQuery,
  useLazyGetAuditResultsQuery,
  type AuditSchedule,
  type AuditExecution,
  type CreateScheduleRequest as CreateAuditScheduleRequest,
  type UpdateScheduleRequest as UpdateAuditScheduleRequest,
} from './module_A/auditApi';

// Export schedulerApi separately to avoid conflicts
export {
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
  type Schedule,
  type ScheduleStats,
  type CreateScheduleRequest,
  type UpdateScheduleRequest,
  type ValidateCronRequest,
  type ValidateCronResponse,
  type CronHistoryItem,
  type CronStats,
} from './module_D/schedulerApi';
