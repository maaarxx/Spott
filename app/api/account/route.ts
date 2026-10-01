import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const auth = await createClient();
  const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const { data: { user } } = await auth.auth.getUser(bearerToken);
  if (!user?.email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const db = createAdminClient();
  const { data: profile, error } = await db.from('users')
    .select('name,display_name,first_name,middle_initial,last_name,username,email,role,user_id')
    .eq('email', user.email.toLowerCase()).maybeSingle();
  if (error || !profile) return NextResponse.json({ error: 'Account profile not found' }, { status: 404 });
  let organizerStatus: string | null = null;
  let organization: string | null = null;
  if (profile.role === 'organizer') {
    const [{ data: application, error: applicationError }, { data: organizer, error: organizerError }] = await Promise.all([
      db.from('pending_organizers').select('status').eq('user_id', profile.user_id).maybeSingle(),
      db.from('organizers').select('organization_name').eq('user_id', profile.user_id).maybeSingle(),
    ]);
    if (applicationError || organizerError) {
      return NextResponse.json({ error: 'Unable to load organizer account details.' }, { status: 500 });
    }
    organizerStatus = application?.status || (organizer ? 'approved' : 'pending');
    organization = organizer?.organization_name || null;
  }
  return NextResponse.json({ account: { ...profile, organization, organizerStatus } });
}
