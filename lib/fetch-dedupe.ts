export const fetchCache = new Map<string, { promise: Promise<Response>; expiresAt: number; data?: unknown }>();

const ALLOWED_CACHED_ROUTES = [
  '/api/profile',
  '/api/account',
  '/api/saved-events',
  '/api/reminders',
  '/api/my-registrations',
  '/api/notifications'
];

async function hashToken(token: string | null): Promise<string> {
  if (!token) return 'anonymous';
  // simple fast hash for token to use as cache key prefix
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) - hash) + token.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

export async function fetchWithDedupe(input: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method?.toUpperCase() || 'GET';
  
  if (method !== 'GET') {
    return fetch(input, init);
  }

  const token = (init.headers as Headers)?.get('Authorization')?.replace('Bearer ', '') || null;
  const userHash = await hashToken(token);
  
  // url could be absolute or relative, extract pathname
  let pathname = input;
  try {
    pathname = new URL(input, 'http://localhost').pathname;
  } catch (e) {}

  const key = `${userHash}:${method}:${input}`;
  const now = Date.now();
  const cached = fetchCache.get(key);

  const shouldCacheData = ALLOWED_CACHED_ROUTES.some(route => pathname.startsWith(route));

  if (cached && cached.expiresAt > now) {
    if (shouldCacheData && cached.data !== undefined) {
      // Return a deep cloned mock response so callers can't mutate cached data
      return new Response(JSON.stringify(cached.data), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    // Await the in-flight promise and return a clone
    try {
      const clone = (await cached.promise).clone();
      return clone;
    } catch (e) {}
  }

  const promise = fetch(input, init);
  
  fetchCache.set(key, {
    promise,
    expiresAt: now + (shouldCacheData ? 15000 : 0), // TTL 15s if allowed, else 0 (only dedupes in-flight)
  });

  promise.then(async (res) => {
    if (res.ok) {
      if (shouldCacheData) {
        const clone = res.clone();
        try {
          const data = await clone.json();
          const existing = fetchCache.get(key);
          if (existing) {
            existing.data = data;
          }
        } catch (e) {}
      }
    } else {
      fetchCache.delete(key);
    }
  }).catch(() => {
    fetchCache.delete(key);
  });

  return (await promise).clone();
}

export function invalidateCache(urlPattern: string | RegExp) {
  for (const key of fetchCache.keys()) {
    if (typeof urlPattern === 'string') {
      if (key.includes(urlPattern)) fetchCache.delete(key);
    } else {
      if (urlPattern.test(key)) fetchCache.delete(key);
    }
  }
}
