import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const isDebug = process.env.DEBUG_TIMING === "1";
  const start = Date.now();
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Sign in to load your RSVPs.' }, { status: 401 });
  
  const queryStart = Date.now();
  const { data, error } = await createAdminClient().from('registrations').select('event_id,status,payment_status,registration_date,attendee_name,attendee_email,mobile_number,attendees_count,notes').eq('user_id', account.userId);
  if (isDebug) console.log(`[Timing] /api/my-registrations main query: ${Date.now() - queryStart}ms`);
  
  if (error) return NextResponse.json({ error: 'Unable to load RSVPs.' }, { status: 500 });
  
  if (isDebug) console.log(`[Timing] /api/my-registrations total: ${Date.now() - start}ms`);
  return NextResponse.json({ registrations: (data || []).filter((row) => String(row.status || '').toLowerCase() !== 'cancelled') });
}
