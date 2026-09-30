import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const db = createAdminClient();
  const { data: profile, error } = await db.from('users').select('name,email,role').eq('email', user.email.toLowerCase()).maybeSingle();
  if (error || !profile) return NextResponse.json({ error: 'Account profile not found' }, { status: 404 });
  let organizerStatus: string | null = null;
  if (profile.role === 'organizer') {
    const { data } = await db.from('pending_organizers').select('status').eq('email', user.email.toLowerCase()).maybeSingle();
    organizerStatus = data?.status || 'pending';
  }
  return NextResponse.json({ account: { ...profile, organizerStatus } });
}
