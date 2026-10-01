import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { writeAuditEntry } from '@/lib/audit-log-server';
import { enforceRateLimit, requestIpIdentifier } from '@/lib/rate-limit';

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
    if (fullName.length < 2 || fullName.length > 100) return NextResponse.json({ error: 'Enter your name (maximum 100 characters).', field: 'fullName' }, { status: 400 });
    if (!/^09\d{9}$/.test(mobile)) return NextResponse.json({ error: 'Use a valid PH mobile number in 09XXXXXXXXX format.', field: 'mobile' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid email address (maximum 254 characters).', field: 'email' }, { status: 400 });
    if (notes.length > 1000) return NextResponse.json({ error: 'Notes must be 1,000 characters or fewer.', field: 'notes' }, { status: 400 });
    const db = createAdminClient();
    const { data: event, error: eventError } = await db.from('events').select('price,capacity,require_approval,organizer_id,title').eq('event_id', id).maybeSingle();
    if (eventError || !event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    const paid = Number(event.price) > 0;
    const proof = form.get('proof');
    let proofPath: string | null = null;
    if (paid) {
      if (!(proof instanceof File) || !['image/jpeg','image/png','image/webp','image/gif'].includes(proof.type) || proof.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Upload a JPG, PNG, WEBP, or GIF proof of payment no larger than 5 MB.', field: 'proof' }, { status: 400 });
      const ext = proof.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'img';
      proofPath = `${id}/${account.userId}/${crypto.randomUUID()}.${ext}`;
      const { data: bucketList } = await db.storage.listBuckets();
      if (!bucketList?.some((bucket) => bucket.name === 'payment-proofs')) {
        await db.storage.createBucket('payment-proofs', { public: false, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ['image/jpeg','image/png','image/webp','image/gif'] });
      }
      const { error: uploadError } = await db.storage.from('payment-proofs').upload(proofPath, proof, { contentType: proof.type, upsert: false });
      if (uploadError) {
        console.error('Payment proof upload failed', { eventId: id, userId: account.userId, code: uploadError.name });
        return NextResponse.json({ error: 'Could not save the payment proof. Please retry or contact support.', field: 'proof' }, { status: 500 });
      }
    }
    const [{ data: confirmedRows, error: countError }, { data: existing, error: existingError }] = await Promise.all([
      db.from('registrations').select('attendees_count').eq('event_id', id).in('status', ['confirmed', 'registered', 'approved']),
      db.from('registrations').select('registration_id,status').eq('user_id', account.userId).eq('event_id', id).maybeSingle(),
    ]);
    if (countError || existingError) return NextResponse.json({ error: 'Could not check current RSVP availability.' }, { status: 500 });

    const confirmedCount = (confirmedRows || []).reduce((sum, row) => sum + Math.max(1, Number(row.attendees_count) || 1), 0);
    const capacity = Number(event.capacity) > 0 ? Number(event.capacity) : 100;
    const alreadyConfirmed = ['confirmed', 'registered', 'approved'].includes(String(existing?.status || '').toLowerCase());
    const full = !alreadyConfirmed && confirmedCount >= capacity;
    const requiresApproval = Boolean(event.require_approval);
    const attendeeStatus = paid || requiresApproval || full ? 'pending' : 'confirmed';
    const status = paid ? 'pending verification' : attendeeStatus;
    const registration = { status, attendee_name: fullName, attendee_email: email, mobile_number: mobile, attendees_count: attendeeCount, notes, payment_status: paid ? 'pending verification' : 'not required', payment_proof_url: proofPath };
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
    const { data: updatedRows, error: updatedCountError } = await db.from('registrations').select('attendees_count').eq('event_id', id).in('status', ['confirmed', 'registered', 'approved']);
    if (updatedCountError) return NextResponse.json({ error: 'RSVP saved, but its updated count could not be loaded.' }, { status: 500 });
    const updatedConfirmedCount = (updatedRows || []).reduce((sum, row) => sum + Math.max(1, Number(row.attendees_count) || 1), 0);
    const { data: organizer } = await db.from('organizers').select('user_id').eq('organizer_id', event.organizer_id).maybeSingle();
    if (organizer?.user_id) {
      await db.from('notifications').insert({
        user_id: organizer.user_id,
        type: 'announcement',
        title: `New RSVP: "${event.title}"`,
        message: `${fullName} submitted an RSVP (${attendeeStatus}).`,
        target_role: 'organizer',
        related_event_id: id,
        link: `/organizer/rsvp?eventId=${id}`,
      });
    }
    await writeAuditEntry(account, {
      action: 'rsvp.created_or_updated', targetType: 'event', targetId: id,
      summary: `Submitted an RSVP for “${event.title}”.`,
      details: { registration_status: status, attendee_count: attendeeCount, payment_status: paid ? 'pending verification' : 'not required' },
    });
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
    const { data: activeRows, error: countError } = await db.from('registrations').select('attendees_count').eq('event_id', id).in('status', ['confirmed', 'registered', 'approved']);
    if (countError) return NextResponse.json({ error: 'RSVP cancelled, but its updated count could not be loaded.' }, { status: 500 });
    const confirmedCount = (activeRows || []).reduce((sum, row) => sum + Math.max(1, Number(row.attendees_count) || 1), 0);
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
