import { Redis } from '@upstash/redis';

/**
 * REST-based Redis client for use inside Vercel serverless functions.
 *
 * This is deliberately separate from `redis()` in src/lib/queue.ts, which
 * opens a persistent TCP connection via ioredis for BullMQ. A TCP connection
 * does not survive a serverless function's lifecycle the way it does on a
 * long-running host: each invocation can open a fresh connection, and under
 * real traffic those connections pile up and fail to clean up in time,
 * surfacing as `[ioredis] Unhandled error event: Error: read ECONNRESET` and
 * ioredis's automatic retry loop stalling the request (seen on /api/auth/login
 * and /api/auth/signup). The Upstash REST client has no persistent connection
 * to leak — each call is a single stateless HTTPS request, which is the
 * correct shape for a serverless function.
 *
 * The BullMQ worker is unaffected: it is a long-running process (not a
 * serverless function), so the TCP connection in queue.ts is still the right
 * tool there and is left untouched.
 */

let _client: Redis | null = null;

export function serverlessRedis(): Redis {
  if (_client) return _client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must both be set ' +
      '(see .env.example). This is the REST-based Redis client used by rate ' +
      'limiting on Vercel serverless functions — it is separate from REDIS_URL, ' +
      'which the BullMQ worker still uses over a direct TCP connection.',
    );
  }

  _client = new Redis({ url, token });
  return _client;
}