import { createHash } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

type RateLimitPolicy = {
  name: string;
  limit: number;
  window: `${number} ${'s' | 'm' | 'h'}`;
  identifiers: string[];
};

const limiters = new Map<string, Ratelimit>();
let redis: Redis | null = null;
let warnedMissingConfig = false;

function configuredRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

function limiterFor(policy: RateLimitPolicy) {
  const configKey = `${policy.name}:${policy.limit}:${policy.window}`;
  let limiter = limiters.get(configKey);
  if (!limiter) {
    const client = configuredRedis();
    if (!client) return null;
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
      prefix: `spott:${policy.name}`,
      analytics: false,
    });
    limiters.set(configKey, limiter);
  }
  return limiter;
}

function getClientIp(request: Request) {
  // Vercel overwrites x-forwarded-for with the connecting client IP.
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function hashIdentifier(identifier: string) {
  return createHash('sha256').update(identifier).digest('hex');
}

/** Returns a 429 response when limited, otherwise null. Missing credentials or
 * a transient Redis failure fail open to keep the application available. */
export async function enforceRateLimit(request: Request, policy: RateLimitPolicy) {
  const limiter = limiterFor(policy);
  if (!limiter) {
    if (!warnedMissingConfig) {
      console.warn('Shared rate limiting is disabled: configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
      warnedMissingConfig = true;
    }
    return null;
  }

  for (const identifier of policy.identifiers) {
    try {
      const result = await limiter.limit(hashIdentifier(identifier));
      if (!result.success) {
        const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
        return NextResponse.json(
          { error: 'Too many requests. Please wait and try again.' },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } },
        );
      }
    } catch (error) {
      // Upstash SDK defaults to a timeout; keep this explicit fail-open path for
      // provider outages, while recording only the error type in server logs.
      console.error('Shared rate-limit check failed', { errorType: error instanceof Error ? error.name : 'unknown' });
      return null;
    }
  }
  return null;
}

export function requestIpIdentifier(request: Request) {
  return `ip:${getClientIp(request)}`;
}
