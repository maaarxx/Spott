import { createClient } from '@/lib/supabase-browser';
import { fetchWithDedupe } from './fetch-dedupe';

/** Send the current access token explicitly so serverless audit routes can verify
 * the Supabase session even if the browser's SSR auth cookies aren't present. */
export async function fetchWithSupabaseSession(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  // Public reads do not need an auth lookup. Avoid a Supabase session roundtrip
  // before every public API request across the app.
  const needsSession = headers.has('Authorization') || /\/(account|profile|saved-events|my-registrations|notifications|reminders|audit-events|activity-events|admin|organizer|verification|users|moderation|pending-organizers|events\/[^/?]+\/(comments|register|report|save))(?:[/?]|$)/.test(input);
  if (needsSession && !headers.has('Authorization')) {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  const method = init.method?.toUpperCase() || 'GET';
  if (method !== 'GET') {
    return fetch(input, { ...init, headers, cache: 'no-store' });
  }
  return fetchWithDedupe(input, { ...init, headers, cache: 'no-store' });
}
export { invalidateCache } from './fetch-dedupe';
