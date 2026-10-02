import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { enforceRateLimit, requestIpIdentifier } from '@/lib/rate-limit';

const VALID_ACTIONS = new Set(['event_view', 'nav_click']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, {
      name: 'activity-events-ip', limit: 120, window: '1 h',
      identifiers: [requestIpIdentifier(request)],
    });
    if (limited) return limited; // Note: Upstash fails open on Redis errors in enforceRateLimit by default in our helper

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.events)) {
      return new NextResponse(null, { status: 400 });
    }

    const events = body.events.slice(0, 20); // max 20
    if (events.length === 0) return new NextResponse(null, { status: 204 });

    const account = await getAuthenticatedRole(request);
    let anonId = typeof body.visitor_id === 'string' ? body.visitor_id : null;
    if (anonId && !UUID_REGEX.test(anonId) && !anonId.startsWith('user:')) {
      anonId = null;
    }

    const actorRole = account?.role || 'visitor';
    const actorUserId = account?.userId || null;

    const supabase = createAdminClient();
    
    const rowsToInsert = events
      .filter((ev: any) => ev && typeof ev.action === 'string' && VALID_ACTIONS.has(ev.action))
      .map((ev: any) => {
        let targetId = ev.target_id;
        if (typeof targetId === 'string' && targetId.length > 200) {
          targetId = targetId.substring(0, 200);
        }
        
        return {
          actor_user_id: actorUserId,
          actor_role: actorRole,
          anon_id: account ? null : anonId,
          action: ev.action,
          target_type: ev.action === 'nav_click' ? 'navigation' : (ev.target_type || 'unknown'),
          target_id: targetId || null,
          path: typeof ev.path === 'string' ? ev.path.substring(0, 200) : null,
          metadata: {}
        };
      });

    if (rowsToInsert.length > 0) {
      await supabase.from('activity_events').insert(rowsToInsert);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // Return quickly and quietly for beacon/tracking failures
    return new NextResponse(null, { status: 204 });
  }
}

export async function GET(request: Request) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account || account.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const action = searchParams.get('action');
    const role = searchParams.get('role');
    const search = searchParams.get('search');
    const offset = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));

    const supabase = createAdminClient();
    let query = supabase
      .from('activity_events')
      .select('*, users!activity_events_actor_user_id_fkey(name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) query = query.eq('action', action);
    if (role) query = query.eq('actor_role', role);
    if (search) {
      query = query.or(`path.ilike.%${search}%,target_id.ilike.%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data, count });
  } catch (error) {
    console.error('Failed to fetch activity logs:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
