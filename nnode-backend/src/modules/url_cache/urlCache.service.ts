import { UrlCacheEntry, UrlCacheModuleKey } from './urlCache.types';
import { urlCacheRepository } from './urlCache.repository';
import { JobType } from '../job/job.types';

// ─────────────────────────────────────────────────────────────────────────────
// URL normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical URL form used as the cache key.
 *
 * Rules applied (in order):
 *  1. Prepend https:// if no scheme given
 *  2. Lowercase the entire string
 *  3. Strip www. prefix from hostname
 *  4. Normalise protocol to https
 *  5. Strip URL fragment (#…)
 *  6. Strip known tracking query params (utm_*, fbclid, gclid, ref, …)
 *  7. Remove trailing slash from path (root "/" is preserved)
 *
 * This ensures that users hitting https://www.example.com, http://example.com/,
 * and https://example.com?utm_source=newsletter all map to the same entry.
 */
export function normalizeUrlForCache(url: string): string {
  try {
    const raw = (url || '').trim();
    const full =
      raw.startsWith('http://') || raw.startsWith('https://')
        ? raw
        : `https://${raw}`;

    const parsed = new URL(full);

    // Hostname: lowercase + strip www.
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);

    // Path: lowercase + strip trailing slash (keep bare "/" as "/")
    let path = parsed.pathname.toLowerCase();
    if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);
    if (!path) path = '/';

    // Query: strip tracking params, sort remaining for determinism
    const TRACKING = new Set([
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
      'utm_content', 'utm_id', 'fbclid', 'gclid', 'gclsrc',
      'ref', 'mc_cid', 'mc_eid', 'msclkid', 'twclid',
    ]);
    const params = new URLSearchParams(parsed.search);
    const cleaned = new URLSearchParams();
    for (const [k, v] of params.entries()) {
      if (!TRACKING.has(k.toLowerCase())) cleaned.append(k, v);
    }
    // Sort for determinism
    const sortedParams = new URLSearchParams([...cleaned.entries()].sort(([a], [b]) => a.localeCompare(b)));
    const qs = sortedParams.toString();

    return `https://${host}${path}${qs ? `?${qs}` : ''}`;
  } catch {
    return (url || '').toLowerCase().trim();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job-type → cache module key mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a job type to either 'crawl' (for the root crawl data pointer) or a
 * specific UrlCacheModuleKey.  Returns null for job types we do not cache
 * (e.g. CRAWL_RESUME which continues an existing crawl rather than producing
 * fresh analysis).
 *
 * 'crawl' is a sentinel that means "use entry.crawlJobId" rather than a module key.
 */
export function getCacheKeyForJobType(jobType: JobType): 'crawl' | UrlCacheModuleKey | null {
  switch (jobType) {
    case JobType.CRAWL:
      return 'crawl';

    case JobType.MODULE_E_QUICK_START:
      return 'quick_start';

    case JobType.AEO_ANALYSIS:
    case JobType.MODULE_C_AI_PRESENCE:
    case JobType.MODULE_C_ANSWERABILITY:
    case JobType.MODULE_C_KNOWLEDGE_BASE:
    case JobType.MODULE_C_COMPETITOR:
    case JobType.MODULE_C_LLM_SIMULATOR:
    case JobType.MODULE_C_BULK_AUDIT:
      return 'module_c';

    case JobType.MODULE_D:
    case JobType.CONTENT_METRICS:
    case JobType.MODULE_D_ENTITY_ANALYSIS:
    case JobType.MODULE_D_PROMPT_TRACKING:
      return 'module_d';

    case JobType.MODULE_E_FULL:
    case JobType.MODULE_E_CONSISTENCY:
    case JobType.MODULE_E_SENTIMENT:
    case JobType.MODULE_E_COMPETITORS:
    case JobType.MODULE_E_AI_SOV:
    case JobType.MODULE_E_RANKING:
    case JobType.MODULE_E_BRAND:
      return 'module_e';

    case JobType.MODULE_F_COMPETITOR_AI_INTELLIGENCE:
      return 'module_f';

    case JobType.MODULE_A_SERP:
      return 'module_a_serp';

    case JobType.SCHEMA:
      return 'schema';

    // CRAWL_RESUME is a continuation — we never serve it from cache because it
    // is only triggered for an existing paused job, and on completion we do NOT
    // write to cache either (the original CRAWL job's cache entry already exists).
    case JobType.CRAWL_RESUME:
    default:
      return null;
  }
}

/**
 * Extract the relevant cached jobId from a cache entry for the requested job type.
 * Returns null if:
 *  - no cached data exists for this job type, OR
 *  - the per-module expiry has lapsed (even if the root document is still valid).
 * Returning null causes createJob() to dispatch the job normally and re-arm
 * the module slot on completion.
 */
export function resolveCachedJobId(
  entry: UrlCacheEntry,
  jobType: JobType,
): string | null {
  const cacheKey = getCacheKeyForJobType(jobType);
  if (!cacheKey) return null;

  if (cacheKey === 'crawl') {
    return entry.crawlJobId || null;
  }

  const jobId = entry.modules[cacheKey] ?? null;
  if (!jobId) return null;

  // Check per-module independent expiry.
  // If the module slot's own TTL has lapsed, treat as a miss so the job runs
  // fresh and re-arms the slot on completion.
  const moduleExpiry = entry.modulesExpiresAt?.[cacheKey];
  if (!moduleExpiry || new Date(moduleExpiry) <= new Date()) return null;

  return jobId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API used by job.service.ts (read) and job-events.consumer.ts (write)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a valid (non-expired) cache entry for a URL.
 * Always fails open — returns null on any DB error.
 */
export async function checkUrlCache(url: string): Promise<UrlCacheEntry | null> {
  if (!url) return null;
  return urlCacheRepository.findValid(url);
}

/**
 * Persist / refresh the crawl-level result pointer for a URL.
 * Called in the job-events consumer after a real CRAWL/CRAWL_RESUME completes.
 */
export async function setCrawlCache(url: string, crawlJobId: string): Promise<void> {
  if (!url || !crawlJobId) return;
  return urlCacheRepository.upsertCrawlJobId(url, crawlJobId);
}

/**
 * Persist a module-analysis result pointer for a URL.
 * Called in the job-events consumer after any module job completes.
 */
export async function setModuleCache(
  url: string,
  moduleKey: UrlCacheModuleKey,
  jobId: string,
): Promise<void> {
  if (!url || !jobId) return;
  return urlCacheRepository.upsertModule(url, moduleKey, jobId);
}

/**
 * Write the appropriate cache entry after a real job completes.
 * Centralises the fan-out logic that job-events.consumer.ts needs.
 */
export async function writeCacheOnCompletion(
  url: string,
  jobType: JobType,
  jobId: string,
): Promise<void> {
  if (!url || !jobId) return;

  const cacheKey = getCacheKeyForJobType(jobType);
  if (!cacheKey) return;

  if (cacheKey === 'crawl') {
    await setCrawlCache(url, jobId);
  } else {
    await setModuleCache(url, cacheKey, jobId);
  }

  // MODULE_E_QUICK_START also sets the crawlJobId because quick-start
  // performs a full site crawl — pages/links/fields are stored under the
  // same jobId (the quick_start job).
  if (jobType === JobType.MODULE_E_QUICK_START) {
    await setCrawlCache(url, jobId);
  }
}
