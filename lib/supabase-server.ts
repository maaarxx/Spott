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

let adminClientInstance: ReturnType<typeof createSupabaseClient> | null = null;

export function createAdminClient() {
  if (adminClientInstance) return adminClientInstance;
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service role credentials are not configured');
  }
  
  adminClientInstance = createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  
  return adminClientInstance;
}

const roleCache = new Map<string, { role: string; userId: string; email: string; expiresAt: number }>();

export function invalidateRoleCache(userId: string) {
  roleCache.delete(userId);
}

/** Resolve a privileged role from the authenticated Supabase session, never client input. */
export async function getAuthenticatedRole(request?: Request) {
  const totalStart = Date.now();
  const isDebug = process.env.DEBUG_TIMING === "1";
  
  const supabase = await createClient();
  const authorization = request?.headers.get('authorization');
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  
  let userId = null;
  let userEmail = null;
  
  const verifyStart = Date.now();
  try {
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(bearerToken);
    if (claimsError) throw claimsError;
    if (claimsData?.claims) {
      userId = claimsData.claims.sub;
      userEmail = claimsData.claims.email;
    }
  } catch (e) {
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken);
    if (!authError && user?.email) {
      userId = user.id;
      userEmail = user.email;
    }
  }
  if (isDebug) console.log(`[Timing] getAuthenticatedRole verify: ${Date.now() - verifyStart}ms`);
  
  if (!userId || !userEmail) return null;
  
  const now = Date.now();
  const cached = roleCache.get(userId);
  if (cached && cached.expiresAt > now) {
    if (isDebug) console.log(`[Timing] getAuthenticatedRole total (cached): ${Date.now() - totalStart}ms`);
    return { email: cached.email, userId: cached.userId, role: cached.role };
  }

  const roleStart = Date.now();
  const { data, error } = await createAdminClient()
    .from('users')
    .select('user_id, role')
    .or(`user_id.eq.${userId},email.eq.${userEmail.toLowerCase()}`)
    .maybeSingle();
    
  if (isDebug) console.log(`[Timing] getAuthenticatedRole role fetch: ${Date.now() - roleStart}ms`);
  
  if (error || !data) return null;
  
  const result = { email: userEmail.toLowerCase(), userId: data.user_id as string, role: data.role as string };
  roleCache.set(userId, { ...result, expiresAt: now + 60000 }); // 60s TTL
  
  if (isDebug) console.log(`[Timing] getAuthenticatedRole total (uncached): ${Date.now() - totalStart}ms`);
  return result;
}
