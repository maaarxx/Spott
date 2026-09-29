import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { DEFAULT_EVENTS } from '@/lib/default-events';

// Server-side in-memory event cache
declare global {
  var __spott_server_events: any[] | undefined;
}
if (!globalThis.__spott_server_events) {
  globalThis.__spott_server_events = [];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let id = '';
  try {
    const resolved = await params;
    id = resolved.id;
    // Match the public discovery API's service-backed reads; anon RLS can hide
    // active listings and make cards link to a false 404.
    const supabase = createAdminClient();

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
      .in('status', ['active', 'cancelled'])
      .single();

    if (error) {
      // Check in-memory server events
      const serverEvent = globalThis.__spott_server_events?.find((e) => e.id === id);
      if (serverEvent?.status === 'active') return NextResponse.json(serverEvent);

      const fallbackEvent = (DEFAULT_EVENTS || []).find((e: any) => e.id === id);
      if (fallbackEvent) {
        return NextResponse.json(fallbackEvent);
      }
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get registration count
    const { count } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', id);

    const organizer: any = Array.isArray(data.organizers) ? data.organizers[0] : data.organizers;
    const location: any = Array.isArray(data.locations) ? data.locations[0] : data.locations;

    let desc = data.description || '';
    let coverImage: string | null = null;
    let capacity = (data as any).capacity ? Number((data as any).capacity) : 100;

    const metaMatch = desc.match(/<!--spott:(.*?)-->/);
    if (metaMatch) {
      try {
        const meta = JSON.parse(metaMatch[1]);
        if (meta.coverImage) coverImage = meta.coverImage;
        if (meta.capacity) capacity = Number(meta.capacity);
        desc = desc.replace(metaMatch[0], '').trim();
      } catch {}
    }

    const formattedData = {
      id: data.event_id,
      title: data.title,
      description: desc,
      date: data.start_datetime,
      endDate: data.end_datetime,
      price: parseFloat(data.price as any) || 0,
      status: data.status,
      cancelled_at: null,
      cancel_reason: null,
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
      capacity,
      coverImage,
      image: coverImage,
    };

    return NextResponse.json(formattedData);
  } catch {
    const fallbackEvent = (DEFAULT_EVENTS || []).find((e: any) => e.id === id);
    if (fallbackEvent) {
      return NextResponse.json(fallbackEvent);
    }
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const account = await getAuthenticatedRole();
    if (!account || !['organizer', 'admin'].includes(account.role)) {
      return NextResponse.json({ error: 'Organizer access required' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    if (
      (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160)) ||
      (body.location !== undefined && (typeof body.location !== 'string' || !body.location.trim() || body.location.length > 300)) ||
      (body.date !== undefined && !Number.isFinite(new Date(body.date).getTime())) ||
      (body.price !== undefined && (!Number.isFinite(Number(body.price)) || Number(body.price) < 0)) ||
      (body.status !== undefined && !['active', 'draft', 'cancelled'].includes(body.status))
    ) {
      return NextResponse.json({ error: 'Invalid event update' }, { status: 400 });
    }
    const supabase = createAdminClient();

    if (account.role !== 'admin') {
      const { data: ownership } = await supabase
        .from('events')
        .select('organizer_id, organizers!inner(user_id)')
        .eq('event_id', id)
        .maybeSingle();
      const organizer = Array.isArray(ownership?.organizers) ? ownership.organizers[0] : ownership?.organizers;
      if (!ownership || organizer?.user_id !== account.userId) {
        return NextResponse.json({ error: 'You do not own this event' }, { status: 403 });
      }
    }

    // 1. Load existing event to compare fields
    let existingEvent: any = globalThis.__spott_server_events?.find((e) => e.id === id);
    if (!existingEvent) {
      try {
        const { data } = await supabase
          .from('events')
          .select(`
            event_id,
            title,
            start_datetime,
            price,
            status,
            locations (venue_name, address)
          `)
          .eq('event_id', id)
          .maybeSingle();

        if (data) {
          const loc: any = Array.isArray(data.locations) ? data.locations[0] : data.locations;
          existingEvent = {
            id: data.event_id,
            title: data.title,
            date: data.start_datetime,
            price: data.price,
            status: data.status,
            location: loc?.venue_name || loc?.address || '',
          };
        }
      } catch {}
    }

    if (!existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const currentTitle = existingEvent?.title || body.title || 'Event';
    const currentDate = existingEvent?.date || body.date || '';

    // =========================================================================
    // CASE A: CANCEL EVENT ACTION
    // =========================================================================
    if (body.action === 'cancel' || body.status === 'cancelled') {
      const cancelReason = body.cancel_reason || body.reason || 'Event cancelled by organizer.';
      if (typeof cancelReason !== 'string' || cancelReason.trim().length > 1000) {
        return NextResponse.json({ error: 'Cancellation reason must be 1,000 characters or fewer' }, { status: 400 });
      }
      const nowIso = new Date().toISOString();

      // Update in Supabase
      try {
        await supabase
          .from('events')
          .update({
            status: 'cancelled',
            cancelled_at: nowIso,
            cancel_reason: cancelReason,
          })
          .eq('event_id', id);
      } catch {}

      // Update in-memory server cache
      if (globalThis.__spott_server_events) {
        globalThis.__spott_server_events = globalThis.__spott_server_events.map((e) =>
          e.id === id
            ? { ...e, status: 'cancelled', cancelled_at: nowIso, cancel_reason: cancelReason }
            : e
        );
      }

      // Fetch all attendees who RSVPed to this event
      const notifMessage = `The event "${currentTitle}" scheduled for ${currentDate} has been cancelled by the organizer. Reason: ${cancelReason}`;

      try {
        const { data: attendees } = await supabase
          .from('registrations')
          .select('user_id')
          .eq('event_id', id);

        if (attendees && attendees.length > 0) {
          const notifs = (attendees as any[]).map((att: any) => ({
            user_id: att.user_id,
            type: 'cancellation',
            title: `Event Cancelled: "${currentTitle}"`,
            message: notifMessage,
            related_event_id: id,
            is_read: false,
          }));
          await supabase.from('notifications').insert(notifs);
        }
      } catch {}

      return NextResponse.json({
        success: true,
        status: 'cancelled',
        message: 'Event cancelled and attendees notified.',
        notification: {
          type: 'cancellation',
          title: `Event Cancelled: "${currentTitle}"`,
          message: notifMessage,
          link: `/events/${id}`,
        },
      });
    }

    // =========================================================================
    // CASE B: UPDATE EVENT DETAILS & EMIT NOTIFICATIONS
    // =========================================================================
    const changes: string[] = [];

    const newTitle = body.title !== undefined ? body.title : existingEvent?.title;
    const newDate = body.date !== undefined ? body.date : existingEvent?.date;
    const newLocation = body.location !== undefined ? body.location : existingEvent?.location;
    const newPrice = body.price !== undefined ? parseFloat(body.price) : existingEvent?.price;

    if (existingEvent) {
      if (body.title && body.title.trim() !== existingEvent.title?.trim()) {
        changes.push(`Title: "${existingEvent.title}" -> "${body.title}"`);
      }
      if (body.date && body.date !== existingEvent.date) {
        changes.push(`Date/Time: ${existingEvent.date} -> ${body.date}`);
      }
      if (body.location && body.location.trim() !== existingEvent.location?.trim()) {
        changes.push(`Venue: ${existingEvent.location} -> ${body.location}`);
      }
      if (body.price !== undefined && parseFloat(body.price) !== parseFloat(existingEvent.price || 0)) {
        changes.push(`Price: ₱${existingEvent.price || 0} -> ₱${body.price}`);
      }
    }

    // Update in-memory server cache
    if (globalThis.__spott_server_events) {
      globalThis.__spott_server_events = globalThis.__spott_server_events.map((e) =>
        e.id === id
          ? {
              ...e,
              title: newTitle,
              date: newDate,
              location: newLocation,
              price: newPrice,
              status: body.status || e.status,
            }
          : e
      );
    }

    // Update in Supabase
    try {
      await supabase
        .from('events')
        .update({
          title: newTitle,
          start_datetime: newDate,
          price: newPrice,
          status: body.status || 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', id);
    } catch {}

    // If changes occurred, notify RSVPed attendees and recompute pending reminders
    let createdNotification = null;
    if (changes.length > 0) {
      const updateMessage = `The organizer updated details for "${newTitle}": ${changes.join('; ')}.`;

      createdNotification = {
        type: 'update',
        title: `Event Schedule Updated: "${newTitle}"`,
        message: updateMessage,
        link: `/events/${id}`,
      };

      try {
        const { data: attendees } = await supabase
          .from('registrations')
          .select('user_id')
          .eq('event_id', id);

        if (attendees && attendees.length > 0) {
          const notifs = (attendees as any[]).map((att: any) => ({
            user_id: att.user_id,
            type: 'update',
            title: `Event Schedule Updated: "${newTitle}"`,
            message: updateMessage,
            related_event_id: id,
            is_read: false,
          }));
          await supabase.from('notifications').insert(notifs);
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      hasChanges: changes.length > 0,
      changes,
      notification: createdNotification,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const account = await getAuthenticatedRole();
    if (!account || !['organizer', 'admin'].includes(account.role)) {
      return NextResponse.json({ error: 'Organizer access required' }, { status: 403 });
    }
    const supabase = createAdminClient();

    if (account.role !== 'admin') {
      const { data: ownership } = await supabase
        .from('events')
        .select('organizers!inner(user_id)')
        .eq('event_id', id)
        .maybeSingle();
      const organizer = Array.isArray(ownership?.organizers) ? ownership.organizers[0] : ownership?.organizers;
      if (!ownership || organizer?.user_id !== account.userId) {
        return NextResponse.json({ error: 'You do not own this event' }, { status: 403 });
      }
    }

    // Delete rule: Allow delete ONLY for Draft events or events with 0 RSVPs
    let rsvpCount = 0;
    let eventStatus = '';

    try {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('status')
        .eq('event_id', id)
        .maybeSingle();

      if (eventError) return NextResponse.json({ error: 'Unable to verify event status' }, { status: 500 });
      if (eventData) eventStatus = eventData.status;

      const { count, error: registrationError } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id);

      if (registrationError) return NextResponse.json({ error: 'Unable to verify registrations' }, { status: 500 });
      if (typeof count === 'number') rsvpCount = count;
    } catch {
      return NextResponse.json({ error: 'Unable to verify event deletion rules' }, { status: 500 });
    }

    // Check in-memory if Supabase had no record
    const serverEv = globalThis.__spott_server_events?.find((e) => e.id === id);
    if (serverEv) {
      eventStatus = eventStatus || serverEv.status;
      rsvpCount = Math.max(rsvpCount, serverEv.registrations || 0);
    }

    if (!eventStatus && !serverEv) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (eventStatus !== 'draft' && rsvpCount > 0) {
      return NextResponse.json(
        {
          error:
            'Cannot delete an event with existing RSVPs. Please use "Cancel Event" instead to notify registered attendees.',
          blocked: true,
        },
        { status: 400 }
      );
    }

    // Delete from Supabase
    const { error: deleteError } = await supabase.from('events').delete().eq('event_id', id);
    if (deleteError && !serverEv) {
      return NextResponse.json({ error: 'Unable to delete event' }, { status: 500 });
    }

    // Remove from in-memory
    if (globalThis.__spott_server_events) {
      globalThis.__spott_server_events = globalThis.__spott_server_events.filter((e) => e.id !== id);
    }

    return NextResponse.json({ success: true, message: 'Event deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
