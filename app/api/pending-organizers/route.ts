import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { writeAuditEntry } from '@/lib/audit-log-server';

export async function GET() {
  const actor = await getAuthenticatedRole();
  if (actor?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await createAdminClient().from('pending_organizers').select('id,name,email,status,submitted_at,decided_at').order('submitted_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load organizer applications' }, { status: 500 });
  return NextResponse.json({ organizers: data || [] });
}

export async function PATCH(request: Request) {
  const actor = await getAuthenticatedRole();
  if (actor?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  if (!body?.id || !['approved', 'rejected'].includes(body.status)) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
  const db = createAdminClient();
  const { data: application, error } = await db.from('pending_organizers').update({ status: body.status, decided_at: new Date().toISOString() }).eq('id', body.id).select('user_id,email').maybeSingle();
  if (error || !application) return NextResponse.json({ error: 'Unable to update application' }, { status: 500 });
  if (body.status === 'approved') {
    const { error: roleError } = await db.from('users').update({ role: 'organizer' }).eq('user_id', application.user_id);
    if (roleError) return NextResponse.json({ error: 'Application saved but role update failed' }, { status: 500 });
  }
  await writeAuditEntry(actor, {
    action: body.status === 'approved' ? 'organizer.approved' : 'organizer.rejected',
    targetType: 'organizer_application', targetId: body.id,
    summary: `${body.status === 'approved' ? 'Approved' : 'Rejected'} organizer application for ${application.email}.`,
  });
  return NextResponse.json({ success: true });
}
