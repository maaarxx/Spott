import { createClient } from '@/lib/supabase-browser';

/** Send the current access token explicitly so serverless audit routes can verify
 * the Supabase session even if the browser's SSR auth cookies aren't present. */
export async function fetchAuditApi(input: string, init: RequestInit = {}) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  return fetch(input, { ...init, headers, cache: 'no-store' });
}
