import { NextResponse } from 'next/server';
import { createClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const account = await getAuthenticatedRole();
    if (!account) return NextResponse.json({ success: false, message: 'Sign in to RSVP.' }, { status: 401 });
    const supabase = await createClient();

    const { error } = await supabase
      .from('registrations')
      .upsert(
        { user_id: account.userId, event_id: id, status: 'registered' },
        { onConflict: 'user_id,event_id' }
      );

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'RSVP saved successfully.' });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'Could not save RSVP.' },
      { status: 500 }
    );
  }
}
