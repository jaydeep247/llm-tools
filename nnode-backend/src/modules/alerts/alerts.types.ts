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

export interface Alert {
  _id?: string;
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
}

export interface AlertResponse {
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
  /** true if snoozed_until is in the future */
  is_snoozed: boolean;
  /** true if not dismissed, not resolved, and not actively snoozed */
  is_active: boolean;
}

export interface AlertsListResponse {
  alerts: AlertResponse[];
  active_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  info_count: number;
}

export interface AlertActionResult {
  success: boolean;
  message: string;
  snoozed_until?: string;
}
