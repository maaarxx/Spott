import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const isDebug = process.env.DEBUG_TIMING === "1";
  const start = Date.now();
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event_id');
  const requestedUserId = searchParams.get('user_id');
  if (requestedUserId && requestedUserId !== account.userId && account.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = createAdminClient().from('event_reminders').select('*');
  query = query.eq('user_id', account.role === 'admin' && requestedUserId ? requestedUserId : account.userId);
  if (eventId) query = query.eq('event_id', eventId);

  const queryStart = Date.now();
  const { data, error } = await query.order('remind_at', { ascending: true });
  if (isDebug) console.log(`[Timing] /api/reminders main query: ${Date.now() - queryStart}ms`);
  
  if (error) return NextResponse.json({ error: 'Unable to load reminders.' }, { status: 500 });
  
  if (isDebug) console.log(`[Timing] /api/reminders total: ${Date.now() - start}ms`);
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const eventId = typeof body?.event_id === 'string' ? body.event_id : '';
  const eventTitle = typeof body?.event_title === 'string' ? body.event_title : null;
  const offsetLabel = typeof body?.offset_label === 'string' ? body.offset_label : '';
  const remindAt = typeof body?.remind_at === 'string' ? body.remind_at : '';
  const offsetMinutes = Number(body?.offset_minutes);
  const remindAtMs = Date.parse(remindAt);

  if (!eventId || !offsetLabel || !Number.isFinite(offsetMinutes) || offsetMinutes <= 0 || !Number.isFinite(remindAtMs)) {
    return NextResponse.json({ error: 'Invalid reminder fields.' }, { status: 400 });
  }
  if (remindAtMs <= Date.now()) {
    return NextResponse.json({ error: 'Reminder time is already in the past.' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: event, error: eventError } = await db.from('events').select('event_id').eq('event_id', eventId).maybeSingle();
  if (eventError) return NextResponse.json({ error: 'Unable to verify event.' }, { status: 500 });
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

  const { data, error } = await db.from('event_reminders').upsert({
    user_id: account.userId,
    event_id: eventId,
    event_title: eventTitle,
    remind_at: new Date(remindAtMs).toISOString(),
    offset_label: offsetLabel,
    offset_minutes: offsetMinutes,
    sent: false,
  }, { onConflict: 'user_id,event_id,offset_label' }).select('*').single();

  if (error || !data) return NextResponse.json({ error: 'Unable to save reminder.' }, { status: 500 });
  return NextResponse.json({ success: true, reminder: data }, { status: 200 });
}

export async function DELETE(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const eventId = typeof body?.event_id === 'string' ? body.event_id : '';
  const offsetLabel = typeof body?.offset_label === 'string' ? body.offset_label : '';
  if (!eventId) return NextResponse.json({ error: 'event_id is required.' }, { status: 400 });

  let query = createAdminClient().from('event_reminders').delete().eq('event_id', eventId).eq('user_id', account.userId);
  if (offsetLabel) query = query.eq('offset_label', offsetLabel);
  const { error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to delete reminder.' }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account || account.role !== 'organizer') {
    return NextResponse.json({ error: 'Organizer access required.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const eventId = typeof body?.event_id === 'string' ? body.event_id : '';
  const eventDate = typeof body?.event_date === 'string' ? Date.parse(body.event_date) : NaN;
  if (!eventId || !Number.isFinite(eventDate)) {
    return NextResponse.json({ error: 'event_id and a valid event_date are required.' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: event, error: eventError } = await db.from('events')
    .select('event_id,organizers!inner(user_id)').eq('event_id', eventId).eq('organizers.user_id', account.userId).maybeSingle();
  if (eventError) return NextResponse.json({ error: 'Unable to verify event ownership.' }, { status: 500 });
  if (!event) return NextResponse.json({ error: 'Event not found or access denied.' }, { status: 404 });

  const { data: reminders, error: remindersError } = await db.from('event_reminders')
    .select('id,offset_minutes,sent').eq('event_id', eventId);
  if (remindersError) return NextResponse.json({ error: 'Unable to load event reminders.' }, { status: 500 });

  const updated = await Promise.all((reminders || []).map(async (reminder) => {
    const remindAt = eventDate - Number(reminder.offset_minutes || 0) * 60_000;
    const { data, error } = await db.from('event_reminders')
      .update({ remind_at: new Date(remindAt).toISOString(), sent: remindAt > Date.now() ? false : reminder.sent })
      .eq('id', reminder.id).select('*').single();
    if (error) throw error;
    return data;
  }).map((promise) => promise.catch(() => null)));

  if (updated.some((row) => row === null)) return NextResponse.json({ error: 'Some reminders could not be rescheduled.' }, { status: 500 });
  return NextResponse.json({ reminders: updated });
}
