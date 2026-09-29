import { NextResponse } from 'next/server';
import { createClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const account = await getAuthenticatedRole();
    if (!account) return NextResponse.json({ success: false, message: 'Sign in to save events.' }, { status: 401 });
    const supabase = await createClient();

    // Check if already saved
    const { data: existing } = await supabase
      .from('saved_events')
      .select('*')
      .eq('user_id', account.userId)
      .eq('event_id', id)
      .maybeSingle();

    if (existing) {
      // Remove save
      const { error } = await supabase
        .from('saved_events')
        .delete()
        .eq('user_id', account.userId)
        .eq('event_id', id);

      if (error) throw error;
      return NextResponse.json({ success: true, saved: false, message: 'Event removed from your plan.' });
    } else {
      // Save event
      const { error } = await supabase
        .from('saved_events')
        .insert([{ user_id: account.userId, event_id: id }]);

      if (error) throw error;
      return NextResponse.json({ success: true, saved: true, message: 'Event saved to your plan.' });
    }
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'Could not update saved event.' },
      { status: 500 }
    );
  }
}
