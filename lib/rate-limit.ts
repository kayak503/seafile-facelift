import { AppError } from '@/lib/errors';

const buckets = new Map<string, { count: number; reset: number }>();

/**
 * Lightweight per-process rate limiter for a single-container deployment.
 * Reverse proxies must replace, rather than append to, untrusted forwarding headers.
 */
export function rateLimit(request: Request, limit = 60, windowMs = 60_000) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const previous = buckets.get(ip);
  const bucket = !previous || previous.reset < now ? { count: 0, reset: now + windowMs } : previous;
  bucket.count += 1;
  buckets.set(ip, bucket);
  // Bound memory even when a public instance receives traffic from many one-off addresses.
  if (buckets.size > 10_000) {
    for (const [key, value] of buckets) if (value.reset < now) buckets.delete(key);
  }
  if (bucket.count > limit)
    throw new AppError(429, 'rate_limited', 'Too many requests. Please wait a moment.');
}
