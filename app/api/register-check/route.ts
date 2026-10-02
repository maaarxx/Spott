import { NextResponse } from 'next/server';
import { resolveMx } from 'node:dns/promises';
import { createAdminClient } from '@/lib/supabase-server';
import { enforceRateLimit, requestIpIdentifier } from '@/lib/rate-limit';
import { validateName, validateMI, validateOrganizerName } from '@/lib/validators/name';
import { validateUsername } from '@/lib/validators/name';

const disposable = new Set(['mailinator.com','tempmail.com','10minutemail.com','guerrillamail.com','yopmail.com','throwawaymail.com','trashmail.com','fakeinbox.com']);
export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, {
      name: 'signup-check-ip', limit: 30, window: '15 m',
      identifiers: [requestIpIdentifier(request)],
    });
    if (limited) return limited;
    const body = await request.json();
    const { email, username, password, firstName, mi, lastName } = body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (body.role === 'organizer') {
      const organizerName = typeof body.organizerName === 'string' ? body.organizerName.trim() : '';
      if (!organizerName) return NextResponse.json({ error: 'Organizer name is required.' }, { status: 400 });
      const orgNameError = validateOrganizerName(organizerName);
      if (orgNameError) return NextResponse.json({ error: orgNameError }, { status: 400 });
      if (organizerName.length > 50 || organizerName.replace(/\s/g, '').length < 25) {
        return NextResponse.json({ error: 'Organizer name must have at least 25 characters, excluding spaces, and no more than 50 characters total.' }, { status: 400 });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 150) {
        return NextResponse.json({ error: !normalizedEmail ? 'Email is required.' : 'Enter a valid email address (maximum 150 characters).' }, { status: 400 });
      }
      if (typeof password !== 'string' || !password) return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
      if (password.length < 8 || password.length > 20 || /\s/.test(password)) {
        return NextResponse.json({ error: 'Password must be 8–20 characters with no spaces.' }, { status: 400 });
      }
      const db = createAdminClient();
      const [{ data: emailRow, error: emailLookupError }, { data: authList, error: authListError }] = await Promise.all([
        db.from('users').select('user_id').ilike('email', normalizedEmail).maybeSingle(),
        db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);
      if (emailLookupError || authListError) return NextResponse.json({ error: 'Unable to check this email right now.' }, { status: 503 });
      if (emailRow || authList?.users.some((user) => user.email?.toLowerCase() === normalizedEmail)) {
        return NextResponse.json({ error: 'Email is already in use.' }, { status: 409 });
      }
      return NextResponse.json({ valid: true });
    }
    if (body.checkEmailOnly === true) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 150) {
        return NextResponse.json({ error: 'Enter a valid email address (maximum 150 characters).' }, { status: 400 });
      }
      const { data: existingEmail, error: emailLookupError } = await createAdminClient()
        .from('users').select('user_id').ilike('email', normalizedEmail).maybeSingle();
      if (emailLookupError) {
        console.error('Signup email availability check failed', { code: emailLookupError.code });
        return NextResponse.json({ error: 'Unable to check this email right now.' }, { status: 503 });
      }
      if (existingEmail) return NextResponse.json({ error: 'Email is already in use.' }, { status: 409 });
      return NextResponse.json({ available: true });
    }
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedFirstName = String(firstName || '').trim();
    const normalizedMi = String(mi || '').trim();
    const normalizedLastName = String(lastName || '').trim();
    
    if (!normalizedFirstName) return NextResponse.json({ error: 'First name is required.' }, { status: 400 });
    const firstNameError = validateName(normalizedFirstName, { label: 'First name' });
    if (firstNameError) return NextResponse.json({ error: firstNameError }, { status: 400 });
    if (normalizedFirstName.length > 15) return NextResponse.json({ error: 'First name must be 15 characters or fewer.' }, { status: 400 });

    const miError = validateMI(normalizedMi);
    if (miError) return NextResponse.json({ error: miError }, { status: 400 });

    if (!normalizedLastName) return NextResponse.json({ error: 'Last name is required.' }, { status: 400 });
    const lastNameError = validateName(normalizedLastName, { label: 'Last name' });
    if (lastNameError) return NextResponse.json({ error: lastNameError }, { status: 400 });
    if (normalizedLastName.length > 15) return NextResponse.json({ error: 'Last name must be 15 characters or fewer.' }, { status: 400 });
    if (typeof password !== 'string' || password.length < 8 || password.length > 20 || /\s/.test(password)) return NextResponse.json({ error: 'Password must be 8–20 characters with no spaces.' }, { status: 400 });
    const passLower = password.toLowerCase();
    const nameParts = [normalizedFirstName, normalizedLastName].flatMap((part) => part.toLowerCase().split(/[\s.'’_-]+/)).filter((part) => part.length >= 2);
    if (nameParts.some((part) => passLower.includes(part))) return NextResponse.json({ error: 'Password cannot contain any part of your first or last name.' }, { status: 400 });
    if (normalizedUsername && passLower.includes(normalizedUsername)) return NextResponse.json({ error: 'Password cannot contain your username.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 150) return NextResponse.json({ error: 'Enter a valid email address (max 150 characters).' }, { status: 400 });
    const usernameError = validateUsername(normalizedUsername);
    if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });
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
    if (emailRow || authList?.users.some((user) => user.email?.toLowerCase() === normalizedEmail)) return NextResponse.json({ error: 'Email is already in use.' }, { status: 409 });
    return NextResponse.json({ valid: true });
  } catch { return NextResponse.json({ error: 'Unable to validate your details right now.' }, { status: 500 }); }
}
