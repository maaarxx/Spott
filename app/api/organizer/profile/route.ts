import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

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

  const name = String(form.get('organization_name') || '').trim();
  const description = String(form.get('description') || '').trim();
  const address = String(form.get('address') || '').trim();
  const email = String(form.get('public_email') || '').trim();
  const website = String(form.get('website') || '').trim();
  const category = String(form.get('category') || '').trim();
  const migrationMode = form.get('migration_mode') === 'true';
  if (!name || name.length > 150 || description.length > 5000 || address.length > 500 || email.length > 254 || website.length > 500 || category.length > 100) {
    return NextResponse.json({ error: 'Check the required organization name and field lengths.' }, { status: 400 });
  }

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
