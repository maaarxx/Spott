import { NextResponse } from 'next/server';
import { createClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const account = await getAuthenticatedRole();
    if (!account) return NextResponse.json({ success: false, message: 'Sign in to submit a report.' }, { status: 401 });
    const supabase = await createClient();
    const body = await request.json();
    const reason = (body.reason || '').trim();

    if (!reason || reason.length < 5) {
      return NextResponse.json(
        { success: false, message: 'Event and report reason are required (min 5 characters).' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('reports')
      .insert([{ event_id: id, reported_by: account.userId, reason }]);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Report submitted for admin review.' });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, message: 'Could not submit report.' },
      { status: 500 }
    );
  }
}
