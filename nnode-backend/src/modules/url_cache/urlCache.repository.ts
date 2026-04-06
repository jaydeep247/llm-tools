import { connectToMongo } from '../../config/mongo';
import { UrlCacheEntry, UrlCacheModuleKey } from './urlCache.types';
import { normalizeUrlForCache } from './urlCache.service';
import { logger } from '../../shared/logger/logger';
import { env } from '../../config/env';

const COLLECTION = 'url_cache';

/** Resolve TTL in milliseconds from the env var (0 = caching disabled). */
function ttlMs(): number {
  return env.URL_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export class UrlCacheRepository {
  /**
   * Ensure indexes exist.  Call once at startup (idempotent).
   * - unique index on `url` for O(1) cache lookup
   * - TTL index on `expiresAt` so MongoDB auto-removes expired entries
   */
  async ensureIndexes(): Promise<void> {
    try {
      const db = await connectToMongo();
      const col = db.collection(COLLECTION);
      await col.createIndex({ url: 1 }, { unique: true });
      // expireAfterSeconds=0 means MongoDB uses the field value itself as the expiry time
      await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      logger.info('[URL_CACHE] Indexes ensured on url_cache collection');
    } catch (err) {
      logger.warn('[URL_CACHE] ensureIndexes failed (non-fatal):', err);
    }
  }

  /**
   * Return the cache entry for this URL only when the root crawl TTL has NOT
   * yet expired.  Per-module slot expiry is checked separately in
   * resolveCachedJobId() so a lapsed module still allows the root lookup to
   * succeed (the crawl pointer remains valid).
   * Returns null on cache miss or any DB error (fail-open).
   */
  async findValid(url: string): Promise<UrlCacheEntry | null> {
    try {
      // TTL=0 means caching is disabled
      if (ttlMs() === 0) return null;

      const normalized = normalizeUrlForCache(url);
      const db = await connectToMongo();
      const doc = await db.collection<UrlCacheEntry>(COLLECTION).findOne({
        url: normalized,
        expiresAt: { $gt: new Date() },
      });
      return doc ?? null;
    } catch (err) {
      logger.warn('[URL_CACHE] findValid error (fail-open):', err);
      return null;
    }
  }

  /**
   * Upsert the crawlJobId for a URL and (re-)set the crawl-level expiry.
   * Called after a real CRAWL or CRAWL_RESUME completes successfully.
   * Uses $max so concurrent writes only ever advance the clock, never shorten it.
   */
  async upsertCrawlJobId(url: string, crawlJobId: string): Promise<void> {
    try {
      const normalized = normalizeUrlForCache(url);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs());
      const db = await connectToMongo();
      await db.collection<UrlCacheEntry>(COLLECTION).updateOne(
        { url: normalized },
        {
          $set: { crawlJobId, updatedAt: now },
          $max: { expiresAt },
          // Only createdAt on first insert — never touch modules.* or modulesExpiresAt.*
          // here to avoid path conflicts with upsertModule's sub-path writes.
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
      logger.info(`[URL_CACHE] crawlJobId set for ${normalized} → ${crawlJobId} (expires ${expiresAt.toISOString()})`);
    } catch (err) {
      logger.warn('[URL_CACHE] upsertCrawlJobId error (non-fatal):', err);
    }
  }

  /**
   * Update a specific module-analysis pointer AND set that module's individual
   * expiry to now + TTL.  The root crawl TTL is not touched.
   *
   * Uses a single atomic upsert — if no root entry exists yet, one is created
   * with an empty crawlJobId (backfilled when CRAWL completes later).
   *
   * Called after any module analysis job completes for this URL.
   */
  async upsertModule(url: string, moduleKey: UrlCacheModuleKey, jobId: string): Promise<void> {
    try {
      const normalized = normalizeUrlForCache(url);
      const now = new Date();
      const moduleExpiresAt = new Date(now.getTime() + ttlMs());
      const db = await connectToMongo();
      await db.collection<UrlCacheEntry>(COLLECTION).updateOne(
        { url: normalized },
        {
          // $set writes only leaf sub-paths — no parent-level writes anywhere in
          // this operation so MongoDB never sees a path hierarchy conflict.
          $set: {
            [`modules.${moduleKey}`]: jobId,
            [`modulesExpiresAt.${moduleKey}`]: moduleExpiresAt,
            updatedAt: now,
          },
          // $max: advances root expiresAt on bootstrap (no-op if crawl already set a
          // later date). Different path from $set keys — no conflict possible.
          $max: { expiresAt: moduleExpiresAt },
          // $setOnInsert: only scalar fields, never any modules.* or
          // modulesExpiresAt.* writes — eliminates the parent/child conflict.
          $setOnInsert: { createdAt: now, crawlJobId: '' },
        },
        { upsert: true },
      );
      logger.info(
        `[URL_CACHE] modules.${moduleKey} set for ${normalized} → ${jobId} (module expires ${moduleExpiresAt.toISOString()})`,
      );
    } catch (err) {
      logger.warn('[URL_CACHE] upsertModule error (non-fatal):', err);
    }
  }
}

export const urlCacheRepository = new UrlCacheRepository();
