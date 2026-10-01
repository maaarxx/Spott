import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Sign in to load your RSVPs.' }, { status: 401 });
  const { data, error } = await createAdminClient().from('registrations').select('event_id,status,payment_status,registration_date,attendee_name,attendee_email,mobile_number,attendees_count,notes').eq('user_id', account.userId);
  if (error) return NextResponse.json({ error: 'Unable to load RSVPs.' }, { status: 500 });
  return NextResponse.json({ registrations: data || [] });
}
