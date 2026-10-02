import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const isDebug = process.env.DEBUG_TIMING === "1";
  const start = Date.now();
  const auth = await createClient();
  const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  
  let userId = null;
  let userEmail = null;
  try {
    const { data: claimsData } = await auth.auth.getClaims(bearerToken);
    if (claimsData?.claims) {
      userId = claimsData.claims.sub;
      userEmail = claimsData.claims.email;
    }
  } catch (e) {
    const { data: { user } } = await auth.auth.getUser(bearerToken);
    if (user?.email) {
      userId = user.id;
      userEmail = user.email;
    }
  }
  
  if (!userEmail) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  
  const queryStart = Date.now();
  const db = createAdminClient();
  const { data: profile, error } = await db.from('users')
    .select('name,display_name,first_name,middle_initial,last_name,username,email,role,user_id')
    .eq('email', userEmail.toLowerCase()).maybeSingle();
  if (isDebug) console.log(`[Timing] /api/account main query: ${Date.now() - queryStart}ms`);
  
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
  if (isDebug) console.log(`[Timing] /api/account total: ${Date.now() - start}ms`);
  return NextResponse.json({ account: { ...profile, organization, organizerStatus } });
}
