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

    const { error } = await supabase
      .from('registrations')
      .upsert(
        { user_id: userId, event_id: id, status: 'registered' },
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
