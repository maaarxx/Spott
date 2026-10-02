import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

const BUCKET = 'profile-avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function toProfile(row: Record<string, unknown>) {
  return {
    email: String(row.email || ''),
    username: typeof row.username === 'string' ? row.username : undefined,
    usernameUpdatedAt: typeof row.username_updated_at === 'string' ? row.username_updated_at : undefined,
    displayName: typeof row.display_name === 'string' ? row.display_name : '',
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : undefined,
    phone: typeof row.phone === 'string' ? row.phone : undefined,
    address: typeof row.address === 'string' ? row.address : undefined,
    bio: typeof row.bio === 'string' ? row.bio : undefined,
  };
}

export async function GET(request: Request) {
  const isDebug = process.env.DEBUG_TIMING === "1";
  const start = Date.now();
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Sign in to load your profile.' }, { status: 401 });

  const queryStart = Date.now();
  const { data, error } = await createAdminClient().from('users')
    .select('email,username,username_updated_at,name,display_name,avatar_url,phone,address,bio')
    .eq('user_id', account.userId).maybeSingle();
  if (isDebug) console.log(`[Timing] /api/profile main query: ${Date.now() - queryStart}ms`);
  
  if (error) return NextResponse.json({ error: 'Unable to load your profile.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Account profile not found.' }, { status: 404 });
  
  if (isDebug) console.log(`[Timing] /api/profile total: ${Date.now() - start}ms`);
  return NextResponse.json({ profile: toProfile(data) });
}

export async function PATCH(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Sign in to update your profile.' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid profile update.' }, { status: 400 });
  
  // Name is now locked, but we keep reading it just in case, though we will ignore changes.
  const username = form.get('username') !== null ? String(form.get('username')).trim() : undefined;
  const phone = String(form.get('phone') || '').trim();
  const address = String(form.get('address') || '').trim();
  const bio = String(form.get('bio') || '').trim();

  if (phone.length > 30 || address.length > 200 || bio.length > 300 || (username && username.length > 20)) {
    return NextResponse.json({ error: 'One or more profile fields exceed their allowed length.' }, { status: 400 });
  }

  if (username && !/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
    return NextResponse.json({ error: 'Username must be 4–20 characters, containing only letters, numbers, and underscores.' }, { status: 400 });
  }

  if (phone && (!/^09\d{9}$/.test(phone))) {
    return NextResponse.json({ error: 'Phone number must start with 09 and be exactly 11 digits long.' }, { status: 400 });
  }

  if (address) {
    if (address.replace(/\\s/g, '').length < 5) return NextResponse.json({ error: 'Address is too short.' }, { status: 400 });
    if (/([a-zA-Z])\\1{4,}/.test(address) || /(.)\\1{5,}/.test(address)) {
      return NextResponse.json({ error: 'Address contains invalid repetitive characters.' }, { status: 400 });
    }
  }

  const db = createAdminClient();
  const migrationMode = form.get('migration_mode') === 'true';
  const { data: current, error: currentError } = await db.from('users')
    .select('username,username_updated_at,display_name,avatar_url,phone,address,bio').eq('user_id', account.userId).maybeSingle();
  if (currentError) return NextResponse.json({ error: 'Unable to load your current profile.' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Account profile not found.' }, { status: 404 });
  
  // Enforce username cooldown logic
  if (username !== undefined && username.toLowerCase() !== (current.username || '').toLowerCase()) {
    // Check if the username is already taken
    const { data: existingUser } = await db.from('users').select('user_id').eq('username', username).neq('user_id', account.userId).maybeSingle();
    if (existingUser) return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });

    if (current.username_updated_at) {
      const lastUpdate = new Date(current.username_updated_at);
      const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 30) {
        const remainingDays = Math.ceil(30 - daysSinceUpdate);
        return NextResponse.json({ error: `Username can only be changed once every 30 days. You must wait ${remainingDays} more day(s).` }, { status: 403 });
      }
    }
  }

  let avatarUrl: string | null | undefined;
  const avatarAction = form.get('avatar_action');
  const avatar = form.get('avatar');
  if (avatarAction === 'remove' && !migrationMode) {
    avatarUrl = null;
  } else if (avatar instanceof File && !(migrationMode && current.avatar_url)) {
    if (!ALLOWED_IMAGE_TYPES.has(avatar.type) || avatar.size <= 0 || avatar.size > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: 'Choose a JPG, PNG, WEBP, or GIF image under 2 MB.' }, { status: 400 });
    }
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as const)[avatar.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'];
    const path = `${account.userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, avatar, { contentType: avatar.type, upsert: false });
    if (uploadError) return NextResponse.json({ error: 'Unable to upload profile photo.' }, { status: 500 });
    avatarUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const values: Record<string, string | null> = {
    phone: phone || null,
    address: address || null,
    bio: bio || null,
  };
  
  if (username !== undefined && username.toLowerCase() !== (current.username || '').toLowerCase()) {
    values.username = username || null;
    values.username_updated_at = new Date().toISOString();
  }

  const update: Record<string, string | null> = migrationMode
    ? Object.fromEntries(Object.entries(values).filter(([key, value]) => !current[key as keyof typeof current] && value)) as Record<string, string | null>
    : values;
  if (migrationMode && current.avatar_url) avatarUrl = undefined;
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl;
  const { data, error } = await db.from('users').update(update)
    .eq('user_id', account.userId)
    .select('email,username,username_updated_at,name,display_name,avatar_url,phone,address,bio')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to save your profile.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Account profile not found.' }, { status: 404 });
  return NextResponse.json({ success: true, profile: toProfile(data) });
}
