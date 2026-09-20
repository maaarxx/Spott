import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('events')
      .update({ is_still_happening_confirmed_at: new Date().toISOString() })
      .eq('event_id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Thanks! The event was marked as still happening.' });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'Could not confirm event.' },
      { status: 500 }
    );
  }
}
