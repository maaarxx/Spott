import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account || account.role !== 'organizer') {
    return NextResponse.json({ error: 'Organizer access required.' }, { status: account ? 403 : 401 });
  }

  const db = createAdminClient();
  const { data: organizers, error: organizerError } = await db
    .from('organizers')
    .select('organizer_id')
    .eq('user_id', account.userId);
  if (organizerError) return NextResponse.json({ error: 'Unable to load organizer account.' }, { status: 500 });

  const organizerIds = (organizers || []).map((row) => row.organizer_id);
  if (!organizerIds.length) return NextResponse.json({ registrations: [] });

  const { data: events, error: eventError } = await db
    .from('events')
    .select('event_id')
    .in('organizer_id', organizerIds);
  if (eventError) return NextResponse.json({ error: 'Unable to load organizer events.' }, { status: 500 });

  const eventIds = (events || []).map((row) => row.event_id);
  if (!eventIds.length) return NextResponse.json({ registrations: [] });

  const url = new URL(request.url);
  const month = url.searchParams.get('month');
  let query = db.from('registrations')
    .select('event_id,user_id,attendee_name,attendee_email,status,registration_date,checked_in_at')
    .in('event_id', eventIds)
    .order('registration_date', { ascending: false });

  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: 'month must use YYYY-MM format.' }, { status: 400 });
    }
    const [year, monthNumber] = month.split('-').map(Number);
    const dayMs = 24 * 60 * 60 * 1000;
    // Fetch a one-day UTC margin on either side so the browser can apply the
    // selected month in its local timezone without dropping boundary rows.
    const start = new Date(Date.UTC(year, monthNumber - 1, 1) - dayMs).toISOString();
    const end = new Date(Date.UTC(year, monthNumber, 1) + dayMs).toISOString();
    query = query.gte('registration_date', start).lt('registration_date', end);
  }

  const registrations = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) return NextResponse.json({ error: 'Unable to load RSVP analytics.' }, { status: 500 });
    registrations.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return NextResponse.json({ registrations });
}
