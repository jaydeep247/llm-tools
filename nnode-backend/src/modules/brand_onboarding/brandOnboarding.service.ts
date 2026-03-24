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
  /**
   * Retrieve all stored onboarding data by job ID.
   * Returns null when no data has been stored yet.
   */
  async getOnboardingData(jobId: string): Promise<{
    description: string | null;
    topics_generated: string[];
    topics_selected: string[];
    prompts_generated: Array<{ prompt: string; type: string }>;
    prompts_selected: string[];
  } | null> {
    const baseUrl = env.NPY_BACKEND_URL;
    const endpoint = `${baseUrl}/brand-onboarding/data/${encodeURIComponent(jobId)}`;

    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = (body as any).error || res.statusText;
      logger.error(`Get onboarding data failed: ${res.status} \u2013 ${detail}`);
      throw new Error(`Failed to get onboarding data: ${detail}`);
    }

    return await res.json() as {
      description: string | null;
      topics_generated: string[];
      topics_selected: string[];
      prompts_generated: Array<{ prompt: string; type: string }>;
      prompts_selected: string[];
    };
  }
  /**
   * Generate brand-relevant topics via the Python backend.
   */
  async generateBrandTopics(
    url: string,
    brandName: string,
    brandDescription: string,
    jobId?: string,
  ): Promise<string[]> {
    const baseUrl = env.NPY_BACKEND_URL;
    const endpoint = `${baseUrl}/brand-onboarding/topics`;

    const payload: Record<string, string> = { url, brand_name: brandName, brand_description: brandDescription };
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
      logger.error(`Brand topics request failed: ${res.status} – ${detail}`);
      throw new Error(`Brand topics generation failed: ${detail}`);
    }

    const data = (await res.json()) as { topics: string[] };
    return data.topics;
  }

  /**
   * Save the user's selected topics via the Python backend.
   */
  async saveBrandTopics(jobId: string, selectedTopics: string[]): Promise<void> {
    const baseUrl = env.NPY_BACKEND_URL;
    const endpoint = `${baseUrl}/brand-onboarding/topics/save`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, selected_topics: selectedTopics }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = (body as any).error || res.statusText;
      logger.error(`Save brand topics failed: ${res.status} – ${detail}`);
      throw new Error(`Failed to save brand topics: ${detail}`);
    }
  }

  /**
   * Generate brand prompts via the Python backend.
   */
  async generateBrandPrompts(
    brandName: string,
    brandDescription: string,
    selectedTopics: string[],
    jobId?: string,
  ): Promise<Array<{ prompt: string; type: string }>> {
    const baseUrl = env.NPY_BACKEND_URL;
    const endpoint = `${baseUrl}/brand-onboarding/prompts`;

    const payload: Record<string, any> = {
      brand_name: brandName,
      brand_description: brandDescription,
      selected_topics: selectedTopics,
    };
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
      logger.error(`Brand prompts request failed: ${res.status} – ${detail}`);
      throw new Error(`Brand prompts generation failed: ${detail}`);
    }

    const data = (await res.json()) as { prompts: Array<{ prompt: string; type: string }> };
    return data.prompts;
  }

  /**
   * Save the user's selected prompts via the Python backend.
   */
  async saveBrandPrompts(jobId: string, selectedPrompts: string[]): Promise<void> {
    const baseUrl = env.NPY_BACKEND_URL;
    const endpoint = `${baseUrl}/brand-onboarding/prompts/save`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, selected_prompts: selectedPrompts }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = (body as any).error || res.statusText;
      logger.error(`Save brand prompts failed: ${res.status} – ${detail}`);
      throw new Error(`Failed to save brand prompts: ${detail}`);
    }
  }

  /**
   * Execute all prompts against GPT, Gemini, and Claude via the Python backend.
   * Analyzes each response for brand visibility.
   */
  async executeBrandPrompts(
    brandName: string,
    prompts: Array<{ prompt: string; type: string }>,
    jobId?: string,
  ): Promise<any[]> {
    const baseUrl = env.NPY_BACKEND_URL;
    const endpoint = `${baseUrl}/brand-onboarding/prompts/execute`;

    const payload: Record<string, any> = {
      brand_name: brandName,
      prompts,
    };
    if (jobId) payload.job_id = jobId;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300_000), // 5 min safety margin
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = (body as any).error || res.statusText;
      logger.error(`Execute brand prompts failed: ${res.status} – ${detail}`);
      throw new Error(`Brand prompts execution failed: ${detail}`);
    }

    const data = (await res.json()) as { results: any[] };
    return data.results;
  }

  /**
   * Retrieve stored prompt execution results for a job.
   */
  async getBrandPromptResults(jobId: string): Promise<any[] | null> {
    const baseUrl = env.NPY_BACKEND_URL;
    const endpoint = `${baseUrl}/brand-onboarding/prompts/results/${encodeURIComponent(jobId)}`;

    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = (body as any).error || res.statusText;
      logger.error(`Get prompt results failed: ${res.status} – ${detail}`);
      throw new Error(`Failed to get prompt results: ${detail}`);
    }

    const data = (await res.json()) as { results: any[] };
    return data.results;
  }
}
