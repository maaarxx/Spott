import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { enforceRateLimit, requestIpIdentifier } from '@/lib/rate-limit';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ success: false, message: 'Sign in to submit a report.' }, { status: 401 });
    const ipLimited = await enforceRateLimit(request, {
      name: 'event-report-ip', limit: 10, window: '1 h', identifiers: [requestIpIdentifier(request)],
    });
    if (ipLimited) return ipLimited;
    const userLimited = await enforceRateLimit(request, {
      name: 'event-report-user', limit: 5, window: '1 h', identifiers: [`user:${account.userId}`],
    });
    if (userLimited) return userLimited;
    const supabase = createAdminClient();
    const body = await request.json();
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const details = typeof body.details === 'string' ? body.details.trim() : '';

    if (!details || details.length < 5) {
      return NextResponse.json(
        { success: false, message: 'Event and report reason are required (min 5 characters).' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('reports')
      .insert([{ event_id: id, reported_by: account.userId, reason: reason || details, details }]);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Report submitted for admin review.' });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Could not submit report.' },
      { status: 500 }
    );
  }
}
