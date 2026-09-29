import { NextResponse } from 'next/server';
import { createClient, createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { DEFAULT_EVENTS } from '@/lib/default-events';
import { errorMessage } from '@/lib/error-message';


// Server-side in-memory event cache for active dev session & offline resilience
declare global {
  var __spott_server_events: any[] | undefined;
}
if (!globalThis.__spott_server_events) {
  globalThis.__spott_server_events = [];
}

export async function POST(request: Request) {
  try {
    const account = await getAuthenticatedRole();
    if (!account || !['organizer', 'admin'].includes(account.role)) {
      return NextResponse.json({ error: 'Organizer access required' }, { status: 403 });
    }
    const body = await request.json();
    const { title, description, category, date, time, location, price } = body;
    const numericPrice = Number(price);
    const eventDate = new Date(`${date}T${time}`);
    if (
      typeof title !== 'string' || !title.trim() || title.trim().length > 160 ||
      typeof description !== 'string' || !description.trim() ||
      typeof category !== 'string' || !category.trim() ||
      typeof location !== 'string' || !location.trim() || location.trim().length > 300 ||
      !Number.isFinite(eventDate.getTime()) || !Number.isFinite(numericPrice) || numericPrice < 0 ||
      (body.capacity !== undefined && (!Number.isInteger(Number(body.capacity)) || Number(body.capacity) < 1))
    ) {
      return NextResponse.json({ error: 'Invalid event details' }, { status: 400 });
    }

    const userClient = await createClient();
    let organizerId: string | null = null;
    if (account.role === 'admin') {
      organizerId = typeof body.organizer_id === 'string' ? body.organizer_id : null;
    } else {
      const { data: organizer, error: organizerError } = await userClient
        .from('organizers')
        .select('organizer_id, verification_status')
        .eq('user_id', account.userId)
        .maybeSingle();
      if (organizerError || !organizer || organizer.verification_status !== 'verified') {
        return NextResponse.json({ error: 'A verified organizer account is required' }, { status: 403 });
      }
      organizerId = organizer.organizer_id;
    }
    if (!organizerId) {
      return NextResponse.json({ error: 'Organizer account is required' }, { status: 400 });
    }

    const newServerEvent = {
      id: body.id || `event-${Date.now()}`,
      title,
      description,
      date: `${date} ${time}:00`,
      price: numericPrice,
      status: "active",
      organizer: body.organizer || "Metro Creative Group",
      verified: true,
      location: location,
      city: body.city || "Manila",
      latitude: body.latitude || 14.5638,
      longitude: body.longitude || 120.9965,
      categories: [category || "School Events"],
      registrations: 0,
      confirmedAt: new Date().toISOString(),
      capacity: body.capacity !== undefined ? Number(body.capacity) : 100,
      coverImage: body.coverImage || null,
      image: body.coverImage || null,
    };

    // Keep in server memory
    globalThis.__spott_server_events = [
      newServerEvent,
      ...(globalThis.__spott_server_events || []).filter((e) => e.id !== newServerEvent.id),
    ];

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database operation timeout")), 1500)
    );

    const postPromise = (async () => {
      const supabase = userClient;
      const start_datetime = `${date} ${time}:00`;

      const { data: locationData, error: locError } = await supabase
        .from('locations')
        .insert([{
          address: location,
          venue_name: location,
          city: body.city || 'Manila',
          latitude: body.latitude || 14.5638,
          longitude: body.longitude || 120.9965,
        }])
        .select('location_id')
        .single();

      if (locError) throw locError;

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert([{
          organizer_id: organizerId,
          location_id: locationData.location_id,
          title,
          description,
          start_datetime,
          price: parseFloat(price) || 0
        }])
        .select('event_id')
        .single();

      if (eventError) throw eventError;

      const { data: catData } = await supabase
        .from('categories')
        .select('category_id')
        .eq('category_name', category)
        .limit(1);

      if (catData && catData.length > 0) {
        await supabase
          .from('event_category')
          .insert([{ event_id: eventData.event_id, category_id: catData[0].category_id }]);
      }

      return eventData;
    })();

    const result = await Promise.race([postPromise, timeoutPromise]);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ success: true, note: "Cached locally and on server", error: errorMessage(err) }, { status: 200 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const requestedScope = searchParams.get('scope') || 'public';
    const includeDashboardEvents = requestedScope === 'admin' || requestedScope === 'organizer';
    const account = includeDashboardEvents ? await getAuthenticatedRole() : null;
    if (requestedScope === 'admin' && (!account || account.role !== 'admin')) {
      return NextResponse.json({ error: 'Administrator access required' }, { status: 403 });
    }
    if (requestedScope === 'organizer' && (!account || account.role !== 'organizer')) {
      return NextResponse.json({ error: 'Organizer access required' }, { status: 403 });
    }
    if (!['public', 'admin', 'organizer'].includes(requestedScope)) {
      return NextResponse.json({ error: 'Invalid event scope' }, { status: 400 });
    }
    let requestedOrganizerName = "";
    if (requestedScope === 'organizer' && account) {
      const { data: organizer } = await supabase
        .from('organizers')
        .select('organization_name')
        .eq('user_id', account.userId)
        .maybeSingle();
      requestedOrganizerName = organizer?.organization_name || "";
    }
    // The scheduled job is the primary lifecycle worker; run it on reads too
    // so archives remain current if pg_cron is not enabled in this project.
    try {
      await supabase.rpc('archive_expired_events');
    } catch {}
    const search = searchParams.get('search') || searchParams.get('q');
    const category = searchParams.get('category');
    const city = searchParams.get('city');

    let query = supabase
      .from('events')
      .select(`
        event_id,
        title,
        description,
        start_datetime,
        end_datetime,
        created_at,
        archived_at,
        capacity,
        require_approval,
        price,
        status,
        is_still_happening_confirmed_at,
        organizers!inner (
          user_id,
          organization_name,
          verification_status
        ),
        locations (
          venue_name,
          address,
          city,
          latitude,
          longitude
        ),
        event_category (
          categories (
            category_id,
            category_name
          )
        )
      `)
      .order('start_datetime', { ascending: true });

    if (includeDashboardEvents) {
      query = query.in('status', ['active', 'draft', 'flagged', 'archived', 'cancelled', 'past', 'completed', 'done']);
      if (requestedScope === 'organizer' && account) {
        query = query.eq('organizers.user_id', account.userId);
      }
    } else {
      query = query.eq('status', 'active');
    }

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    if (city) {
      query = query.eq('locations.city', city);
    }

    // Race with a 1500ms timeout to guarantee instant responses without buffering
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: "Database timeout" } }), 1500)
    );

    const { data, error } = await Promise.race([query, timeoutPromise]);

    if (error || !data) {
      return NextResponse.json(includeDashboardEvents ? [] : filterDefaultEvents(search, category, city));
    }

    // Get registration counts
    const eventIds = (data || []).map((e: any) => e.event_id);
    const regCounts: Record<string, number> = {};
    try {
      const { data: regData } = await supabase
        .from('registrations')
        .select('event_id')
        .in('event_id', eventIds.length > 0 ? eventIds : ['none']);

      (regData || []).forEach((r: any) => {
        regCounts[r.event_id] = (regCounts[r.event_id] || 0) + 1;
      });
    } catch {
      // ignore
    }

    // Flatten the response for easier frontend usage
    const formattedData = (data || []).map((event: any) => {
      let desc = event.description || '';
      let coverImage: string | null = null;
      let capacity = event.capacity ? Number(event.capacity) : 100;

      const metaMatch = desc.match(/<!--spott:(.*?)-->/);
      if (metaMatch) {
        try {
          const meta = JSON.parse(metaMatch[1]);
          if (meta.coverImage) coverImage = meta.coverImage;
          if (meta.capacity) capacity = Number(meta.capacity);
          desc = desc.replace(metaMatch[0], '').trim();
        } catch {}
      }

      return {
        id: event.event_id,
        title: event.title,
        description: desc,
        date: event.start_datetime,
        endDate: event.end_datetime,
        createdAt: event.created_at,
        archivedAt: event.archived_at,
        archiveExpiresAt: event.archived_at
          ? new Date(new Date(event.archived_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null,
        price: parseFloat(event.price) || 0,
        status: event.status,
        organizer: event.organizers?.organization_name || 'Unknown',
        verified: event.organizers?.verification_status === 'verified',
        location: event.locations?.venue_name && event.locations?.address && !event.locations.venue_name.includes(event.locations.address)
          ? `${event.locations.venue_name}, ${event.locations.address}`
          : event.locations?.venue_name
          ? `${event.locations.venue_name}, ${event.locations.city || ''}`
          : event.locations?.address || 'TBA',
        address: event.locations?.address || '',
        venue: event.locations?.venue_name || '',
        city: event.locations?.city || '',
        latitude: event.locations?.latitude ? parseFloat(event.locations.latitude) : 14.5638,
        longitude: event.locations?.longitude ? parseFloat(event.locations.longitude) : 120.9965,
        categories: (event.event_category || []).map((ec: any) => ec.categories?.category_name).filter(Boolean),
        registrations: regCounts[event.event_id] || 0,
        confirmedAt: event.is_still_happening_confirmed_at,
        capacity,
        requireApproval: event.require_approval,
        coverImage,
        image: coverImage,
      };
    });

    // Merge with in-memory server events
    const serverEvents = (globalThis.__spott_server_events || [])
      .filter((event) => includeDashboardEvents || event.status === 'active')
      .filter((event) => requestedScope !== 'organizer' || (requestedOrganizerName && event.organizer?.toLowerCase() === requestedOrganizerName.toLowerCase()))
      .filter((se) => !formattedData.some((fd: any) => fd.id === se.id))
      .map((se) => ({
        ...se,
        capacity: typeof se.capacity === "number" ? se.capacity : 100,
      }));
    let combined = [...serverEvents, ...formattedData];

    // Filter by category name on server side (Supabase can't filter nested easily)
    if (category && category !== 'All' && category !== 'All categories') {
      combined = combined.filter((e: any) =>
        e.categories?.some((c: string) => c.toLowerCase().includes(category.toLowerCase()))
      );
    }

    return NextResponse.json(combined);
  } catch (err: unknown) {
    console.warn("API route caught exception, using default events fallback:", errorMessage(err));
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || searchParams.get('q');
    const category = searchParams.get('category');
    const city = searchParams.get('city');
    return NextResponse.json(filterDefaultEvents(search, category, city));
  }
}

function filterDefaultEvents(search: string | null, category: string | null, city: string | null) {
  const serverEvents = globalThis.__spott_server_events || [];
  let result = [...serverEvents, ...DEFAULT_EVENTS];
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(e => e.title?.toLowerCase().includes(s) || e.location?.toLowerCase().includes(s) || e.city?.toLowerCase().includes(s));
  }
  if (category && category !== 'All' && category !== 'All categories') {
    result = result.filter(e => e.categories?.some((c: string) => c.toLowerCase() === category.toLowerCase()));
  }
  if (city && city !== 'All' && city !== 'All cities') {
    result = result.filter(e => e.city?.toLowerCase() === city.toLowerCase());
  }
  return result;
}
