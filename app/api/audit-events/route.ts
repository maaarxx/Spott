import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

const AUTH_ACTIONS = new Set(['auth.login', 'auth.logout', 'auth.signup']);

export async function POST(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (!actor) {
    return NextResponse.json({ error: 'A valid Spott session is required to record this action.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (!body || typeof body.action !== 'string' || !AUTH_ACTIONS.has(body.action)) {
    return NextResponse.json({ error: 'Unsupported audit action.' }, { status: 400 });
  }

  const verb = body.action === 'auth.login' ? 'signed in' : body.action === 'auth.logout' ? 'signed out' : 'created an account';
  const { error } = await createAdminClient().from('admin_audit_logs').insert({
    actor_user_id: actor.userId,
    actor_email: actor.email,
    action: body.action,
    target_type: 'account',
    target_id: actor.userId,
    summary: `${actor.role} account ${verb}.`,
    details: { role: actor.role },
  });
  if (error) {
    console.error('Failed to record account audit event:', error.message);
    return NextResponse.json({ error: 'Unable to record account activity.' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
