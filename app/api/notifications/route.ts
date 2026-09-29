import { NextResponse } from 'next/server';
import { createClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET() {
  try {
    const account = await getAuthenticatedRole();
    if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', account.userId)
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
