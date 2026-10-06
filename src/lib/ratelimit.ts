import { serverlessRedis } from './serverless-redis';

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Too many requests. Try again in ${retryAfterSeconds}s.`);
  }
}

/**
 * Fixed-window limiter in Redis. AI and upload routes are the expensive ones, so
 * they get the tightest budgets — an unbounded /ask endpoint is both a cost and
 * an abuse problem.
 *
 * Uses the Upstash REST client (serverless-redis.ts), not the TCP client in
 * queue.ts — see that file's header comment for why. Bucket key format, limit
 * semantics, and expiration behavior are unchanged from the ioredis version;
 * only the transport changed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const r = serverlessRedis();
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const count = await r.incr(bucket);
  if (count === 1) await r.expire(bucket, windowSeconds);
  if (count > limit) throw new RateLimitError(windowSeconds);
}

export const LIMITS = {
  ask:      { limit: 30, window: 60 },
  generate: { limit: 15, window: 60 },
  upload:   { limit: 10, window: 3600 },
  auth:     { limit: 10, window: 900 },
} as const;