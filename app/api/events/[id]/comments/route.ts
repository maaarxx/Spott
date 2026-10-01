import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const account = await getAuthenticatedRole(_request);
    const db = createAdminClient();
    const { data, error } = await db.from('event_comments').select('id,event_id,user_id,content,created_at').eq('event_id', id).order('created_at', { ascending: true });
    if (error) throw error;
    const userIds = [...new Set((data || []).map((row) => row.user_id))];
    const { data: profiles } = userIds.length ? await db.from('users').select('user_id,name').in('user_id', userIds) : { data: [] };
    const names = new Map((profiles || []).map((profile) => [profile.user_id, profile.name]));
    return NextResponse.json({ comments: (data || []).map((row) => ({ ...row, users: { name: names.get(row.user_id) || 'Spott user' }, is_owner: account?.userId === row.user_id })) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error && error.message.includes('event_comments') ? 'Comments are not enabled yet. Apply the latest Supabase migration, then try again.' : 'Unable to load comments. Please refresh and try again.' }, { status: 500 }); }
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
    const { data, error } = await db.from('event_comments').insert({ event_id: id, user_id: account.userId, content }).select('id,event_id,user_id,content,created_at').single();
    if (error) throw error;
    const { data: profile } = await db.from('users').select('name').eq('user_id', account.userId).maybeSingle();
    return NextResponse.json({ comment: { ...data, users: { name: profile?.name || account.email }, is_owner: true } }, { status: 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    const migrationIssue = /event_comments|schema cache/i.test(detail);
    return NextResponse.json({ error: migrationIssue ? 'Comments are not enabled yet. Apply the latest Supabase migration, then try again.' : 'Unable to post comment. Check your sign-in and try again.' }, { status: 500 });
  }
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
