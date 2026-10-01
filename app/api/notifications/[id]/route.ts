import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { error } = await createAdminClient()
    .from('notifications')
    .update({ is_read: true })
    .eq('notification_id', id)
    .eq('user_id', account.userId);
  if (error) return NextResponse.json({ error: 'Unable to update notification.' }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { error } = await createAdminClient()
    .from('notifications')
    .delete()
    .eq('notification_id', id)
    .eq('user_id', account.userId);
  if (error) return NextResponse.json({ error: 'Unable to delete notification.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
