import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';

export type ContentAuditMetricType =
  | 'keyword-metrics'
  | 'performance-metrics'
  | 'content-metrics'
  | 'backlink-metrics';

export class ContentAuditMetricsService {
  async runMetric(jobId: string, metric: ContentAuditMetricType, urls?: string[]): Promise<{
    accepted: boolean;
    job_id: string;
    metric: ContentAuditMetricType;
    urls: string[];
  }> {
    const endpoint = `${env.NPY_BACKEND_URL}/content-audit/metrics/run`;

    const payload: { job_id: string; metric: ContentAuditMetricType; urls?: string[] } = {
      job_id: jobId,
      metric,
    };

    if (urls && urls.length > 0) {
      payload.urls = urls;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = (body as any).error || res.statusText;
      logger.error(`Content audit metric run request failed: ${res.status} – ${detail}`);
      throw new Error(`Content audit metric run failed: ${detail}`);
    }

    return (await res.json()) as {
      accepted: boolean;
      job_id: string;
      metric: ContentAuditMetricType;
      urls: string[];
    };
  }
}