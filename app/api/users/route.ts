import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { errorMessage } from '@/lib/error-message';

export async function GET() {
  try {
    const account = await getAuthenticatedRole();
    if (account?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('users')
      .select('user_id, name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: 'Unable to load users' }, { status: 500 });
    const { data: pending } = await supabase.from('pending_organizers').select('user_id').in('status', ['pending', 'rejected']);
    const notActiveOrganizerIds = new Set((pending || []).map((row) => row.user_id));
    return NextResponse.json({ users: (data || []).filter((row) => !notActiveOrganizerIds.has(row.user_id)) });
  } catch {
    return NextResponse.json({ error: 'Unable to load users' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await getAuthenticatedRole();
    if (account?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await request.json();
    const { name, email, role } = body;

    if (role !== undefined && !['user', 'organizer', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

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
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error, 'Server error') }, { status: 500 });
  }
}
