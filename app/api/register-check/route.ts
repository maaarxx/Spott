import { NextResponse } from 'next/server';
import { resolveMx } from 'node:dns/promises';
import { createAdminClient } from '@/lib/supabase-server';

const disposable = new Set(['mailinator.com','tempmail.com','10minutemail.com','guerrillamail.com','yopmail.com','throwawaymail.com','trashmail.com','fakeinbox.com']);
export async function POST(request: Request) {
  try {
    const { email, username, password, firstName, mi, lastName } = await request.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedFirstName = String(firstName || '').trim();
    const normalizedMi = String(mi || '').trim();
    const normalizedLastName = String(lastName || '').trim();
    const validNamePart = /^[\p{L}\p{M}][\p{L}\p{M} '\u2019-]*$/u;
    if (!normalizedFirstName || normalizedFirstName.length > 100 || !validNamePart.test(normalizedFirstName)) return NextResponse.json({ error: 'Enter a valid first name (maximum 100 characters; letters, spaces, apostrophes, and hyphens only).' }, { status: 400 });
    if (normalizedMi && !/^[A-Za-z]$/.test(normalizedMi)) return NextResponse.json({ error: 'Middle initial must be one alphabetic character.' }, { status: 400 });
    if (!normalizedLastName || normalizedLastName.length > 150 || !validNamePart.test(normalizedLastName)) return NextResponse.json({ error: 'Enter a valid last name (maximum 150 characters; letters, spaces, apostrophes, and hyphens only).' }, { status: 400 });
    if (typeof password !== 'string' || password.length < 8 || password.length > 20 || /\s/.test(password)) return NextResponse.json({ error: 'Password must be 8–20 characters with no spaces.' }, { status: 400 });
    const passLower = password.toLowerCase();
    const nameParts = [normalizedFirstName, normalizedLastName].flatMap((part) => part.toLowerCase().split(/[\s.'’_-]+/)).filter((part) => part.length >= 2);
    if (nameParts.some((part) => passLower.includes(part))) return NextResponse.json({ error: 'Password cannot contain any part of your first or last name.' }, { status: 400 });
    if (normalizedUsername && passLower.includes(normalizedUsername)) return NextResponse.json({ error: 'Password cannot contain your username.' }, { status: 400 });
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
