import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

function clientFor(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !key) throw new Error('Supabase is not configured.');
  const client = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined });
  return { client, token };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { client, token } = clientFor(request);
    const { data: auth } = token ? await client.auth.getUser(token) : { data: { user: null } };
    const { data, error } = await client.from('event_comments').select('id,event_id,user_id,content,created_at').eq('event_id', id).order('created_at', { ascending: true });
    if (error) throw error;
    const comments = (data || []).map((row) => ({ ...row, users: { name: 'Spott user' }, is_owner: auth.user?.id === row.user_id }));
    return NextResponse.json({ comments });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const migration = /event_comments|schema cache/i.test(message);
    return NextResponse.json({ error: migration ? 'Comments are not enabled yet. Apply the latest Supabase migration.' : 'Unable to load comments. Please refresh and try again.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { client, token } = clientFor(request);
    if (!token) return NextResponse.json({ error: 'Your Supabase sign-in session is missing. Sign out and sign in again, then retry.' }, { status: 401 });
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) return NextResponse.json({ error: 'Your sign-in session expired. Sign in again, then retry.' }, { status: 401 });
    const body = await request.json();
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content || content.length > 2000) return NextResponse.json({ error: 'Comment must be 1–2,000 characters.' }, { status: 400 });
    const { data, error } = await client.from('event_comments').insert({ event_id: id, user_id: auth.user.id, content }).select('id,event_id,user_id,content,created_at').single();
    if (error) throw error;
    return NextResponse.json({ comment: { ...data, users: { name: auth.user.user_metadata?.name || auth.user.email || 'Spott user' }, is_owner: true } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const migration = /event_comments|schema cache/i.test(message);
    return NextResponse.json({ error: migration ? 'Comments are not enabled yet. Apply the latest Supabase migrations.' : `Supabase rejected the comment: ${message || 'unknown database error'}` }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { client, token } = clientFor(request);
    if (!token) return NextResponse.json({ error: 'Sign in again to delete your comment.' }, { status: 401 });
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) return NextResponse.json({ error: 'Sign in again to delete your comment.' }, { status: 401 });
    const commentId = new URL(request.url).searchParams.get('commentId');
    if (!commentId) return NextResponse.json({ error: 'Comment ID is required.' }, { status: 400 });
    const { error } = await client.from('event_comments').delete().eq('id', commentId).eq('event_id', id).eq('user_id', auth.user.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Unable to delete comment.' }, { status: 500 }); }
}
