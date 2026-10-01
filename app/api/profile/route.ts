import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

const BUCKET = 'profile-avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function toProfile(row: Record<string, unknown>) {
  return {
    email: String(row.email || ''),
    displayName: typeof row.display_name === 'string' ? row.display_name : '',
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : undefined,
    phone: typeof row.phone === 'string' ? row.phone : undefined,
    address: typeof row.address === 'string' ? row.address : undefined,
    bio: typeof row.bio === 'string' ? row.bio : undefined,
  };
}

export async function GET(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Sign in to load your profile.' }, { status: 401 });

  const { data, error } = await createAdminClient().from('users')
    .select('email,name,display_name,avatar_url,phone,address,bio')
    .eq('user_id', account.userId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load your profile.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Account profile not found.' }, { status: 404 });
  return NextResponse.json({ profile: toProfile(data) });
}

export async function PATCH(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Sign in to update your profile.' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid profile update.' }, { status: 400 });
  const displayName = String(form.get('display_name') || '').trim();
  const phone = String(form.get('phone') || '').trim();
  const address = String(form.get('address') || '').trim();
  const bio = String(form.get('bio') || '').trim();
  if (displayName.length > 120 || phone.length > 30 || address.length > 2000 || bio.length > 300) {
    return NextResponse.json({ error: 'One or more profile fields exceed their allowed length.' }, { status: 400 });
  }

  const db = createAdminClient();
  const migrationMode = form.get('migration_mode') === 'true';
  const { data: current, error: currentError } = await db.from('users')
    .select('display_name,avatar_url,phone,address,bio').eq('user_id', account.userId).maybeSingle();
  if (currentError) return NextResponse.json({ error: 'Unable to load your current profile.' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Account profile not found.' }, { status: 404 });
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
    display_name: displayName || null,
    phone: phone || null,
    address: address || null,
    bio: bio || null,
  };
  const update: Record<string, string | null> = migrationMode
    ? Object.fromEntries(Object.entries(values).filter(([key, value]) => !current[key as keyof typeof current] && value)) as Record<string, string | null>
    : values;
  if (migrationMode && current.avatar_url) avatarUrl = undefined;
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl;
  const { data, error } = await db.from('users').update(update)
    .eq('user_id', account.userId)
    .select('email,name,display_name,avatar_url,phone,address,bio')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to save your profile.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Account profile not found.' }, { status: 404 });
  return NextResponse.json({ success: true, profile: toProfile(data) });
}
