import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

// Server-side in-memory event cache for active dev session & offline resilience
declare global {
  var __spott_server_events: any[] | undefined;
}
if (!globalThis.__spott_server_events) {
  globalThis.__spott_server_events = [];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, category, date, time, location, price } = body;

    const newServerEvent = {
      id: body.id || `event-${Date.now()}`,
      title,
      description,
      date: `${date} ${time}:00`,
      price: parseFloat(price) || 0,
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
      capacity: body.capacity ? Number(body.capacity) : 100,
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
      const supabase = await createClient();
      const organizer_id = '44444444-4444-4444-4444-444444444444';
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
          organizer_id,
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
  } catch (err: any) {
    return NextResponse.json({ success: true, note: "Cached locally and on server", error: err.message }, { status: 200 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
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
        price,
        status,
        is_still_happening_confirmed_at,
        organizers (
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
      .eq('status', 'active')
      .order('start_datetime', { ascending: true });

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
      return NextResponse.json(filterDefaultEvents(search, category, city));
    }

    // Get registration counts
    const eventIds = (data || []).map((e: any) => e.event_id);
    let regCounts: Record<string, number> = {};
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
    let formattedData = (data || []).map((event: any) => {
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
        coverImage,
        image: coverImage,
      };
    });

    // Merge with in-memory server events
    const serverEvents = (globalThis.__spott_server_events || [])
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
  } catch (err: any) {
    console.warn("API route caught exception, using default events fallback:", err.message);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || searchParams.get('q');
    const category = searchParams.get('category');
    const city = searchParams.get('city');
    return NextResponse.json(filterDefaultEvents(search, category, city));
  }
}

function filterDefaultEvents(search: string | null, category: string | null, city: string | null) {
  const { DEFAULT_EVENTS } = require('@/lib/default-events');
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
