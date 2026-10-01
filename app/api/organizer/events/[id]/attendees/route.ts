import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { writeAuditEntry } from '@/lib/audit-log-server';

async function ownedEvent(db: ReturnType<typeof createAdminClient>, eventId: string, userId: string) {
  const { data: event } = await db.from('events')
    .select('event_id,organizer_id,price,organizers!inner(user_id)')
    .eq('event_id', eventId)
    .eq('organizers.user_id', userId)
    .maybeSingle();
  return event ? { event_id: event.event_id, organizer_id: event.organizer_id, price: event.price } : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getAuthenticatedRole(request);
  if (!account || account.role !== 'organizer') return NextResponse.json({ error: 'Organizer access required.' }, { status: 403 });
  const { id } = await params;
  const db = createAdminClient();
  const event = await ownedEvent(db, id, account.userId);
  if (!event) return NextResponse.json({ error: 'Event not found or access denied.' }, { status: 404 });
  // Registration already stores attendee name/email, while user_id references
  // auth.users. Avoid a PostgREST join to public.users that has no FK relation.
  const { data, error } = await db.from('registrations')
    .select('registration_id,user_id,status,registration_date,checked_in_at,attendee_name,attendee_email,mobile_number,attendees_count,notes,payment_status,payment_amount,payment_proof_url')
    .eq('event_id', id)
    .order('registration_date', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load attendees.' }, { status: 500 });
  const rows = data || [];
  const proofPaths = rows.map((row) => row.payment_proof_url).filter((path): path is string => Boolean(path));
  const signedByPath = new Map<string, string>();
  if (proofPaths.length) {
    const { data: signedRows, error: signedError } = await db.storage.from('payment-proofs').createSignedUrls(proofPaths, 300);
    if (signedError) console.error('Unable to create payment proof links', { eventId: id, count: proofPaths.length });
    for (const signed of signedRows || []) {
      if (signed.path && (signed.signedUrl || signed.signedURL)) {
        signedByPath.set(signed.path, signed.signedUrl || signed.signedURL || '');
      }
    }
  }
  const attendees = rows.map((row) => ({
    ...row,
    proof_signed_url: row.payment_proof_url ? signedByPath.get(row.payment_proof_url) || null : null,
  }));
  return NextResponse.json({ event, attendees });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getAuthenticatedRole(request);
  if (!account || account.role !== 'organizer') return NextResponse.json({ error: 'Organizer access required.' }, { status: 403 });
  const { id } = await params;
  const db = createAdminClient();
  const event = await ownedEvent(db, id, account.userId);
  if (!event) return NextResponse.json({ error: 'Event not found or access denied.' }, { status: 404 });
  const body = await request.json();
  if (body.action === 'checkin' && typeof body.checkedIn === 'boolean' && typeof body.registrationId === 'string') {
    const { data, error } = await db.from('registrations')
      .update({ checked_in_at: body.checkedIn ? new Date().toISOString() : null })
      .eq('event_id', id).eq('registration_id', body.registrationId)
      .select('registration_id,checked_in_at').maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Unable to update check-in.' }, { status: 500 });
    await writeAuditEntry(account, {
      action: body.checkedIn ? 'rsvp.checked_in' : 'rsvp.checkin_reversed',
      targetType: 'registration', targetId: body.registrationId,
      summary: `${body.checkedIn ? 'Checked in' : 'Reversed check-in for'} an attendee at event ${id}.`,
      details: { event_id: id },
    });
    return NextResponse.json({ attendee: data });
  }
  const status = body.status;
  if (!['Confirmed', 'Pending', 'Declined'].includes(status) || typeof body.registrationId !== 'string') return NextResponse.json({ error: 'Invalid attendee status.' }, { status: 400 });
  const databaseStatus = status === 'Confirmed' ? 'approved' : status === 'Declined' ? 'rejected' : 'pending';
  const paymentStatus = status === 'Pending' && Number(event.price) > 0 ? 'pending verification' : databaseStatus;
  const { data, error } = await db.from('registrations').update({ status: databaseStatus, payment_status: paymentStatus }).eq('event_id', id).eq('registration_id', body.registrationId).select('registration_id,user_id,status,payment_status').maybeSingle();
  if (error?.code === '23514' && error.message.includes('EVENT_CAPACITY_REACHED')) {
    return NextResponse.json({ error: 'The event has no remaining slots, so this attendee could not be confirmed.' }, { status: 409 });
  }
  if (error || !data) {
    if (error) console.error('Organizer RSVP status update failed', { code: error.code, eventId: id, registrationId: body.registrationId, actorUserId: account.userId });
    return NextResponse.json({ error: 'Unable to update this attendee.' }, { status: 500 });
  }
  await writeAuditEntry(account, {
    action: `rsvp.${databaseStatus}`,
    targetType: 'registration', targetId: body.registrationId,
    summary: `Set an attendee RSVP to ${databaseStatus} for event ${id}.`,
    details: { event_id: id, payment_status: paymentStatus },
  });
  if (status !== 'Pending') {
    await db.from('notifications').insert({ user_id: data.user_id, type: 'update', title: `RSVP ${status.toLowerCase()}`, message: `Your RSVP was ${status.toLowerCase()} by the organizer.`, related_event_id: id });
  }
  return NextResponse.json({ attendee: data });
}
