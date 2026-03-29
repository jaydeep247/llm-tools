import rateLimit, { type Options, type Store } from 'express-rate-limit';
import type { Request } from 'express';
import { getRedisClient } from '../config/redis';

/**
 * Redis-backed fixed-window store for express-rate-limit.
 *
 * Uses an atomic INCR + PEXPIRE pipeline so counts are consistent across
 * multiple Node instances behind a load-balancer.  No additional npm package
 * is required — it builds on the ioredis client that is already wired up.
 */
class RedisRateLimitStore implements Store {
  private windowMs: number;
  private readonly _prefix: string;

  private static readonly INCR_AND_TTL_SCRIPT = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local hits = redis.call('INCR', key)
if hits == 1 then
  redis.call('PEXPIRE', key, window)
end
local ttl = redis.call('PTTL', key)
if ttl < 0 then
  redis.call('PEXPIRE', key, window)
  ttl = window
end
return {hits, ttl}
`;

  constructor(prefix: string, windowMs: number) {
    this._prefix = prefix;
    this.windowMs = windowMs;
  }

  /** Called by express-rate-limit once it knows the final windowMs. */
  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(raw: string): string {
    return `rl:${this._prefix}:${raw}`;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date | undefined }> {
    const client = getRedisClient();
    const k = this.key(key);

    // Single Redis command keeps per-request limiter overhead minimal.
    const [hitsRaw, ttlRaw] = (await client.eval(
      RedisRateLimitStore.INCR_AND_TTL_SCRIPT,
      1,
      k,
      String(this.windowMs),
    )) as [number, number];

    const hits = Number(hitsRaw) || 0;
    const ttl = Number(ttlRaw) || this.windowMs;
    const remaining = ttl > 0 ? ttl : this.windowMs;
    return {
      totalHits: hits,
      resetTime: new Date(Date.now() + remaining),
    };
  }

  async decrement(key: string): Promise<void> {
    await getRedisClient().decr(this.key(key));
  }

  async resetKey(key: string): Promise<void> {
    await getRedisClient().del(this.key(key));
  }
}

/**
 * Key generator for authenticated routes.
 *
 * Prefers the user's database ID (set by authMiddleware on req.user) over the
 * client IP so that multiple users behind a corporate NAT do not share a quota
 * and a single user is rate-limited regardless of IP rotation.
 */
function userOrIpKey(req: Request): string {
  const user = (req as any).user as { id?: string } | undefined;
  if (user?.id) return `user:${user.id}`;
  return req.ip ?? req.socket?.remoteAddress ?? 'anonymous';
}

/** Options shared by every limiter — IETF RateLimit header draft-7. */
const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
};

// ─── Exportable limiters ────────────────────────────────────────────────────

/**
 * Read-only polling paths that the frontend hits at high frequency.
 * These are safe GET endpoints (no mutations) and are throttled client-side
 * by polling intervals, so they are exempt from the global counter.
 */
const POLLING_GET_RE = /\/snapshot(?:\/|$)|\/jobs(?:\/|$)|\/summary(?:\/|$)|\/results\/|\/site-structure(?:\/|$)|\/projects\/[^/]+$/;

/**
 * GLOBAL guard — applies to every route as a last-resort safety net.
 * 3 000 requests per IP per 15 minutes (~200 req/min average).
 * High-frequency read-only polling GETs, health probes, and session checks
 * are exempt so they don't exhaust the shared IP budget.
 */
export const globalRateLimit = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 3000,
  store: new RedisRateLimitStore('global', 15 * 60 * 1000),
  skip: (req) =>
    req.path.endsWith('/health') ||
    req.path.endsWith('/auth/me') ||
    (req.method === 'GET' && POLLING_GET_RE.test(req.path)),
  message: { success: false, message: 'Too many requests, please try again later.' },
});

/**
 * CREDENTIAL guard — must be applied only to login & signup routes.
 * 20 attempts per IP per 15 minutes to stop brute-force and credential-stuffing.
 * Session-check endpoints (/me, /logout) must NOT use this limiter.
 */
export const credentialRateLimit = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 20,
  store: new RedisRateLimitStore('credential', 15 * 60 * 1000),
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
});

/**
 * SESSION guard — for lightweight session-check endpoints like /auth/me.
 * 600 requests per user (or IP) per 15 minutes (~40 req/min average).
 * Keyed on user ID when authenticated so IP rotation or NAT does not count
 * against other users.
 */
export const sessionRateLimit = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 600,
  store: new RedisRateLimitStore('session', 15 * 60 * 1000),
  keyGenerator: userOrIpKey,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

/**
 * WRITE guard — state-mutating endpoints (POST / PUT / PATCH / DELETE).
 * 200 requests per user (or IP) per minute.
 * Keys on user ID when the request is authenticated (set by authMiddleware).
 * GET requests and health probes are automatically skipped.
 */
export const writeRateLimit = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  max: 200,
  store: new RedisRateLimitStore('write', 60 * 1000),
  keyGenerator: userOrIpKey,
  skip: (req) => req.method === 'GET' || req.path.endsWith('/health'),
  message: { success: false, message: 'Too many requests, please slow down.' },
});
