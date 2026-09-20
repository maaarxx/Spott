import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { title, description, category, date, time, location, price } = body;

    // Use a hardcoded verified organizer for this demo
    const organizer_id = '44444444-4444-4444-4444-444444444444';
    const start_datetime = `${date} ${time}:00`;

    // 1. Insert or find location
    const { data: locationData, error: locError } = await supabase
      .from('locations')
      .insert([{ address: location }])
      .select('location_id')
      .single();

    if (locError) throw locError;

    // 2. Insert event
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

    // 3. Find category ID and link it
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

    return NextResponse.json(eventData);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
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
    let formattedData = (data || []).map((event: any) => ({
      id: event.event_id,
      title: event.title,
      description: event.description,
      date: event.start_datetime,
      endDate: event.end_datetime,
      price: parseFloat(event.price) || 0,
      status: event.status,
      organizer: event.organizers?.organization_name || 'Unknown',
      verified: event.organizers?.verification_status === 'verified',
      location: event.locations?.venue_name
        ? `${event.locations.venue_name}, ${event.locations.city || ''}`
        : event.locations?.address || 'TBA',
      city: event.locations?.city || '',
      latitude: event.locations?.latitude ? parseFloat(event.locations.latitude) : null,
      longitude: event.locations?.longitude ? parseFloat(event.locations.longitude) : null,
      categories: (event.event_category || []).map((ec: any) => ec.categories?.category_name).filter(Boolean),
      registrations: regCounts[event.event_id] || 0,
      confirmedAt: event.is_still_happening_confirmed_at,
    }));

    // Filter by category name on server side (Supabase can't filter nested easily)
    if (category && category !== 'All' && category !== 'All categories') {
      formattedData = formattedData.filter((e: any) =>
        e.categories.some((c: string) => c.toLowerCase().includes(category.toLowerCase()))
      );
    }

    return NextResponse.json(formattedData);
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
  let result = [...DEFAULT_EVENTS];
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(e => e.title.toLowerCase().includes(s) || e.location.toLowerCase().includes(s) || e.city.toLowerCase().includes(s));
  }
  if (category && category !== 'All' && category !== 'All categories') {
    result = result.filter(e => e.categories.some((c: string) => c.toLowerCase() === category.toLowerCase()));
  }
  if (city && city !== 'All' && city !== 'All cities') {
    result = result.filter(e => e.city.toLowerCase() === city.toLowerCase());
  }
  return result;
}
