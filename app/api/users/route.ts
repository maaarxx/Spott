import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { writeAuditEntry } from '@/lib/audit-log-server';

export async function GET(request: Request) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'No Supabase session or account profile was found. Sign in again with your production account.', code: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
    if (account.role !== 'admin') return NextResponse.json({ error: 'Your signed-in account does not have the admin role.', code: 'ADMIN_ROLE_REQUIRED' }, { status: 403 });
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('users')
      .select('user_id, name, display_name, avatar_url, phone, address, first_name, middle_initial, last_name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: 'Unable to load users' }, { status: 500 });
    const { data: pending } = await supabase.from('pending_organizers').select('user_id').in('status', ['pending', 'rejected']);
    const notActiveOrganizerIds = new Set((pending || []).map((row) => row.user_id));
    return NextResponse.json({ users: (data || []).filter((row) => !notActiveOrganizerIds.has(row.user_id)) });
  } catch {
    return NextResponse.json({ error: 'Unable to load users' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await getAuthenticatedRole(request);
    if (account?.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
    const body = await request.json().catch(() => null);
    const userId = typeof body?.user_id === 'string' ? body.user_id : '';
    const role = typeof body?.role === 'string' ? body.role : '';
    if (!userId || !['user', 'organizer', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'A user ID and valid role are required.' }, { status: 400 });
    }

    const update: Record<string, string | null> = { role };
    if (typeof body.name === 'string') {
      if (!body.name.trim() || body.name.trim().length > 200) return NextResponse.json({ error: 'Name must be between 1 and 200 characters.' }, { status: 400 });
      update.name = body.name.trim();
    }
    if (typeof body.first_name === 'string' && body.first_name.trim().length > 100) return NextResponse.json({ error: 'First name must be 100 characters or fewer.' }, { status: 400 });
    if (typeof body.middle_initial === 'string' && body.middle_initial.trim() && !/^[A-Za-z]$/.test(body.middle_initial.trim())) return NextResponse.json({ error: 'Middle initial must be one alphabetic character.' }, { status: 400 });
    if (typeof body.last_name === 'string' && body.last_name.trim().length > 150) return NextResponse.json({ error: 'Last name must be 150 characters or fewer.' }, { status: 400 });
    for (const field of ['first_name', 'middle_initial', 'last_name'] as const) {
      if (body[field] !== undefined) update[field] = typeof body[field] === 'string' && body[field].trim() ? body[field].trim() : null;
    }

    const { data, error } = await createAdminClient().from('users').update(update)
      .eq('user_id', userId)
      .select('user_id,name,display_name,avatar_url,phone,address,first_name,middle_initial,last_name,email,role,created_at')
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to update user.' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    const { invalidateRoleCache } = await import('@/lib/supabase-server');
    invalidateRoleCache(userId);
    await writeAuditEntry(account, {
      action: 'user.updated', targetType: 'user', targetId: userId,
      summary: `Updated account details for ${data.name}.`,
    });
    return NextResponse.json({ success: true, user: data });
  } catch {
    return NextResponse.json({ error: 'Unable to update user.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'No Supabase session or account profile was found. Sign in again with your production account.', code: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
    if (account.role !== 'admin') return NextResponse.json({ error: 'Your signed-in account does not have the admin role.', code: 'ADMIN_ROLE_REQUIRED' }, { status: 403 });
    const body = await request.json();
    const { name, email, role } = body || {};

    if (role !== undefined && !['user', 'organizer', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 150) {
      return NextResponse.json({ error: 'Enter a valid email address (maximum 150 characters).' }, { status: 400 });
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 200)) {
      return NextResponse.json({ error: 'Name must be between 1 and 200 characters.' }, { status: 400 });
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
      console.error('Admin user upsert failed', { code: error.code });
      return NextResponse.json({ error: 'Unable to save this user.' }, { status: 500 });
    }

    await writeAuditEntry(account, {
      action: 'user.upserted', targetType: 'user', targetId: data?.user_id,
      summary: `Created or updated ${role || 'user'} account for ${data?.email || email}.`,
    });

    return NextResponse.json({ success: true, user: data });
  } catch {
    return NextResponse.json({ error: 'Unable to save this user.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'Sign in as an administrator to remove accounts.' }, { status: 401 });
    if (account.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
    const body = await request.json().catch(() => null) as { user_id?: unknown; email?: unknown } | null;
    const userId = typeof body?.user_id === 'string' ? body.user_id : '';
    if (!userId) return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });

    const supabase = createAdminClient();
    const { data: profile, error: lookupError } = await supabase
      .from('users').select('user_id,email').eq('user_id', userId).maybeSingle();
    if (lookupError) return NextResponse.json({ error: 'Unable to locate account.' }, { status: 500 });
    if (!profile) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    if (typeof body?.email === 'string' && profile.email.toLowerCase() !== body.email.trim().toLowerCase()) {
      return NextResponse.json({ error: 'Account details did not match.' }, { status: 409 });
    }

    // Remove a linked Supabase Auth identity when one exists. Legacy demo
    // profiles such as org@example.com have no Auth identity and are still
    // removed from the application tables below.
    const { data: authIdentity } = await supabase.auth.admin.getUserById(profile.user_id);
    if (authIdentity.user) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(profile.user_id);
      if (authDeleteError) return NextResponse.json({ error: 'Unable to remove the sign-in account.' }, { status: 500 });
    }

    const { error: deleteError } = await supabase.from('users').delete().eq('user_id', profile.user_id);
    if (deleteError) return NextResponse.json({ error: 'Unable to remove the account.' }, { status: 500 });
    await writeAuditEntry(account, {
      action: 'user.deleted', targetType: 'user', targetId: profile.user_id,
      summary: `Deleted account ${profile.email} from Supabase and the application.`,
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unable to remove account.' }, { status: 500 });
  }
}
