import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase public credentials are not configured');

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service role credentials are not configured');
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve a privileged role from the authenticated Supabase session, never client input. */
export async function getAuthenticatedRole(request?: Request) {
  const supabase = await createClient();
  const authorization = request?.headers.get('authorization');
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  // Browser requests send the current access token explicitly as a fallback
  // for deployments where Supabase SSR cookies are not forwarded consistently.
  // getUser(token) verifies it with Supabase; it never trusts client role data.
  const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken);
  if (authError || !user?.email) return null;

  const { data, error } = await createAdminClient()
    .from('users')
    .select('user_id, role')
    .or(`user_id.eq.${user.id},email.eq.${user.email.toLowerCase()}`)
    .maybeSingle();
  if (error || !data) return null;
  return { email: user.email.toLowerCase(), userId: data.user_id as string, role: data.role as string };
}
