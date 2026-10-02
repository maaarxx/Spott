import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { enforceRateLimit, requestIpIdentifier } from '@/lib/rate-limit';
import { validateUsername } from '@/lib/validators/name';

export async function GET(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Sign in to check username availability.' }, { status: 401 });
  const limited = await enforceRateLimit(request, { name: 'username-availability', limit: 30, window: '1 m', identifiers: [requestIpIdentifier(request), `user:${account.userId}`] });
  if (limited) return limited;
  const username = new URL(request.url).searchParams.get('u') || '';
  if (validateUsername(username)) return NextResponse.json({ available: false });
  const escapedUsername = username.replace(/[\\%_]/g, '\\$&');
  const { data, error } = await createAdminClient().from('users').select('user_id').ilike('username', escapedUsername).neq('user_id', account.userId).maybeSingle();
  if (error) return NextResponse.json({ available: false });
  return NextResponse.json({ available: !data });
}
