import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { writeAuditEntry } from '@/lib/audit-log-server';
import { enforceRateLimit, requestIpIdentifier } from '@/lib/rate-limit';

async function getConfirmedAttendeeCount(db: ReturnType<typeof createAdminClient>, eventId: string): Promise<number | null> {
  const { data: counts, error } = await db.rpc('get_event_registration_counts', { p_event_ids: [eventId] });
  if (!error) return Number(counts?.[0]?.registration_count || 0);

  // Compatibility path until the count RPC migration is available remotely.
  const { data: rows, error: fallbackError } = await db.from('registrations')
    .select('attendees_count')
    .eq('event_id', eventId)
    .in('status', ['confirmed', 'registered', 'approved']);
  if (fallbackError) return null;
  return (rows || []).length;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'Sign in to RSVP.' }, { status: 401 });
    const ipLimited = await enforceRateLimit(request, {
      name: 'rsvp-ip', limit: 30, window: '1 h', identifiers: [requestIpIdentifier(request)],
    });
    if (ipLimited) return ipLimited;
    const userLimited = await enforceRateLimit(request, {
      name: 'rsvp-user', limit: 10, window: '1 h', identifiers: [`user:${account.userId}`],
    });
    if (userLimited) return userLimited;
    const { id } = await params;
    const form = await request.formData();
    const fullName = String(form.get('fullName') || '').trim();
    const mobile = String(form.get('mobile') || '').trim();
    const email = String(form.get('email') || '').trim().toLowerCase();
    // One authenticated account may reserve one seat per event. Ignore any
    // client-supplied attendee count, including requests from older app builds.
    const attendeeCount = 1;
    const notes = String(form.get('notes') || '').trim();
    const db = createAdminClient();
    const { data: eventStatus } = await db.from('events').select('status').eq('event_id', id).maybeSingle();
    if (eventStatus?.status === 'cancelled') return NextResponse.json({ error: 'This event was cancelled and is no longer accepting RSVPs.' }, { status: 409 });
    const { data: profile } = await db.from('users').select('name').eq('user_id', account.userId).maybeSingle();
    if (fullName.trim().toLowerCase() !== (profile?.name || '').trim().toLowerCase()) return NextResponse.json({ error: 'Name must match your profile.', field: 'fullName' }, { status: 400 });
    if (fullName.length < 2 || fullName.length > 25) return NextResponse.json({ error: 'Enter your name (First Name MI Last Name).', field: 'fullName' }, { status: 400 });
    if (!/^09\d{9}$/.test(mobile)) return NextResponse.json({ error: 'Use a valid PH mobile number in 09XXXXXXXXX format.', field: 'mobile' }, { status: 400 });
    if (email !== account.email) return NextResponse.json({ error: 'Email must match your account.', field: 'email' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 25) return NextResponse.json({ error: 'Enter a valid email address.', field: 'email' }, { status: 400 });
    if (notes.length > 1000) return NextResponse.json({ error: 'Notes must be 1,000 characters or fewer.', field: 'notes' }, { status: 400 });
    const { data: event, error: eventError } = await db.from('events').select('price,capacity,require_approval,organizer_id,title').eq('event_id', id).maybeSingle();
    if (eventError || !event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    const paid = Number(event.price) > 0;
    const proof = form.get('proof');
    let proofPath: string | null = null;
    if (paid) {
      if (!(proof instanceof File) || !['image/jpeg','image/png','image/webp','image/gif'].includes(proof.type) || proof.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Upload a JPG, PNG, WEBP, or GIF proof of payment no larger than 5 MB.', field: 'proof' }, { status: 400 });
      const ext = proof.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'img';
      proofPath = `${id}/${account.userId}/${crypto.randomUUID()}.${ext}`;
      // The private bucket is provisioned by the database migration; avoid a
      // bucket-list network request on every paid RSVP.
      const { error: uploadError } = await db.storage.from('payment-proofs').upload(proofPath, proof, { contentType: proof.type, upsert: false });
      if (uploadError) {
        console.error('Payment proof upload failed', { eventId: id, userId: account.userId, code: uploadError.name });
        return NextResponse.json({ error: 'Could not save the payment proof. Please retry or contact support.', field: 'proof' }, { status: 500 });
      }
    }
    const [confirmedCount, { data: existing, error: existingError }] = await Promise.all([
      getConfirmedAttendeeCount(db, id),
      db.from('registrations').select('registration_id,status').eq('user_id', account.userId).eq('event_id', id).maybeSingle(),
    ]);
    if (confirmedCount === null || existingError) return NextResponse.json({ error: 'Could not check current RSVP availability.' }, { status: 500 });

    const capacity = Number(event.capacity) > 0 ? Number(event.capacity) : 100;
    const alreadyConfirmed = ['confirmed', 'registered', 'approved'].includes(String(existing?.status || '').toLowerCase());
    const full = !alreadyConfirmed && confirmedCount >= capacity;
    const requiresApproval = Boolean(event.require_approval);
    const attendeeStatus = paid || requiresApproval || full ? 'pending' : 'confirmed';
    const status = paid ? 'pending verification' : attendeeStatus;
    const registration = { status, attendee_name: fullName, attendee_email: email, mobile_number: mobile, attendees_count: attendeeCount, notes, payment_status: paid ? 'pending verification' : 'not required', payment_amount: paid ? Number(event.price) * attendeeCount : null, payment_proof_url: proofPath };
    const write = existing
      ? await db.from('registrations').update(registration).eq('registration_id', existing.registration_id).eq('user_id', account.userId).eq('event_id', id).select('registration_id').maybeSingle()
      : await db.from('registrations').insert({ ...registration, user_id: account.userId, event_id: id }).select('registration_id').maybeSingle();
    const { data: savedRegistration, error } = write;
    if (error?.code === '23514' && error.message.includes('EVENT_CAPACITY_REACHED')) {
      return NextResponse.json({ error: 'This event has no remaining confirmed slots. Your RSVP was not saved as confirmed.' }, { status: 409 });
    }
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'An RSVP for this event was just submitted. Refresh your event status before trying again.' }, { status: 409 });
    }
    if (error || !savedRegistration) {
      console.error('RSVP database write failed', { code: error?.code || 'NO_ROW_RETURNED', eventId: id, userId: account.userId });
      return NextResponse.json({ error: 'Could not save RSVP.' }, { status: 500 });
    }
    // RSVP means the user has committed to attending; remove any bookmark.
    await db.from('saved_events').delete().eq('user_id', account.userId).eq('event_id', id);
    const [{ data: organizer }, updatedConfirmedCount] = await Promise.all([
      db.from('organizers').select('user_id').eq('organizer_id', event.organizer_id).maybeSingle(),
      getConfirmedAttendeeCount(db, id),
    ]);
    if (updatedConfirmedCount === null) return NextResponse.json({ error: 'RSVP saved, but its updated count could not be loaded.' }, { status: 500 });
    const sideEffects: Promise<unknown>[] = [];
    if (organizer?.user_id) {
      sideEffects.push(Promise.resolve(db.from('notifications').insert({
        user_id: organizer.user_id,
        type: 'announcement',
        title: `New RSVP: "${event.title}"`,
        message: `${fullName} submitted an RSVP (${attendeeStatus}).`,
        target_role: 'organizer',
        related_event_id: id,
        link: `/organizer/rsvp?eventId=${id}`,
      })));
    }
    sideEffects.push(writeAuditEntry(account, {
      action: 'rsvp.created_or_updated', targetType: 'event', targetId: id,
      summary: `Submitted an RSVP for “${event.title}”.`,
      details: { registration_status: status, attendee_count: attendeeCount, payment_status: paid ? 'pending verification' : 'not required' },
    }));
    await Promise.all(sideEffects);
    return NextResponse.json({ success: true, status, attendeeStatus: attendeeStatus === 'confirmed' ? 'Confirmed' : 'Pending', confirmedCount: updatedConfirmedCount, reference: `SP-${id.slice(0,6).toUpperCase()}-${account.userId.slice(0,6).toUpperCase()}`, amount: Number(event.price) * attendeeCount });
  } catch { return NextResponse.json({ error: 'Could not save RSVP.' }, { status: 500 }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'Sign in to cancel your RSVP.' }, { status: 401 });
    const ipLimited = await enforceRateLimit(request, {
      name: 'rsvp-cancel-ip', limit: 30, window: '1 h', identifiers: [requestIpIdentifier(request)],
    });
    if (ipLimited) return ipLimited;
    const userLimited = await enforceRateLimit(request, {
      name: 'rsvp-cancel-user', limit: 10, window: '1 h', identifiers: [`user:${account.userId}`],
    });
    if (userLimited) return userLimited;
    const { id } = await params;
    const db = createAdminClient();
    const { data: cancelled, error } = await db.from('registrations')
      .update({ status: 'cancelled' })
      .eq('user_id', account.userId).eq('event_id', id)
      .neq('status', 'cancelled')
      .select('registration_id').maybeSingle();
    if (error) return NextResponse.json({ error: 'Could not cancel RSVP in the database.' }, { status: 500 });
    if (!cancelled) return NextResponse.json({ error: 'No active RSVP was found for this event.' }, { status: 404 });
    const { data: event } = await db.from('events').select('title').eq('event_id', id).maybeSingle();
    const confirmedCount = await getConfirmedAttendeeCount(db, id);
    if (confirmedCount === null) return NextResponse.json({ error: 'RSVP cancelled, but its updated count could not be loaded.' }, { status: 500 });
    await writeAuditEntry(account, {
      action: 'rsvp.cancelled', targetType: 'event', targetId: id,
      summary: `Cancelled an RSVP for “${event?.title || id}”.`,
      details: { event_id: id },
    });
    return NextResponse.json({ success: true, confirmedCount });
  } catch {
    return NextResponse.json({ error: 'Could not cancel RSVP.' }, { status: 500 });
  }
}
