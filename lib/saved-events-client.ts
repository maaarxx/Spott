"use client";

import { fetchWithSupabaseSession } from '@/lib/audit-log-client';

export async function loadSavedEventIds(): Promise<string[]> {
  const response = await fetchWithSupabaseSession('/api/saved-events');
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Unable to load saved events.');
  return Array.isArray(body.eventIds) ? body.eventIds.map(String) : [];
}

export async function toggleSavedEvent(eventId: string): Promise<boolean> {
  const response = await fetchWithSupabaseSession(`/api/events/${encodeURIComponent(eventId)}/save`, { method: 'POST' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.saved !== 'boolean') {
    throw new Error(body.message || 'Unable to update saved event.');
  }
  import('@/lib/fetch-dedupe').then(m => m.invalidateCache('/api/saved-events'));
  window.dispatchEvent(new Event('spott_saved_updated'));
  return body.saved;
}
