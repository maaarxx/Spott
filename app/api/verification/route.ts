import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { writeAuditEntry } from '@/lib/audit-log-server';

export async function GET(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (!actor) return NextResponse.json({ error: 'Sign in to view verification status.' }, { status: 401 });
  if (!['admin', 'organizer'].includes(actor.role)) return NextResponse.json({ error: 'Organizer access required.' }, { status: 403 });

  const db = createAdminClient();
  if (actor.role === 'admin' && new URL(request.url).searchParams.get('scope') === 'all') {
    const { data, error } = await db.from('organizers')
      .select('organizer_id,user_id,organization_name,verification_status,expedite_note,expedited_at,decided_at,decision_reason,expires_at');
    if (error) return NextResponse.json({ error: 'Unable to load verification statuses.' }, { status: 500 });
    return NextResponse.json({ verifications: data || [] });
  }

  const { data, error } = await db.from('organizers')
    .select('organizer_id,user_id,organization_name,verification_status,expedite_note,expedited_at,decided_at,decision_reason,expires_at')
    .eq('user_id', actor.userId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load verification status.' }, { status: 500 });
  const { data: profile } = await db.from('users').select('name').eq('user_id', actor.userId).maybeSingle();
  let verification = data;
  if (!verification && actor.role === 'organizer') {
    const { data: created, error: createError } = await db.from('organizers').insert({
      user_id: actor.userId,
      organization_name: profile?.name || actor.email,
      verification_status: 'unverified',
    }).select('organizer_id,user_id,organization_name,verification_status,expedite_note,expedited_at,decided_at,decision_reason,expires_at').single();
    if (createError) return NextResponse.json({ error: 'Unable to initialize organizer verification record.' }, { status: 500 });
    verification = created;
  }
  return NextResponse.json({
    verification: verification || {
      organization_name: profile?.name || 'Organizer',
      verification_status: 'unverified',
      expedite_note: null,
      expedited_at: null,
      decided_at: null,
      decision_reason: null,
      expires_at: null,
    },
  });
}

export async function PATCH(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (!actor) return NextResponse.json({ error: 'Sign in to update verification status.' }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    organizationName?: unknown;
    organizer_id?: unknown;
    status?: unknown;
    decisionReason?: unknown;
    expediteNote?: unknown;
  } | null;
  if (!body || !['pending', 'verified', 'rejected'].includes(String(body.status))) {
    return NextResponse.json({ error: 'Invalid verification update.' }, { status: 400 });
  }
  const requestedStatus = String(body.status);
  const db = createAdminClient();
  let profileUserId = actor.userId;
  let organizationName = typeof body.organizationName === 'string' ? body.organizationName.trim() : '';
  let organizerId: string | null = null;

  if (actor.role === 'admin') {
    if (typeof body.organizer_id === 'string' && body.organizer_id) {
      organizerId = body.organizer_id;
      const { data: organizer, error } = await db.from('organizers')
        .select('organizer_id,user_id,organization_name').eq('organizer_id', organizerId).maybeSingle();
      if (error) return NextResponse.json({ error: 'Unable to locate organizer account.' }, { status: 500 });
      if (!organizer) return NextResponse.json({ error: 'Organizer account not found.' }, { status: 404 });
      profileUserId = organizer.user_id;
      organizationName = organizer.organization_name;
    } else {
      if (!organizationName) return NextResponse.json({ error: 'Organizer ID is required.' }, { status: 400 });
      const { data: profile, error: profileError } = await db.from('users')
        .select('user_id,name,email').eq('role', 'organizer').ilike('name', organizationName).maybeSingle();
      if (profileError) return NextResponse.json({ error: 'Unable to locate organizer account.' }, { status: 500 });
      const fallbackProfile = !profile && organizationName.toLowerCase() === 'metro creative group'
        ? (await db.from('users').select('user_id,name,email').eq('email', 'mcg@spott.ph').maybeSingle()).data
        : profile;
      if (!fallbackProfile) return NextResponse.json({ error: 'Organizer account not found.' }, { status: 404 });
      profileUserId = fallbackProfile.user_id;
      organizationName = fallbackProfile.name || organizationName;
    }
  } else {
    // Organizers may submit or resubmit for review, but cannot approve themselves.
    if (requestedStatus !== 'pending') return NextResponse.json({ error: 'Only admins can approve or reject verification.' }, { status: 403 });
    const { data: ownOrganizer, error } = await db.from('organizers')
      .select('organizer_id,organization_name').eq('user_id', actor.userId).maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to locate organizer verification record.' }, { status: 500 });
    if (!ownOrganizer) return NextResponse.json({ error: 'Organizer profile not found.' }, { status: 404 });
    organizerId = ownOrganizer.organizer_id;
    organizationName = ownOrganizer.organization_name;
  }

  if (!organizerId) {
    const { data: existing, error: lookupError } = await db.from('organizers')
      .select('organizer_id').eq('user_id', profileUserId).maybeSingle();
    if (lookupError) return NextResponse.json({ error: 'Unable to locate organizer verification record.' }, { status: 500 });
    if (existing) organizerId = existing.organizer_id;
  }
  if (!organizerId) return NextResponse.json({ error: 'Organizer profile not found.' }, { status: 404 });

  if (actor.role === 'admin' && requestedStatus === 'verified') {
    const { count, error } = await db.from('organizer_verification_documents')
      .select('id', { count: 'exact', head: true }).eq('organizer_id', organizerId).is('archived_at', null);
    if (error) return NextResponse.json({ error: 'Unable to confirm submitted documents.' }, { status: 500 });
    if (!count) return NextResponse.json({ error: 'Cannot verify an organizer without a submitted document.' }, { status: 409 });
  }

  const decision = requestedStatus === 'pending' ? null : new Date();
  const update: Record<string, string | null> = {
    verification_status: requestedStatus,
    decided_at: decision?.toISOString() || null,
    expires_at: decision ? new Date(decision.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
    decision_reason: requestedStatus === 'pending'
      ? null
      : (typeof body.decisionReason === 'string' && body.decisionReason.trim()
        ? body.decisionReason.trim()
        : requestedStatus === 'verified' ? 'Accreditation approved.' : 'Application declined.'),
  };
  if (actor.role !== 'admin' && typeof body.expediteNote === 'string') {
    update.expedite_note = body.expediteNote.trim() || null;
    update.expedited_at = body.expediteNote.trim() ? new Date().toISOString() : null;
  }
  const { error: updateError } = await db.from('organizers').update(update).eq('organizer_id', organizerId);
  if (updateError) return NextResponse.json({ error: 'Unable to save verification status.' }, { status: 500 });

  if (actor.role === 'admin') {
    await writeAuditEntry(actor, {
      action: `verification.${requestedStatus}`, targetType: 'organizer', targetId: profileUserId,
      summary: `Set ${organizationName} verification status to ${requestedStatus}.`,
    });
  }
  return NextResponse.json({ success: true, status: requestedStatus });
}
