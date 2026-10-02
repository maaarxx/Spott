import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const isDebug = process.env.DEBUG_TIMING === "1";
  const start = Date.now();
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Sign in to load saved events.' }, { status: 401 });

  const queryStart = Date.now();
  const { data, error } = await createAdminClient()
    .from('saved_events')
    .select('event_id')
    .eq('user_id', account.userId);
  if (isDebug) console.log(`[Timing] /api/saved-events main query: ${Date.now() - queryStart}ms`);
  
  if (error) return NextResponse.json({ error: 'Unable to load saved events.' }, { status: 500 });

  if (isDebug) console.log(`[Timing] /api/saved-events total: ${Date.now() - start}ms`);
  return NextResponse.json({ eventIds: (data || []).map((row) => row.event_id) });
}
