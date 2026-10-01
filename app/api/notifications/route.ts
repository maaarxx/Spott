import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { errorMessage } from '@/lib/error-message';

export async function GET() {
  try {
    const account = await getAuthenticatedRole();
    if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', account.userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (data || []).map((n: {
      notification_id: string;
      type: string;
      title: string;
      message: string | null;
      is_read: boolean;
      created_at: string;
    }) => ({
      id: n.notification_id,
      type: n.type,
      title: n.title,
      message: n.message || '',
      isRead: n.is_read,
      createdAt: n.created_at,
    }));

    return NextResponse.json(formatted);
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
