import { NextResponse } from 'next/server';
import { resolveMx } from 'node:dns/promises';
import { createAdminClient } from '@/lib/supabase-server';

const disposable = new Set(['mailinator.com','tempmail.com','10minutemail.com','guerrillamail.com','yopmail.com','throwawaymail.com','trashmail.com','fakeinbox.com']);
export async function POST(request: Request) {
  try {
    const { email, username, password, name } = await request.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedUsername = String(username || '').trim().toLowerCase();
    if (typeof name !== 'string' || name.trim().length < 5 || name.trim().length > 50 || !/^([^,]{2,50}),\s*([A-Za-z][A-Za-z '\u2019-]{1,49}?)(?:\s+([A-Za-z]))?\.?$/.test(name.trim())) return NextResponse.json({ error: 'Enter your name as Last name, First name MI (maximum 50 characters).' }, { status: 400 });
    if (typeof password !== 'string' || password.length < 8 || password.length > 64 || /\s/.test(password)) return NextResponse.json({ error: 'Password must be 8–64 characters with no spaces.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) return NextResponse.json({ error: 'Enter a valid email address (max 254 characters).' }, { status: 400 });
    if (!/^[a-z0-9_]{4,20}$/.test(normalizedUsername)) return NextResponse.json({ error: 'Username must be 4–20 letters, numbers, or underscores.' }, { status: 400 });
    const domain = normalizedEmail.split('@')[1];
    if (disposable.has(domain)) return NextResponse.json({ error: 'Please use a non-disposable email address.' }, { status: 400 });
    try { if (!(await resolveMx(domain)).length) throw new Error(); } catch { return NextResponse.json({ error: 'That email domain cannot receive mail.' }, { status: 400 }); }
    const db = createAdminClient();
    const [{ data: usernameRow }, { data: authList }] = await Promise.all([
      db.from('users').select('user_id').ilike('username', normalizedUsername).maybeSingle(),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (usernameRow) return NextResponse.json({ error: 'Username already in use.' }, { status: 409 });
    const { data: emailRow } = await db.from('users').select('user_id').ilike('email', normalizedEmail).maybeSingle();
    if (emailRow || authList?.users.some((user) => user.email?.toLowerCase() === normalizedEmail)) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    return NextResponse.json({ valid: true });
  } catch { return NextResponse.json({ error: 'Unable to validate your details right now.' }, { status: 500 }); }
}
