import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const actor = await getAuthenticatedRole();
  if (!actor) return NextResponse.json({ error: 'Sign in with your Supabase account to view audit logs.', code: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  if (actor.role !== 'admin') return NextResponse.json({ error: 'Your account is signed in but does not have the admin role.', code: 'ADMIN_ROLE_REQUIRED' }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 100));
  const { data, error } = await createAdminClient().from('admin_audit_logs')
    .select('log_id,actor_email,action,target_type,target_id,summary,details,created_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: 'Unable to load audit logs.' }, { status: 500 });
  return NextResponse.json({ logs: data || [] });
}

export async function POST(request: Request) {
  const actor = await getAuthenticatedRole();
  if (!actor) return NextResponse.json({ error: 'Sign in with your Supabase account to record admin actions.', code: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  if (actor.role !== 'admin') return NextResponse.json({ error: 'Your account is signed in but does not have the admin role.', code: 'ADMIN_ROLE_REQUIRED' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== 'string' || typeof body.targetType !== 'string' || typeof body.summary !== 'string' ||
      body.action.length > 80 || body.targetType.length > 60 || body.summary.length > 500 ||
      (body.targetId != null && String(body.targetId).length > 200)) {
    return NextResponse.json({ error: 'Invalid audit entry.' }, { status: 400 });
  }
  const { error } = await createAdminClient().from('admin_audit_logs').insert({
    actor_user_id: actor.userId, actor_email: actor.email,
    action: body.action, target_type: body.targetType,
    target_id: body.targetId ? String(body.targetId) : null,
    summary: body.summary,
    details: body.details && typeof body.details === 'object' && !Array.isArray(body.details) ? body.details : {},
  });
  if (error) return NextResponse.json({ error: 'Unable to record audit entry.' }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 201 });
}
