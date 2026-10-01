import { NextResponse } from 'next/server';
import { createClient, createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { errorMessage } from '@/lib/error-message';
import { writeAuditEntry } from '@/lib/audit-log-server';
import type { EventData } from '@/components/EventCard';

type DbRelation<T> = T | T[] | null;
type EventListRow = {
  event_id: string;
  title: string;
  description: string | null;
  start_datetime: string;
  end_datetime: string | null;
  created_at: string;
  archived_at: string | null;
  capacity: number | null;
  require_approval: boolean | null;
  price: number | string | null;
  status: string;
  is_still_happening_confirmed_at: string | null;
  organizers?: DbRelation<{ organization_name?: string | null; verification_status?: string | null }>;
  locations?: DbRelation<{ venue_name?: string | null; address?: string | null; city?: string | null; latitude?: number | string | null; longitude?: number | string | null }>;
  event_category?: Array<{ categories?: DbRelation<{ category_name?: string | null }> }>;
};


export async function POST(request: Request) {
  try {
    const account = await getAuthenticatedRole(request);
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
      (body.capacity !== undefined && body.capacity !== null && (!Number.isInteger(Number(body.capacity)) || Number(body.capacity) < 1))
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

    const db = createAdminClient();
    let locationId: string | null = null;
    let eventId: string | null = null;
    try {
      const { data: locationData, error: locError } = await db
        .from('locations')
        .insert({
          address: location,
          venue_name: location,
          city: typeof body.city === 'string' && body.city.trim() ? body.city.trim() : 'Manila',
          latitude: Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : 14.5638,
          longitude: Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : 120.9965,
        })
        .select('location_id')
        .single();
      if (locError || !locationData) throw locError || new Error('Unable to save event location');
      locationId = locationData.location_id;

      const descriptionWithMetadata = [
        description.trim(),
        `<!--spott:${JSON.stringify({
          coverImage: typeof body.coverImage === 'string' ? body.coverImage : null,
        })}-->`,
      ].join('\n\n');
      const eventStatus = ['active', 'draft', 'flagged'].includes(body.status) ? body.status : 'active';
      const { data: eventData, error: eventError } = await db
        .from('events')
        .insert({
          organizer_id: organizerId,
          location_id: locationId,
          title: title.trim(),
          description: descriptionWithMetadata,
          start_datetime: `${date} ${time}:00`,
          price: numericPrice,
          capacity: body.capacity === undefined ? null : Number(body.capacity),
          require_approval: body.requireApproval === true,
          status: eventStatus,
        })
        .select('event_id')
        .single();
      if (eventError || !eventData) throw eventError || new Error('Unable to save event');
      eventId = eventData.event_id;

      const { data: categoryData, error: categoryLookupError } = await db
        .from('categories')
        .select('category_id')
        .eq('category_name', category.trim())
        .maybeSingle();
      if (categoryLookupError) throw categoryLookupError;

      let categoryId = categoryData?.category_id;
      if (!categoryId) {
        const { data: insertedCategory, error: insertCategoryError } = await db
          .from('categories')
          .insert({ category_name: category.trim() })
          .select('category_id')
          .single();
        if (insertCategoryError || !insertedCategory) throw insertCategoryError || new Error('Unable to save event category');
        categoryId = insertedCategory.category_id;
      }

      const { error: relationError } = await db
        .from('event_category')
        .insert({ event_id: eventData.event_id, category_id: categoryId });
      if (relationError) throw relationError;

      const { data: recipients } = eventStatus === 'active'
        ? await db.from('users').select('user_id,role').in('role', ['user', 'organizer'])
        : { data: [] };
      if (recipients?.length) {
        await db.from('notifications').insert(recipients.map((recipient) => ({
          user_id: recipient.user_id,
          type: 'announcement',
          title: `New Event: "${title.trim()}"`,
          message: `${title.trim()} is now listed on Spott.`,
          is_read: false,
          related_event_id: eventData.event_id,
          target_role: recipient.role,
          link: `/events/${eventData.event_id}`,
        })));
      }
      if (eventStatus === 'flagged' || Number(body.capacity) >= 200) {
        const { data: admins } = await db.from('users').select('user_id').eq('role', 'admin');
        if (admins?.length) {
          const titleText = eventStatus === 'flagged' ? `Listing Review: "${title.trim()}"` : `Capacity Review: "${title.trim()}"`;
          await db.from('notifications').insert(admins.map((admin) => ({
            user_id: admin.user_id,
            type: 'announcement',
            title: titleText,
            message: eventStatus === 'flagged' ? 'This event listing was flagged and needs review.' : `This event has a capacity of ${body.capacity} attendees and needs a venue safety review.`,
            is_read: false,
            related_event_id: eventData.event_id,
            target_role: 'admin',
            link: `/admin?tab=events`,
          })));
        }
      }

      await writeAuditEntry(account, {
        action: 'event.created',
        targetType: 'event',
        targetId: eventData.event_id,
        summary: `Created event “${title.trim()}”.`,
        details: { status: eventStatus, capacity: body.capacity ?? null },
      });

      return NextResponse.json({ success: true, event_id: eventData.event_id }, { status: 201 });
    } catch (writeError) {
      // Roll back the rows we created if a later write fails.
      if (eventId) {
        await db.from('event_category').delete().eq('event_id', eventId);
        await db.from('events').delete().eq('event_id', eventId);
      }
      if (locationId) await db.from('locations').delete().eq('location_id', locationId);
      throw writeError;
    }
  } catch (err: unknown) {
    console.error('Failed to create event in Supabase', errorMessage(err));
    return NextResponse.json({ error: 'Could not save the event. Please try again.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const requestedScope = searchParams.get('scope') || 'public';
    const includeDashboardEvents = requestedScope === 'admin' || requestedScope === 'organizer';
    const account = includeDashboardEvents ? await getAuthenticatedRole(request) : null;
    if (requestedScope === 'admin' && !account) {
      return NextResponse.json({ error: 'No Supabase session or account profile was found. Sign in again with your production account.', code: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
    }
    if (requestedScope === 'admin' && account?.role !== 'admin') {
      return NextResponse.json({ error: 'Your signed-in account does not have the admin role.', code: 'ADMIN_ROLE_REQUIRED' }, { status: 403 });
    }
    if (requestedScope === 'organizer' && (!account || account.role !== 'organizer')) {
      return NextResponse.json({ error: 'Organizer access required' }, { status: 403 });
    }
    if (!['public', 'admin', 'organizer'].includes(requestedScope)) {
      return NextResponse.json({ error: 'Invalid event scope' }, { status: 400 });
    }
    // Event lifecycle is handled by the scheduled archive job. Keep public
    // reads side-effect free so every page load does not also run a write RPC.
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

    const { data, error } = await query;

    if (error || !data) {
      // Don't silently turn database failures into an empty public feed. This
      // keeps the response safe while making the underlying failure visible
      // in the Vercel function logs for diagnosis.
      const databaseError = error && "code" in error ? error : null;
      console.error("Failed to load public events from Supabase", {
        code: databaseError?.code,
        message: error?.message || (!data ? "Database returned no event data" : undefined),
        hint: databaseError?.hint,
      });
      return NextResponse.json({ error: 'Could not load events from the database.' }, { status: 503 });
    }

    // Ask Postgres to aggregate RSVP counts instead of transferring every RSVP
    // row to the server just to count it in JavaScript.
    const dataRows = (data || []) as unknown as EventListRow[];
    const eventIds = dataRows.map((event) => event.event_id);
    const regCounts: Record<string, number> = {};
    const pendingRegCounts: Record<string, number> = {};
    if (eventIds.length > 0) {
      const [confirmedResult, pendingResult] = await Promise.all([
        supabase.rpc('get_event_registration_counts', { p_event_ids: eventIds }),
        supabase.rpc('get_event_pending_registration_counts', { p_event_ids: eventIds }),
      ]);
      const counts = confirmedResult.data;
      const countError = confirmedResult.error || pendingResult.error;

      if (!countError && counts && pendingResult.data) {
        (counts as Array<{ event_id: string; registration_count: number | string }>).forEach((row) => {
          regCounts[row.event_id] = Number(row.registration_count) || 0;
        });
        (pendingResult.data as Array<{ event_id: string; pending_registration_count: number | string }>).forEach((row) => {
          pendingRegCounts[row.event_id] = Number(row.pending_registration_count) || 0;
        });
      } else {
        // Keep compatibility until the accompanying migration has been pushed.
        console.warn('Registration count RPC unavailable; using compatibility query.', countError?.message);
        const { data: regData } = await supabase
          .from('registrations')
          .select('event_id,status,attendees_count')
          .in('event_id', eventIds)
          .in('status', ['confirmed', 'registered', 'approved', 'pending', 'pending verification']);

        (regData || []).forEach((registration: { event_id: string; status: string; attendees_count?: number | null }) => {
          const attendeeCount = Math.max(1, Number(registration.attendees_count) || 1);
          const isPending = ['pending', 'pending verification'].includes(registration.status.toLowerCase());
          const targetCounts = isPending ? pendingRegCounts : regCounts;
          targetCounts[registration.event_id] = (targetCounts[registration.event_id] || 0) + attendeeCount;
        });
      }
    }

    // Flatten the response for easier frontend usage
    const formattedData = dataRows.map((event) => {
      const organizer = Array.isArray(event.organizers) ? event.organizers[0] : event.organizers;
      const location = Array.isArray(event.locations) ? event.locations[0] : event.locations;
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
        price: Number(event.price) || 0,
        status: event.status,
        organizer: organizer?.organization_name || 'Unknown',
        verified: organizer?.verification_status === 'verified',
        location: location?.venue_name && location?.address && !location.venue_name.includes(location.address)
          ? `${location.venue_name}, ${location.address}`
          : location?.venue_name
          ? `${location.venue_name}, ${location.city || ''}`
          : location?.address || 'TBA',
        address: location?.address || '',
        venue: location?.venue_name || '',
        city: location?.city || '',
        latitude: location?.latitude ? Number(location.latitude) : 14.5638,
        longitude: location?.longitude ? Number(location.longitude) : 120.9965,
        categories: (event.event_category || []).map((entry) => {
          const category = Array.isArray(entry.categories) ? entry.categories[0] : entry.categories;
          return category?.category_name;
        }).filter((name): name is string => Boolean(name)),
        registrations: regCounts[event.event_id] || 0,
        pendingRegistrations: pendingRegCounts[event.event_id] || 0,
        confirmedAt: event.is_still_happening_confirmed_at,
        capacity,
        requireApproval: event.require_approval,
        coverImage,
        image: coverImage,
      };
    });

    let combined = formattedData;

    // Filter by category name on server side (Supabase can't filter nested easily)
    if (category && category !== 'All' && category !== 'All categories') {
      combined = combined.filter((e: EventData) =>
        e.categories?.some((c: string) => c.toLowerCase().includes(category.toLowerCase()))
      );
    }

    return NextResponse.json(combined);
  } catch (err: unknown) {
    console.error("Event query failed:", errorMessage(err));
    return NextResponse.json({ error: 'Could not load events from the database.' }, { status: 503 });
  }
}
