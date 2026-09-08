import { headers } from 'next/headers';

/**
 * Rate limiting for the endpoints that cost money or leak information.
 *
 * Redis when it is configured, an in-process map when it is not. The fallback
 * is deliberately honest about what it is: it counts per server process, so on
 * more than one instance it lets through roughly one bucket per instance. That
 * is still far better than nothing for the three things this guards, and it
 * means development does not need Redis running.
 *
 * What this protects:
 *
 *   - sign-in, against someone working through a password list
 *   - booking, against a script holding every night on every villa
 *   - slip upload, against filling the disk with images
 *
 * It is not a general request limiter. nginx and the platform in front of it
 * are better placed for that, and putting every page render through Redis
 * would add a network hop to reads that do not need one.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the bucket refills. Zero when allowed. */
  retryAfter: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const memory = new Map<string, Bucket>();

/** Trims expired buckets so a long-running process does not grow unbounded. */
function sweepMemory(now: number): void {
  if (memory.size < 5_000) return;
  for (const [key, bucket] of memory) {
    if (bucket.resetAt <= now) memory.delete(key);
  }
}

export async function rateLimit(
  action: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key = `rl:${action}:${identifier}`;
  const now = Date.now();

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      return await redisLimit(redisUrl, key, limit, windowSeconds);
    } catch {
      // Redis being down must not take sign-in down with it. Fall through to
      // the in-process counter, which is worse but is not an outage.
    }
  }

  sweepMemory(now);
  const bucket = memory.get(key);

  if (!bucket || bucket.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfter: 0 };
}

async function redisLimit(
  url: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { default: Redis } = await import('ioredis');
  const redis = getRedis(url, Redis);

  // INCR then EXPIRE only on the first hit, so the window is fixed rather
  // than sliding forward with every request and never expiring.
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);

  if (count > limit) {
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSeconds };
  }

  return { allowed: true, retryAfter: 0 };
}

type RedisClient = { incr(key: string): Promise<number>; expire(key: string, s: number): Promise<number>; ttl(key: string): Promise<number> };

const globalWithRedis = globalThis as typeof globalThis & { __poolvillaRedis?: RedisClient };

/** One connection per process, reused across hot reloads. */
function getRedis(url: string, Redis: new (url: string, options?: object) => RedisClient): RedisClient {
  globalWithRedis.__poolvillaRedis ??= new Redis(url, {
    maxRetriesPerRequest: 1,
    // Fail fast rather than queueing commands while Redis is unreachable; the
    // caller falls back to the in-process counter.
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  return globalWithRedis.__poolvillaRedis;
}

/**
 * Who to count against.
 *
 * The leftmost X-Forwarded-For entry, because nginx appends the real client
 * and any upstream proxy chain in order. Taking the last one would count every
 * request against the proxy itself and rate-limit the entire site as one user.
 */
export async function clientIdentifier(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get('x-forwarded-for');

  if (forwarded) return forwarded.split(',')[0]!.trim();
  return requestHeaders.get('x-real-ip') ?? 'unknown';
}
