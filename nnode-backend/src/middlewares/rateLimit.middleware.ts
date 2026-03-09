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

    // Atomically increment and read the remaining TTL in a single round-trip.
    const [[, hits], [, ttl]] = (await client.pipeline().incr(k).pttl(k).exec()) as [
      [null, number],
      [null, number],
    ];

    // Set expiry on the very first hit or if it was somehow lost.
    if ((hits as number) === 1 || (ttl as number) === -1) {
      await client.pexpire(k, this.windowMs);
    }

    const remaining = (ttl as number) > 0 ? (ttl as number) : this.windowMs;
    return {
      totalHits: hits as number,
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
 * GLOBAL guard — applies to every route as a last-resort safety net.
 * 1 000 requests per IP per 15 minutes (~67 req/min average).
 * Load-balancer health probes are exempt.
 */
export const globalRateLimit = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 1000,
  store: new RedisRateLimitStore('global', 15 * 60 * 1000),
  skip: (req) => req.path.endsWith('/health') || req.path.endsWith('/auth/me'),
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
