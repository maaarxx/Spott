import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Demo user - in production, get from auth session
    const userId = '11111111-1111-1111-1111-111111111111';

    // Check if already saved
    const { data: existing } = await supabase
      .from('saved_events')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', id)
      .maybeSingle();

    if (existing) {
      // Remove save
      const { error } = await supabase
        .from('saved_events')
        .delete()
        .eq('user_id', userId)
        .eq('event_id', id);

      if (error) throw error;
      return NextResponse.json({ success: true, saved: false, message: 'Event removed from your plan.' });
    } else {
      // Save event
      const { error } = await supabase
        .from('saved_events')
        .insert([{ user_id: userId, event_id: id }]);

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
