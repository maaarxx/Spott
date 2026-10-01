import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

async function ownedEvent(eventId: string, userId: string) {
  const db = createAdminClient();
  const { data: event } = await db.from('events').select('event_id,organizer_id,price').eq('event_id', eventId).maybeSingle();
  if (!event) return null;
  const { data: organizer } = await db.from('organizers').select('user_id').eq('organizer_id', event.organizer_id).maybeSingle();
  return organizer?.user_id === userId ? { ...event } : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getAuthenticatedRole(request);
  if (!account || account.role !== 'organizer') return NextResponse.json({ error: 'Organizer access required.' }, { status: 403 });
  const { id } = await params;
  const event = await ownedEvent(id, account.userId);
  if (!event) return NextResponse.json({ error: 'Event not found or access denied.' }, { status: 404 });
  const { data, error } = await createAdminClient().from('registrations').select('registration_id,user_id,status,registration_date,attendee_name,mobile_number,attendees_count,notes,payment_status,payment_proof_url,users(name,email)').eq('event_id', id).order('registration_date', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load attendees.' }, { status: 500 });
  return NextResponse.json({ event, attendees: data || [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getAuthenticatedRole(request);
  if (!account || account.role !== 'organizer') return NextResponse.json({ error: 'Organizer access required.' }, { status: 403 });
  const { id } = await params;
  if (!await ownedEvent(id, account.userId)) return NextResponse.json({ error: 'Event not found or access denied.' }, { status: 404 });
  const body = await request.json();
  const status = body.status;
  if (!['Approved', 'Rejected'].includes(status) || typeof body.registrationId !== 'string') return NextResponse.json({ error: 'Invalid attendee status.' }, { status: 400 });
  const { data, error } = await createAdminClient().from('registrations').update({ status: status.toLowerCase(), payment_status: status.toLowerCase() }).eq('event_id', id).eq('registration_id', body.registrationId).select('registration_id,status,payment_status').maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Unable to update this attendee.' }, { status: 500 });
  return NextResponse.json({ attendee: data });
}
