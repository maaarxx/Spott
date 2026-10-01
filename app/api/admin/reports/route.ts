import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { writeAuditEntry } from '@/lib/audit-log-server';

export async function GET(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (actor?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createAdminClient();
  const { data: reports, error } = await db.from('reports')
    .select('report_id,event_id,reported_by,reason,details,status,created_at,resolution_note,decided_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load reports.' }, { status: 500 });

  const eventIds = [...new Set((reports || []).map((row) => row.event_id))];
  const userIds = [...new Set((reports || []).map((row) => row.reported_by))];
  const [eventsResult, usersResult] = await Promise.all([
    eventIds.length ? db.from('events').select('event_id,title').in('event_id', eventIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? db.from('users').select('user_id,name,email').in('user_id', userIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventsResult.error || usersResult.error) return NextResponse.json({ error: 'Unable to load report details.' }, { status: 500 });

  const events = new Map((eventsResult.data || []).map((row) => [row.event_id, row.title]));
  const users = new Map((usersResult.data || []).map((row) => [row.user_id, row]));
  return NextResponse.json({ reports: (reports || []).map((row) => {
    const reporter = users.get(row.reported_by);
    return {
      id: row.report_id,
      reporter: reporter?.name || 'Unknown user',
      reporterEmail: reporter?.email || '',
      eventId: row.event_id,
      event: events.get(row.event_id) || 'Removed event',
      reason: row.reason || 'Policy / Content Concern',
      details: row.details || row.reason || '',
      status: row.status === 'resolved' ? 'resolved' : 'open',
      submitted: row.created_at,
      resolutionNote: row.resolution_note || undefined,
      decidedAt: row.decided_at || undefined,
    };
  }) });
}

export async function PATCH(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (actor?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const reportId = typeof body?.id === 'string' ? body.id : '';
  const resolutionNote = typeof body?.resolutionNote === 'string' ? body.resolutionNote.trim() : '';
  if (!reportId || !resolutionNote) return NextResponse.json({ error: 'Report ID and resolution note are required.' }, { status: 400 });

  const { data, error } = await createAdminClient().from('reports').update({
    status: 'resolved',
    resolution_note: resolutionNote,
    decided_at: new Date().toISOString(),
  }).eq('report_id', reportId).select('report_id,event_id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to resolve report.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });

  await writeAuditEntry(actor, {
    action: 'report.resolved', targetType: 'report', targetId: reportId,
    summary: `Resolved report: ${resolutionNote}`,
  });
  return NextResponse.json({ success: true, report: data });
}
