import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Demo user - in production, get from auth session
    const userId = '11111111-1111-1111-1111-111111111111';

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (data || []).map((n: any) => ({
      id: n.notification_id,
      type: n.type,
      title: n.title,
      message: n.message || '',
      isRead: n.is_read,
      createdAt: n.created_at,
    }));

    return NextResponse.json(formatted);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
