import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from './types';

/**
 * Per-IP rate limiter backed by Workers KV.
 *
 * Uses a one-minute bucket: counter key is `rl:<ip>:<minute>`. Each request
 * increments the counter; if it crosses `max`, the request is rejected with
 * 429. Counters auto-expire after 2 minutes via KV TTL so we don't leak storage.
 *
 * Notes
 *  - cf-connecting-ip is set by Cloudflare's edge and is trustworthy at the
 *    Worker layer (clients can't spoof it).
 *  - This is a soft limiter: under heavy concurrency two requests can both
 *    read 9 and increment to 10 simultaneously. That's acceptable for
 *    abuse-prevention; we're not enforcing exact quotas.
 */
export function rateLimit(opts: { max: number; windowSeconds?: number }): MiddlewareHandler<{
  Bindings: Env;
}> {
  const window = opts.windowSeconds ?? 60;
  return async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
    const bucket = Math.floor(Date.now() / (window * 1000));
    const key = `rl:${ip}:${bucket}`;
    const current = parseInt((await c.env.RATE_LIMIT.get(key)) ?? '0', 10);
    if (current >= opts.max) {
      return c.json({ error: 'too_many_requests' }, 429);
    }
    // Fire-and-forget — don't block the request on the write
    c.executionCtx.waitUntil(
      c.env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: window * 2 }),
    );
    await next();
  };
}

/**
 * Hash a string with SHA-256 → hex. Used for gclid storage so the raw ID
 * never lands in the database, while still letting us dedupe.
 */
export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Truthy if the request originated from an allowed origin per CORS config. */
export function originAllowed(c: Context<{ Bindings: Env }>): boolean {
  const origin = c.req.header('origin');
  if (!origin) return false;
  return origin === c.env.ALLOWED_ORIGIN_SITE || origin === c.env.ALLOWED_ORIGIN_EXTENSION;
}
