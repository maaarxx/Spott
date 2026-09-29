import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { errorMessage } from '@/lib/error-message';

// Server-side in-memory cache to support 24-hr dedupe resilience and fast stats
interface StoredViewRecord {
  id: string;
  listing_id: string;
  visitor_id: string;
  viewed_at: number; // timestamp ms
}

declare global {
  var __spott_server_views: StoredViewRecord[] | undefined;
}

if (!globalThis.__spott_server_views) {
  globalThis.__spott_server_views = [];
}

const BOT_PATTERNS =
  /bot|spider|crawl|slurp|googlebot|bingbot|yandex|baiduspider|duckduckbot|facebookexternalhit|whatsapp|twitterbot|pinterest|discordbot|slackbot|curl|wget|python|postman|insomnia|headless/i;

function isBotUserAgent(ua: string | null): boolean {
  if (!ua) return true; // Missing user-agent is typical of automated scripts
  return BOT_PATTERNS.test(ua);
}

export async function POST(request: Request) {
  try {
    const userAgent = request.headers.get('user-agent');
    if (isBotUserAgent(userAgent)) {
      return NextResponse.json(
        { counted: false, reason: 'bot_detected' },
        { status: 200 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      listing_id,
    } = body;

    if (!listing_id) {
      return NextResponse.json(
        { error: 'listing_id is required' },
        { status: 400 }
      );
    }

    // 1. Visitor identification
    // Use user_id if authenticated; otherwise fallback to visitor_id passed or cookie
    const cookiesHeader = request.headers.get('cookie') || '';
    const cookieMatch = cookiesHeader.match(/spott_visitor_id=([^;]+)/);
    const cookieVisitorId = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

    const account = await getAuthenticatedRole();
    const effectiveVisitorId = account?.userId || cookieVisitorId || 'anon-visitor';

    // 2. Listing Owner Exclusion
    // Fetch event owner to verify
    let listingOwnerId = '';

    const supabase = createAdminClient();
    try {
      const { data: eventData } = await supabase
        .from('events')
        .select(`
          event_id,
          organizer_id,
          organizers (user_id)
        `)
        .eq('event_id', listing_id)
        .maybeSingle();

      if (eventData) {
        listingOwnerId = eventData.organizer_id || '';
        const org = Array.isArray(eventData.organizers) ? eventData.organizers[0] : eventData.organizers;
        listingOwnerId = org?.user_id || '';
      }
    } catch {}

    // Check if the visitor is the owner
    if (account?.userId && listingOwnerId && account.userId === listingOwnerId) {
      return NextResponse.json(
        { counted: false, reason: 'owner_view_excluded' },
        { status: 200 }
      );
    }

    // 3. Server-side 24-hour deduplication
    const twentyFourHoursAgoMs = Date.now() - 24 * 60 * 60 * 1000;
    const twentyFourHoursAgoIso = new Date(twentyFourHoursAgoMs).toISOString();

    // Check in-memory store first
    const memoryRecord = globalThis.__spott_server_views?.find(
      (v) =>
        v.listing_id === listing_id &&
        v.visitor_id === effectiveVisitorId &&
        v.viewed_at >= twentyFourHoursAgoMs
    );

    if (memoryRecord) {
      return NextResponse.json(
        {
          counted: false,
          reason: 'already_viewed_within_24h',
          last_viewed_at: new Date(memoryRecord.viewed_at).toISOString(),
        },
        { status: 200 }
      );
    }

    // Check Supabase listing_views table
    let dbAlreadyViewed = false;
    try {
      const { data: recentViews, error } = await supabase
        .from('listing_views')
        .select('id, viewed_at')
        .eq('listing_id', listing_id)
        .eq('visitor_id', effectiveVisitorId)
        .gte('viewed_at', twentyFourHoursAgoIso)
        .order('viewed_at', { ascending: false })
        .limit(1);

      if (!error && recentViews && recentViews.length > 0) {
        dbAlreadyViewed = true;
      }
    } catch {}

    if (dbAlreadyViewed) {
      return NextResponse.json(
        {
          counted: false,
          reason: 'already_viewed_within_24h',
        },
        { status: 200 }
      );
    }

    // 4. Record new view
    const nowIso = new Date().toISOString();
    const newViewRecord: StoredViewRecord = {
      id: `view-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      listing_id,
      visitor_id: effectiveVisitorId,
      viewed_at: Date.now(),
    };

    // Save in memory
    globalThis.__spott_server_views = [
      newViewRecord,
      ...(globalThis.__spott_server_views || []).slice(0, 5000), // retain last 5000
    ];

    // Persist to Supabase listing_views if table exists
    try {
      await supabase.from('listing_views').insert([
        {
          listing_id,
          visitor_id: effectiveVisitorId,
          viewed_at: nowIso,
        },
      ]);
    } catch {}

    return NextResponse.json(
      {
        counted: true,
        message: 'view_recorded',
        listing_id,
        visitor_id: effectiveVisitorId,
        viewed_at: nowIso,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const account = await getAuthenticatedRole();
    if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const listingIdParam = searchParams.get('listing_id');
    const listingIdsParam = searchParams.get('listing_ids');

    const targetListingIds = new Set<string>();
    if (listingIdParam) {
      targetListingIds.add(listingIdParam);
    }
    if (listingIdsParam) {
      listingIdsParam.split(',').forEach((id) => targetListingIds.add(id.trim()));
    }

    const supabase = createAdminClient();
    let allowedListingIds = targetListingIds;
    if (account.role === 'organizer') {
      const { data: ownedEvents, error: ownershipError } = await supabase
        .from('events')
        .select('event_id, organizers!inner(user_id)')
        .eq('organizers.user_id', account.userId);
      if (ownershipError) return NextResponse.json({ error: 'Unable to verify event ownership' }, { status: 500 });
      const ownedIds = new Set((ownedEvents || []).map((event) => event.event_id));
      if (Array.from(targetListingIds).some((id) => !ownedIds.has(id))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      allowedListingIds = targetListingIds.size > 0 ? targetListingIds : ownedIds;
    } else if (account.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const viewsMap: Record<string, number> = {};
    const uniqueVisitorsMap: Record<string, Set<string>> = {};

    // 1. Check database views
    try {
      let query = supabase
        .from('listing_views')
        .select('listing_id, visitor_id');

      if (account.role === 'organizer' || allowedListingIds.size > 0) {
        query = query.in('listing_id', Array.from(allowedListingIds));
      }

      const { data: dbViews, error } = await query;
      if (!error && Array.isArray(dbViews)) {
        dbViews.forEach((row: { listing_id: string; visitor_id?: string | null }) => {
          viewsMap[row.listing_id] = (viewsMap[row.listing_id] || 0) + 1;
          if (!uniqueVisitorsMap[row.listing_id]) {
            uniqueVisitorsMap[row.listing_id] = new Set();
          }
          if (row.visitor_id) uniqueVisitorsMap[row.listing_id].add(row.visitor_id);
        });
      }
    } catch {}

    // 2. Merge in-memory server views
    (globalThis.__spott_server_views || []).forEach((row) => {
      if (account.role === 'admin' && allowedListingIds.size === 0 || allowedListingIds.has(row.listing_id)) {
        viewsMap[row.listing_id] = (viewsMap[row.listing_id] || 0) + 1;
        if (!uniqueVisitorsMap[row.listing_id]) {
          uniqueVisitorsMap[row.listing_id] = new Set();
        }
        uniqueVisitorsMap[row.listing_id].add(row.visitor_id);
      }
    });

    // 3. Format response
    const uniqueViewsMap: Record<string, number> = {};
    let totalViews = 0;
    const allUniqueVisitors = new Set<string>();

    Object.keys(viewsMap).forEach((id) => {
      totalViews += viewsMap[id];
      const count = uniqueVisitorsMap[id]?.size || 0;
      uniqueViewsMap[id] = count;
      uniqueVisitorsMap[id]?.forEach((v) => allUniqueVisitors.add(v));
    });

    return NextResponse.json({
      viewsMap,
      uniqueViewsMap,
      totalViews,
      uniqueViews: allUniqueVisitors.size,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: errorMessage(error, 'Failed to fetch views') },
      { status: 500 }
    );
  }
}
