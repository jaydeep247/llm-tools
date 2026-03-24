import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';

export class BrandOnboardingService {
  /**
   * Call the Python backend HTTP endpoint to generate a brand description
   * from the given URL.  When jobId is provided the Python backend will
   * load HTML from S3 and store the result in MongoDB.
   */
  async generateBrandDescription(url: string, jobId?: string): Promise<string> {
    const baseUrl = env.NPY_BACKEND_URL;
    const endpoint = `${baseUrl}/brand-onboarding/describe`;

    const payload: Record<string, string> = { url };
    if (jobId) payload.job_id = jobId;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = (body as any).error || res.statusText;
      logger.error(`Brand description request failed: ${res.status} – ${detail}`);
      throw new Error(`Brand description generation failed: ${detail}`);
    }

    const data = (await res.json()) as { description: string };
    return data.description;
  }

  /**
   * Retrieve a previously generated brand description by job ID.
   * Returns null when no description has been stored yet.
   */
  async getBrandDescription(jobId: string): Promise<string | null> {
    const baseUrl = env.NPY_BACKEND_URL;
    const endpoint = `${baseUrl}/brand-onboarding/description/${encodeURIComponent(jobId)}`;

    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = (body as any).error || res.statusText;
      logger.error(`Get brand description failed: ${res.status} – ${detail}`);
      throw new Error(`Failed to get brand description: ${detail}`);
    }

    const data = (await res.json()) as { description: string };
    return data.description;
  }
}
