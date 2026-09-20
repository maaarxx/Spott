import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
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
            category_name
          )
        )
      `)
      .eq('event_id', id)
      .single();

    if (error) {
      const { DEFAULT_EVENTS } = require('@/lib/default-events');
      const fallbackEvent = DEFAULT_EVENTS.find((e: any) => e.id === id) || DEFAULT_EVENTS[0];
      return NextResponse.json(fallbackEvent);
    }

    // Get registration count
    const { count } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', id);

    // Supabase may return organizers/locations as object or array depending on relationship
    const organizer: any = Array.isArray(data.organizers) ? data.organizers[0] : data.organizers;
    const location: any = Array.isArray(data.locations) ? data.locations[0] : data.locations;

    const formattedData = {
      id: data.event_id,
      title: data.title,
      description: data.description,
      date: data.start_datetime,
      endDate: data.end_datetime,
      price: parseFloat(data.price as any) || 0,
      status: data.status,
      organizer: organizer?.organization_name || 'Unknown',
      verified: organizer?.verification_status === 'verified',
      location: location?.venue_name
        ? `${location.venue_name}, ${location.city || ''}`
        : location?.address || 'TBA',
      address: location?.address || '',
      city: location?.city || '',
      latitude: location?.latitude ? parseFloat(location.latitude) : null,
      longitude: location?.longitude ? parseFloat(location.longitude) : null,
      categories: (data.event_category as any[] || []).map((ec: any) => ec.categories?.category_name).filter(Boolean),
      registrations: count || 0,
      confirmedAt: data.is_still_happening_confirmed_at,
    };

    return NextResponse.json(formattedData);
  } catch (err: any) {
    const { DEFAULT_EVENTS } = require('@/lib/default-events');
    const fallbackEvent = DEFAULT_EVENTS[0];
    return NextResponse.json(fallbackEvent);
  }
}
