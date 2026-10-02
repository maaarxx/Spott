import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { isGibberishText, normalizeProfileText, validateEmail, validatePersonOrOrgText, validateWebsite, normalizeWebsite } from '@/lib/validators/name';
import { validatePHLocation } from '@/lib/psgc';

const BUCKET = 'profile-avatars';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function mapProfile(row: Record<string, unknown>) {
  return {
    organizerId: String(row.organizer_id || ''),
    name: String(row.organization_name || ''),
    caption: typeof row.description === 'string' ? row.description : '',
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : '',
    address: typeof row.address === 'string' ? row.address : '',
    email: typeof row.public_email === 'string' ? row.public_email : '',
    website: typeof row.website === 'string' ? row.website : '',
    category: typeof row.category === 'string' ? row.category : '',
  };
}

export async function GET(request: Request) {
  const db = createAdminClient();
  const name = new URL(request.url).searchParams.get('name')?.trim();
  let query = db.from('organizers').select('organizer_id,user_id,organization_name,description,avatar_url,address,public_email,website,category');
  if (name) {
    query = query.eq('organization_name', name);
  } else {
    const account = await getAuthenticatedRole(request);
    if (!account || account.role !== 'organizer') return NextResponse.json({ error: 'Organizer access required.' }, { status: account ? 403 : 401 });
    query = query.eq('user_id', account.userId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load organizer profile.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Organizer profile not found.' }, { status: 404 });
  return NextResponse.json({ profile: mapProfile(data) });
}

export async function PATCH(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account || account.role !== 'organizer') return NextResponse.json({ error: 'Organizer access required.' }, { status: account ? 403 : 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid organizer profile update.' }, { status: 400 });

  const name = normalizeProfileText(String(form.get('organization_name') || ''));
  const description = normalizeProfileText(String(form.get('description') || ''));
  let address = String(form.get('address') || '').trim();
  const email = String(form.get('public_email') || '').trim().toLowerCase();
  let website = String(form.get('website') || '').trim();
  const category = normalizeProfileText(String(form.get('category') || ''));
  const migrationMode = form.get('migration_mode') === 'true';
  const fieldErrors: Record<string, string> = {};
  const nameError = validatePersonOrOrgText(name, { label: 'Organization name', allowDigits: true, maxLen: 150 }); if (nameError) fieldErrors.name = nameError;
  const categoryError = category ? validatePersonOrOrgText(category, { label: 'Category / Focus', allowDigits: true, maxLen: 100 }) : null; if (categoryError) fieldErrors.category = categoryError;
  const captionError = description ? validatePersonOrOrgText(description, { label: 'Caption / About description', allowDigits: true, maxLen: 500 }) : null; if (captionError) fieldErrors.caption = captionError;
  const emailError = validateEmail(email); if (emailError) fieldErrors.email = emailError;
  const websiteError = validateWebsite(website); if (websiteError) fieldErrors.website = websiteError;
  const country = String(form.get('country') || '').trim().toUpperCase();
  const provinceCode = String(form.get('province_or_region_code') || '').trim();
  const cityCode = String(form.get('city_code') || '').trim();
  const cityText = normalizeProfileText(String(form.get('city') || ''));
  const regionText = normalizeProfileText(String(form.get('region') || ''));
  const street = '';
  if (address || country || cityCode || cityText) {
    if (country === 'PH') {
      const location = validatePHLocation(provinceCode, cityCode);
      if ('error' in location) fieldErrors.address = location.error || 'Invalid location';
      else address = [street, location.city, location.province, 'Philippines'].filter(Boolean).join(', ');
    } else if (!country || !cityText || !regionText || cityText.length > 150 || regionText.length > 150 || new Intl.DisplayNames(['en'], { type: 'region' }).of(country) === country || isGibberishText(`${cityText} ${regionText}`)) fieldErrors.address = 'Enter a valid city and region/state for the selected country.';
    else address = [street, cityText, regionText, new Intl.DisplayNames(['en'], { type: 'region' }).of(country)].filter(Boolean).join(', ');
  }
  if (address.length > 500) fieldErrors.address = 'Address must be 500 characters or fewer.';
  if (website) website = normalizeWebsite(website);
  if (Object.keys(fieldErrors).length) return NextResponse.json({ error: 'Please correct the highlighted fields.', fieldErrors }, { status: 400 });

  const db = createAdminClient();
  const { data: owner, error: ownerError } = await db.from('organizers').select('organizer_id,organization_name,description,avatar_url,address,public_email,website,category')
    .eq('user_id', account.userId).maybeSingle();
  if (ownerError) return NextResponse.json({ error: 'Unable to verify organizer profile.' }, { status: 500 });
  if (!owner) return NextResponse.json({ error: 'Organizer profile not found.' }, { status: 404 });

  let avatarUrl: string | null | undefined;
  if (form.get('avatar_action') === 'remove' && !migrationMode) {
    avatarUrl = null;
  } else {
    const avatar = form.get('avatar');
    if (avatar instanceof File && !(migrationMode && owner.avatar_url)) {
      if (!IMAGE_TYPES.has(avatar.type) || avatar.size <= 0 || avatar.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Choose a JPG, PNG, WEBP, or GIF image under 2 MB.' }, { status: 400 });
      }
      const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
      const extension = extensions[avatar.type as keyof typeof extensions];
      const path = `${account.userId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, avatar, { contentType: avatar.type, upsert: false });
      if (uploadError) return NextResponse.json({ error: 'Unable to upload organization logo.' }, { status: 500 });
      avatarUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
  }

  const values: Record<string, string | null> = {
    organization_name: name,
    description: description || null,
    address: address || null,
    public_email: email || null,
    website: website || null,
    category: category || null,
  };
  const update: Record<string, string | null> = migrationMode
    ? Object.fromEntries(Object.entries(values).filter(([key, value]) => key !== 'organization_name' && !owner[key as keyof typeof owner] && value)) as Record<string, string | null>
    : values;
  if (migrationMode && owner.avatar_url) avatarUrl = undefined;
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl;
  const { data, error } = await db.from('organizers').update(update)
    .eq('organizer_id', owner.organizer_id)
    .select('organizer_id,user_id,organization_name,description,avatar_url,address,public_email,website,category')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to save organizer profile.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Organizer profile not found.' }, { status: 404 });
  return NextResponse.json({ success: true, profile: mapProfile(data) });
}
