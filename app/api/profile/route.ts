import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { isGibberishText, normalizeProfileText, normalizeUsername, validatePhonePH, validatePersonOrOrgText, validateUsername } from '@/lib/validators/name';
import { validatePHLocation } from '@/lib/psgc';

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
  const username = form.get('username') !== null ? normalizeUsername(String(form.get('username'))) : undefined;
  const phone = String(form.get('phone') || '').trim().replace(/[\s()-]/g, '');
  let address = String(form.get('address') || '').trim();
  const bio = normalizeProfileText(String(form.get('bio') || ''));
  const errors: Record<string, string> = {};
  if (username) errors.username = validateUsername(username) || '';
  if (phone) errors.phone = validatePhonePH(phone) || '';
  const country = String(form.get('country') || '').trim().toUpperCase();
  const provinceOrRegionCode = String(form.get('province_or_region_code') || '').trim();
  const cityCode = String(form.get('city_code') || '').trim();
  const street = normalizeProfileText(String(form.get('street') || ''));
  if (address || provinceOrRegionCode || cityCode || street || String(form.get('city') || '').trim() || String(form.get('region') || '').trim()) {
    if (country === 'PH') {
      const location = validatePHLocation(provinceOrRegionCode, cityCode);
      if ('error' in location) errors.address = location.error || 'Invalid location';
      else address = [street, location.city, location.province, 'Philippines'].filter(Boolean).join(', ');
    } else if (!country || new Intl.DisplayNames(['en'], { type: 'region' }).of(country) === country || !String(form.get('city') || '').trim() || !String(form.get('region') || '').trim()) errors.address = 'Select a valid country and enter a valid city and region/state.';
    else if (isGibberishText(String(form.get('city')) + ' ' + String(form.get('region')))) errors.address = 'City and region/state must be real place names.';
    else address = [street, normalizeProfileText(String(form.get('city'))), normalizeProfileText(String(form.get('region'))), new Intl.DisplayNames(['en'], { type: 'region' }).of(country)].filter(Boolean).join(', ');
    if (street && validatePersonOrOrgText(street, { label: 'Street / Barangay', allowDigits: true, maxLen: 150 })) errors.address = validatePersonOrOrgText(street, { label: 'Street / Barangay', allowDigits: true, maxLen: 150 })!;
  }
  if (bio && validatePersonOrOrgText(bio, { label: 'Bio', allowDigits: true, maxLen: 300 })) errors.bio = validatePersonOrOrgText(bio, { label: 'Bio', allowDigits: true, maxLen: 300 })!;
  for (const key of Object.keys(errors)) if (!errors[key]) delete errors[key];
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Please correct the highlighted fields.', fieldErrors: errors }, { status: 400 });

  if (address.length > 200) return NextResponse.json({ error: 'Please correct the highlighted fields.', fieldErrors: { address: 'Address must be 200 characters or fewer.' } }, { status: 400 });

  if (username) {
    const usernameError = validateUsername(username);
    if (usernameError) return NextResponse.json({ error: 'Please correct the highlighted fields.', fieldErrors: { username: usernameError } }, { status: 400 });
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
    const escapedUsername = username.replace(/[\\%_]/g, '\\$&');
    const { data: existingUser } = await db.from('users').select('user_id').ilike('username', escapedUsername).neq('user_id', account.userId).maybeSingle();
    if (existingUser) return NextResponse.json({ error: 'Please correct the highlighted fields.', fieldErrors: { username: 'That username is already taken.' } }, { status: 400 });

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
  if (error?.code === '23505' && (error.message || '').includes('users_username_unique_ci')) return NextResponse.json({ error: 'Please correct the highlighted fields.', fieldErrors: { username: 'That username is already taken.' } }, { status: 400 });
  if (error) return NextResponse.json({ error: 'Unable to save your profile.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Account profile not found.' }, { status: 404 });
  return NextResponse.json({ success: true, profile: toProfile(data) });
}
