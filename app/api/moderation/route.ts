import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (!account) return NextResponse.json({ error: 'Sign in to load moderation settings.' }, { status: 401 });
  const db = createAdminClient();
  const [{ data: settings, error: settingsError }, { data: keywordRows, error: keywordsError }] = await Promise.all([
    db.from('moderation_settings').select('capacity_threshold,sensitivity,auto_flag_large_events,legacy_imported').eq('id', 1).single(),
    db.from('moderation_keywords').select('keyword').eq('active', true).order('keyword'),
  ]);
  if (settingsError || keywordsError) return NextResponse.json({ error: 'Unable to load moderation settings.' }, { status: 500 });
  return NextResponse.json({
    settings: {
      capacityThreshold: settings.capacity_threshold,
      sensitivity: settings.sensitivity,
      autoFlagLargeEvents: settings.auto_flag_large_events,
    },
    keywords: (keywordRows || []).map((row) => row.keyword),
    legacyImported: settings.legacy_imported,
  });
}

export async function PATCH(request: Request) {
  const account = await getAuthenticatedRole(request);
  if (account?.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: account ? 403 : 401 });
  const body = await request.json().catch(() => null);
  if (!body || (body.keywords === undefined && body.settings === undefined)) {
    return NextResponse.json({ error: 'Provide moderation keywords or settings.' }, { status: 400 });
  }

  const db = createAdminClient();
  let shouldApplyLegacy = false;
  if (body.legacyImport === true) {
    const { data: current, error } = await db.from('moderation_settings').select('legacy_imported').eq('id', 1).single();
    if (error) return NextResponse.json({ error: 'Unable to check legacy moderation settings.' }, { status: 500 });
    shouldApplyLegacy = !current.legacy_imported;
  }
  const shouldUpdateKeywords = body.keywords !== undefined && (body.legacyImport !== true || shouldApplyLegacy);
  const shouldUpdateSettings = body.settings !== undefined && (body.legacyImport !== true || shouldApplyLegacy);
  if (shouldUpdateKeywords) {
    if (!Array.isArray(body.keywords) || body.keywords.length > 200 || body.keywords.some((value: unknown) => typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 100)) {
      return NextResponse.json({ error: 'Keywords must be text values no longer than 100 characters.' }, { status: 400 });
    }
    const keywords = [...new Set((body.keywords as string[]).map((keyword) => keyword.trim().toLowerCase()))];
    const { error: deactivateError } = await db.from('moderation_keywords').update({ active: false }).eq('active', true);
    if (deactivateError) return NextResponse.json({ error: 'Unable to update moderation keywords.' }, { status: 500 });
    if (keywords.length) {
      const { error: upsertError } = await db.from('moderation_keywords').upsert(keywords.map((keyword) => ({ keyword, active: true })), { onConflict: 'keyword' });
      if (upsertError) return NextResponse.json({ error: 'Unable to update moderation keywords.' }, { status: 500 });
    }
  }

  if (shouldUpdateSettings) {
    const settings = body.settings;
    if (!settings || !Number.isInteger(settings.capacityThreshold) || settings.capacityThreshold < 10 || settings.capacityThreshold > 100000 || !['Strict', 'Standard'].includes(settings.sensitivity) || typeof settings.autoFlagLargeEvents !== 'boolean') {
      return NextResponse.json({ error: 'Invalid moderation settings.' }, { status: 400 });
    }
    const { error } = await db.from('moderation_settings').upsert({
      id: 1,
      capacity_threshold: settings.capacityThreshold,
      sensitivity: settings.sensitivity,
      auto_flag_large_events: settings.autoFlagLargeEvents,
      legacy_imported: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) return NextResponse.json({ error: 'Unable to save moderation settings.' }, { status: 500 });
  } else {
    const { error } = await db.from('moderation_settings').update({ legacy_imported: true, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return NextResponse.json({ error: 'Unable to update moderation settings.' }, { status: 500 });
  }

  const [{ data: savedSettings, error: settingsError }, { data: keywordRows, error: keywordsError }] = await Promise.all([
    db.from('moderation_settings').select('capacity_threshold,sensitivity,auto_flag_large_events,legacy_imported').eq('id', 1).single(),
    db.from('moderation_keywords').select('keyword').eq('active', true).order('keyword'),
  ]);
  if (settingsError || keywordsError) return NextResponse.json({ error: 'Changes saved, but refreshed settings could not be loaded.' }, { status: 500 });
  return NextResponse.json({
    settings: {
      capacityThreshold: savedSettings.capacity_threshold,
      sensitivity: savedSettings.sensitivity,
      autoFlagLargeEvents: savedSettings.auto_flag_large_events,
    },
    keywords: (keywordRows || []).map((row) => row.keyword),
    legacyImported: savedSettings.legacy_imported,
  });
}
