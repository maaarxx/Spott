import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const account = await getAuthenticatedRole(_request);
    const db = createAdminClient();
    const { data, error } = await db.from('event_comments').select('id,event_id,user_id,content,created_at,users(name)').eq('event_id', id).order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ comments: (data || []).map((row) => ({ ...row, is_owner: account?.userId === row.user_id })) });
  } catch { return NextResponse.json({ error: 'Unable to load comments.' }, { status: 500 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'Sign in to comment.' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content || content.length > 2000) return NextResponse.json({ error: 'Comment must be 1–2,000 characters.' }, { status: 400 });
    const db = createAdminClient();
    const { data, error } = await db.from('event_comments').insert({ event_id: id, user_id: account.userId, content }).select('id,event_id,user_id,content,created_at,users(name)').single();
    if (error) throw error;
    return NextResponse.json({ comment: data }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Unable to post comment.' }, { status: 500 }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'Sign in to delete a comment.' }, { status: 401 });
    const { id } = await params;
    const commentId = new URL(request.url).searchParams.get('commentId');
    if (!commentId) return NextResponse.json({ error: 'Comment ID is required.' }, { status: 400 });
    const { error } = await createAdminClient().from('event_comments').delete().eq('id', commentId).eq('event_id', id).eq('user_id', account.userId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Unable to delete comment.' }, { status: 500 }); }
}
