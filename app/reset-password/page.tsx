"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { setCurrentUser, type SpottAccount } from '@/lib/auth-store';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password.length < 6 || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Use at least 6 characters, including a number and a symbol.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      const { fetchWithDedupe } = await import('@/lib/fetch-dedupe');
      const response = await fetchWithDedupe('/api/account');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load your account.');
      const role = result.account.role as SpottAccount['role'];
      const account: SpottAccount = {
        email: result.account.email,
        name: result.account.name,
        role,
        destination: role === 'admin' ? '/admin' : role === 'organizer' ? '/organizer' : '/',
      };
      if (role === 'organizer' && result.account.organizerStatus !== 'approved') {
        await supabase.auth.signOut();
        setError('Your organizer account still needs admin approval.');
        setSaving(false);
        return;
      }
      setCurrentUser(account);
      router.replace(account.destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to set your password. Reopen the invitation link and try again.');
      setSaving(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-72px)] bg-[#faf8f3] px-4 py-12 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-[#e6e1d8] bg-white p-7 shadow-sm space-y-5">
        <div>
          <h1 className="text-2xl font-black text-[#171717]">Set your password</h1>
          <p className="mt-2 text-sm text-[#666666]">Choose a new password to finish setting up your Spott account.</p>
        </div>
        <label className="block text-xs font-bold text-[#555555]">NEW PASSWORD
          <input required type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-[#e6e1d8] px-4 py-3 text-sm" />
        </label>
        <label className="block text-xs font-bold text-[#555555]">CONFIRM PASSWORD
          <input required type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 w-full rounded-xl border border-[#e6e1d8] px-4 py-3 text-sm" />
        </label>
        <p className="text-xs text-[#777777]">At least 6 characters, with a number and a symbol.</p>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <button disabled={saving} className="w-full rounded-xl bg-[#171717] px-4 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save password and continue'}</button>
      </form>
    </main>
  );
}
