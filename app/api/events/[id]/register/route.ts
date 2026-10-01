import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'Sign in to RSVP.' }, { status: 401 });
    const { id } = await params;
    const form = await request.formData();
    const fullName = String(form.get('fullName') || '').trim();
    const mobile = String(form.get('mobile') || '').trim();
    const email = String(form.get('email') || '').trim().toLowerCase();
    const attendees = Number(form.get('attendees') || 1);
    const notes = String(form.get('notes') || '').trim();
    if (fullName.length < 2 || fullName.length > 100 || !/^09\d{9}$/.test(mobile) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !Number.isInteger(attendees) || attendees < 1 || attendees > 20 || notes.length > 1000) return NextResponse.json({ error: 'Check your name, PH mobile number, email, attendee count, and notes.' }, { status: 400 });
    const db = createAdminClient();
    const { data: event, error: eventError } = await db.from('events').select('price').eq('event_id', id).maybeSingle();
    if (eventError || !event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    const paid = Number(event.price) > 0;
    const proof = form.get('proof');
    let proofPath: string | null = null;
    if (paid) {
      if (!(proof instanceof File) || !['image/jpeg','image/png','image/webp','image/gif'].includes(proof.type) || proof.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Upload a JPG, PNG, WEBP, or GIF proof of payment no larger than 5 MB.' }, { status: 400 });
      const ext = proof.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'img';
      proofPath = `${id}/${account.userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await db.storage.from('payment-proofs').upload(proofPath, proof, { contentType: proof.type, upsert: false });
      if (uploadError) return NextResponse.json({ error: 'Could not save payment proof. Ensure the payment-proofs storage bucket exists.' }, { status: 500 });
    }
    const status = paid ? 'pending verification' : 'registered';
    const { error } = await db.from('registrations').upsert({ user_id: account.userId, event_id: id, status, attendee_name: fullName, attendee_email: email, mobile_number: mobile, attendees_count: attendees, notes, payment_status: paid ? 'pending verification' : 'not required', payment_proof_url: proofPath }, { onConflict: 'user_id,event_id' });
    if (error) return NextResponse.json({ error: 'Could not save RSVP.' }, { status: 500 });
    return NextResponse.json({ success: true, status, reference: `SP-${id.slice(0,6).toUpperCase()}-${account.userId.slice(0,6).toUpperCase()}`, amount: Number(event.price) * attendees });
  } catch { return NextResponse.json({ error: 'Could not save RSVP.' }, { status: 500 }); }
}
