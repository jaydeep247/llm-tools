/**
 * URL-level result cache.
 *
 * Purpose: avoid repeating expensive paid-API work (OpenAI, Claude, Gemini,
 * DataForSEO, etc.) when multiple users analyse the same URL within the
 * configured TTL window.  A single MongoDB document per normalised URL holds
 * pointers to the real job IDs whose data is already stored in every module
 * collection.
 *
 * TTL semantics
 * ─────────────
 * • Root document (crawl):
 *     – Created / re-armed with expiresAt = now + URL_CACHE_TTL_DAYS whenever
 *       a real CRAWL or MODULE_E_QUICK_START completes.
 *     – MongoDB TTL index on `expiresAt` deletes the whole document when the
 *       crawl TTL lapses and no further crawl has re-armed it.
 *
 * • Per-module slots (module_c, module_d, module_e, module_f, schema, …):
 *     – Each slot has an independent expiry stored in `modulesExpiresAt[key]`.
 *     – When a real module job completes, that slot's expiry is set to
 *       now + URL_CACHE_TTL_DAYS.
 *     – cache-hit check reads BOTH: root expiresAt > now AND
 *       modulesExpiresAt[key] > now.  If the module slot has lapsed the job
 *       is dispatched normally and the slot is re-armed on completion.
 *
 * • TTL is configured via URL_CACHE_TTL_DAYS env var (default 7 days).
 *   Set to 0 to disable caching entirely.
 *
 * Cache-hit flow (Node side)
 * ──────────────────────────
 *  createJob() finds a valid entry → creates the Job document with
 *  status=COMPLETED, isCacheHit=true, cacheSourceJobId=<real-job-id>, then
 *  returns immediately without dispatching to RabbitMQ.  All read services
 *  call resolveEffectiveJobId(newJobId) → cacheSourceJobId and read from DB
 *  using that ID, so the frontend gets real data transparently.
 */

/** Fallback constant — actual value is driven by URL_CACHE_TTL_DAYS env var. */
export const URL_CACHE_TTL_DAYS = 7;

/**
 * Per-module result pointers stored inside a UrlCacheEntry.
 * Each value is the jobId of the real job whose data lives in the
 * corresponding MongoDB collection.
 */
export interface UrlCacheModules {
  /** MODULE_E_QUICK_START — module_e collection */
  quick_start?: string;
  /** AEO_ANALYSIS + all MODULE_C_* variants — module_c collection */
  module_c?: string;
  /** MODULE_D + all MODULE_D_* variants — prompt_jobs / content_metrics collections */
  module_d?: string;
  /** MODULE_E_CONSISTENCY + other Module E sub-jobs — module_e collection */
  module_e?: string;
  /** MODULE_F_COMPETITOR_AI_INTELLIGENCE — module_f / cbm_aivs_d7 collections */
  module_f?: string;
  /** MODULE_A_SERP — serp_results collection */
  module_a_serp?: string;
  /** SCHEMA — schemas collection */
  schema?: string;
}

export type UrlCacheModuleKey = keyof UrlCacheModules;

export interface UrlCacheEntry {
  /** Normalised URL — primary lookup key (unique index). */
  url: string;
  /**
   * JobId of the CRAWL (or MODULE_E_QUICK_START) job whose pages / links /
   * fields / job_summaries data is stored in MongoDB.  All page-level read
   * services resolve to this ID.
   */
  crawlJobId: string;
  /** Per-module analysis pointers. */
  modules: UrlCacheModules;
  /**
   * Per-module independent expiry timestamps.
   * Each key matches a UrlCacheModuleKey.  A module slot is only served as a
   * cache hit when BOTH `expiresAt > now` AND `modulesExpiresAt[key] > now`.
   * Set to `now + TTL` each time that module's real job completes.
   */
  modulesExpiresAt: Partial<Record<UrlCacheModuleKey, Date>>;
  /** Absolute expiry timestamp for the root crawl entry.  MongoDB TTL index removes the doc after this. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
