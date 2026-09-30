import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { writeAuditEntry } from '@/lib/audit-log-server';

type OrganizerRow = {
  organizer_id: string;
  user_id: string;
  organization_name: string;
  verification_status: string | null;
};

async function ensureMetroVerificationRecord(db: ReturnType<typeof createAdminClient>) {
  const { data: profile } = await db.from('users').select('user_id,name').eq('email', 'mcg@spott.ph').maybeSingle();
  if (!profile) return null;
  const { data: existing } = await db.from('organizers')
    .select('organizer_id,user_id,organization_name,verification_status').eq('user_id', profile.user_id).maybeSingle();
  if (existing) return existing;
  const { data: created } = await db.from('organizers').insert({
    user_id: profile.user_id,
    organization_name: profile.name || 'Metro Creative Group',
    verification_status: 'verified',
  }).select('organizer_id,user_id,organization_name,verification_status').maybeSingle();
  return created;
}

export async function GET(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (!actor) return NextResponse.json({ error: 'Sign in to view verification status.' }, { status: 401 });
  if (!['admin', 'organizer'].includes(actor.role)) return NextResponse.json({ error: 'Organizer access required.' }, { status: 403 });

  const db = createAdminClient();
  if (actor.role === 'admin' && new URL(request.url).searchParams.get('scope') === 'all') {
    await ensureMetroVerificationRecord(db);
    const { data, error } = await db.from('organizers')
      .select('organizer_id,user_id,organization_name,verification_status');
    if (error) return NextResponse.json({ error: 'Unable to load verification statuses.' }, { status: 500 });
    return NextResponse.json({ verifications: data || [] });
  }

  const { data, error } = await db.from('organizers')
    .select('organizer_id,user_id,organization_name,verification_status')
    .eq('user_id', actor.userId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load verification status.' }, { status: 500 });
  const isMetro = (data?.organization_name || '').toLowerCase().includes('metro creative') || actor.email === 'mcg@spott.ph';
  if (!data && isMetro) {
    const seeded = await ensureMetroVerificationRecord(db);
    if (seeded) return NextResponse.json({ verification: seeded });
  }
  return NextResponse.json({
    verification: data || { organization_name: 'Metro Creative Group', verification_status: isMetro ? 'verified' : 'unverified' },
  });
}

export async function PATCH(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (!actor) return NextResponse.json({ error: 'Sign in to update verification status.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { organizationName?: unknown; status?: unknown } | null;
  if (!body || !['pending', 'verified', 'rejected'].includes(String(body.status))) {
    return NextResponse.json({ error: 'Invalid verification update.' }, { status: 400 });
  }
  const requestedStatus = String(body.status);
  const db = createAdminClient();
  let profileUserId = actor.userId;
  let organizationName = typeof body.organizationName === 'string' ? body.organizationName.trim() : '';

  if (actor.role === 'admin') {
    if (!organizationName) return NextResponse.json({ error: 'Organization name is required.' }, { status: 400 });
    const { data: profile, error: profileError } = await db.from('users')
      .select('user_id,name,email').eq('role', 'organizer').ilike('name', organizationName).maybeSingle();
    if (profileError) return NextResponse.json({ error: 'Unable to locate organizer account.' }, { status: 500 });
    const fallbackProfile = !profile && organizationName.toLowerCase() === 'metro creative group'
      ? (await db.from('users').select('user_id,name,email').eq('email', 'mcg@spott.ph').maybeSingle()).data
      : profile;
    if (!fallbackProfile) return NextResponse.json({ error: 'Organizer account not found.' }, { status: 404 });
    profileUserId = fallbackProfile.user_id;
    organizationName = fallbackProfile.name || organizationName;
  } else {
    // Organizers may submit or resubmit for review, but cannot approve themselves.
    if (requestedStatus !== 'pending') return NextResponse.json({ error: 'Only admins can approve or reject verification.' }, { status: 403 });
    organizationName = organizationName || 'Metro Creative Group';
  }

  const { data: existing, error: lookupError } = await db.from('organizers')
    .select('organizer_id').eq('user_id', profileUserId).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Unable to locate organizer verification record.' }, { status: 500 });
  let result: { error: { message: string } | null };
  if (existing) {
    result = await db.from('organizers').update({ organization_name: organizationName, verification_status: requestedStatus })
      .eq('organizer_id', existing.organizer_id);
  } else {
    result = await db.from('organizers').insert({ user_id: profileUserId, organization_name: organizationName, verification_status: requestedStatus });
  }
  if (result.error) return NextResponse.json({ error: 'Unable to save verification status.' }, { status: 500 });

  if (actor.role === 'admin') {
    await writeAuditEntry(actor, {
      action: `verification.${requestedStatus}`, targetType: 'organizer', targetId: profileUserId,
      summary: `Set ${organizationName} verification status to ${requestedStatus}.`,
    });
  }
  return NextResponse.json({ success: true, status: requestedStatus });
}
