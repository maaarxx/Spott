import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (actor?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const month = new URL(request.url).searchParams.get('month') || '';
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'A YYYY-MM month is required.' }, { status: 400 });
  const start = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: 'Invalid month.' }, { status: 400 });
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  const { data, error } = await createAdminClient().from('registrations')
    .select('registration_date,attendees_count,status')
    .gte('registration_date', start.toISOString())
    .lt('registration_date', end.toISOString())
    .not('status', 'in', '(cancelled,rejected,declined)');
  if (error) return NextResponse.json({ error: 'Unable to load registration analytics.' }, { status: 500 });

  const rsvpsByWeek = Array.from({ length: Math.ceil(new Date(start.getUTCFullYear(), start.getUTCMonth() + 1, 0).getDate() / 7) }, () => 0);
  for (const row of data || []) {
    const date = new Date(row.registration_date);
    const index = Math.min(rsvpsByWeek.length - 1, Math.floor((date.getUTCDate() - 1) / 7));
    if (index >= 0) rsvpsByWeek[index] += Number(row.attendees_count || 1);
  }
  return NextResponse.json({ rsvpsByWeek, totalRsvps: rsvpsByWeek.reduce((sum, count) => sum + count, 0) });
}
