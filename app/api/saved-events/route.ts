import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Sign in to load saved events.' }, { status: 401 });

  const { data, error } = await createAdminClient()
    .from('saved_events')
    .select('event_id')
    .eq('user_id', account.userId);
  if (error) return NextResponse.json({ error: 'Unable to load saved events.' }, { status: 500 });

  return NextResponse.json({ eventIds: (data || []).map((row) => row.event_id) });
}
