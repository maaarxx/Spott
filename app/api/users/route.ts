import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('users')
      .select('user_id, name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ users: [] });
    }

    return NextResponse.json({ users: data || [] });
  } catch {
    return NextResponse.json({ users: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, role } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          name: name || email.split('@')[0],
          email: email.trim().toLowerCase(),
          role: role || 'user',
          created_at: nowIso,
        },
        { onConflict: 'email' }
      )
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
