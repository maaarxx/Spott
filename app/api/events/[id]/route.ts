import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';
import { writeAuditEntry } from '@/lib/audit-log-server';

type Relation<T> = T | T[] | null | undefined;
type EventDetailRow = {
  event_id: string;
  title: string;
  description: string | null;
  start_datetime: string;
  end_datetime: string | null;
  price: number | string | null;
  status: string;
  is_still_happening_confirmed_at: string | null;
  capacity?: number | null;
  require_approval?: boolean | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  organizers?: Relation<{ organization_name?: string | null; verification_status?: string | null }>;
  locations?: Relation<{ venue_name?: string | null; address?: string | null; city?: string | null; latitude?: number | string | null; longitude?: number | string | null }>;
  event_category?: Array<{ categories?: Relation<{ category_name?: string | null }> }>;
};

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
        capacity,
        require_approval,
        cancelled_at,
        cancel_reason,
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
      if (error.code === 'PGRST116') return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      console.error('Failed to load event from Supabase', { code: error.code });
      return NextResponse.json({ error: 'Could not load event from the database.' }, { status: 503 });
    }

    // Get registration count
    const { count } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', id)
      .in('status', ['confirmed', 'registered', 'approved']);

    const eventData = data as unknown as EventDetailRow;
    const organizer = Array.isArray(eventData.organizers) ? eventData.organizers[0] : eventData.organizers;
    const location = Array.isArray(eventData.locations) ? eventData.locations[0] : eventData.locations;

    let desc = eventData.description || '';
    let coverImage: string | null = null;
    let capacity = eventData.capacity ? Number(eventData.capacity) : 100;

    const metaMatch = desc.match(/<!--spott:(.*?)-->/);
    if (metaMatch) {
      try {
        const parsedMeta: unknown = JSON.parse(metaMatch[1]);
        const meta = parsedMeta && typeof parsedMeta === 'object'
          ? parsedMeta as { coverImage?: unknown; capacity?: unknown }
          : {};
        if (typeof meta.coverImage === 'string') coverImage = meta.coverImage;
        if (typeof meta.capacity === 'number' || typeof meta.capacity === 'string') capacity = Number(meta.capacity);
        desc = desc.replace(metaMatch[0], '').trim();
      } catch {}
    }

    const formattedData = {
      id: eventData.event_id,
      title: eventData.title,
      description: desc,
      date: eventData.start_datetime,
      endDate: eventData.end_datetime,
      price: Number(eventData.price) || 0,
      status: eventData.status,
      cancelled_at: eventData.cancelled_at || null,
      cancel_reason: eventData.cancel_reason || null,
      organizer: organizer?.organization_name || 'Unknown',
      verified: organizer?.verification_status === 'verified',
      location: location?.venue_name
        ? `${location.venue_name}, ${location.city || ''}`
        : location?.address || 'TBA',
      address: location?.address || '',
      city: location?.city || '',
      latitude: location?.latitude ? Number(location.latitude) : null,
      longitude: location?.longitude ? Number(location.longitude) : null,
      categories: (eventData.event_category || []).map((entry) => {
        const category = Array.isArray(entry.categories) ? entry.categories[0] : entry.categories;
        return category?.category_name;
      }).filter((category): category is string => Boolean(category)),
      registrations: count || 0,
      confirmedAt: eventData.is_still_happening_confirmed_at,
      capacity,
      requireApproval: eventData.require_approval ?? false,
      coverImage,
      image: coverImage,
    };

    return NextResponse.json(formattedData);
  } catch {
    return NextResponse.json({ error: 'Could not load event from the database.' }, { status: 503 });
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

    if (body.title !== undefined) {
      const { validateEventTitle } = await import('@/lib/validators/name');
      if (validateEventTitle(body.title)) {
        return NextResponse.json({ error: 'Event title is invalid or gibberish.' }, { status: 400 });
      }
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
    let existingEvent: { id: string; title?: string; date?: string; price?: number; status?: string; location?: string; locationId?: string | null } | undefined;
    {
      const { data, error: existingError } = await supabase
          .from('events')
          .select(`
            event_id,
            location_id,
            title,
            start_datetime,
            price,
            status,
            locations (venue_name, address)
          `)
          .eq('event_id', id)
          .maybeSingle();

      if (existingError) return NextResponse.json({ error: 'Unable to load the event before updating it.' }, { status: 500 });

      if (data) {
          const row = data as unknown as {
            event_id: string;
            location_id: string | null;
            title: string;
            start_datetime: string;
            price: number | string;
            status: string;
            locations?: Relation<{ venue_name?: string | null; address?: string | null }>;
          };
          const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
          existingEvent = {
            id: row.event_id,
            locationId: row.location_id,
            title: row.title,
            date: row.start_datetime,
            price: Number(row.price),
            status: row.status,
            location: loc?.venue_name || loc?.address || '',
          };
      }
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

      const { data: updatedEvent, error: updateError } = await supabase
          .from('events')
          .update({
            status: 'cancelled',
            cancelled_at: nowIso,
            cancel_reason: cancelReason,
          })
          .eq('event_id', id)
          .select('event_id')
          .maybeSingle();
      if (updateError || !updatedEvent) return NextResponse.json({ error: 'Could not cancel event in the database.' }, { status: 500 });

      // Release every attendee's slot immediately while keeping the RSVP rows
      // available for the cancellation announcement and attendee history.
      const { error: releaseError } = await supabase
        .from('registrations')
        .update({ status: 'cancelled' })
        .eq('event_id', id)
        .neq('status', 'cancelled');
      if (releaseError) {
        console.error('Could not release registrations for cancelled event', { eventId: id, code: releaseError.code });
        return NextResponse.json({ error: 'Event was cancelled, but attendee registrations could not be released.' }, { status: 500 });
      }

      await writeAuditEntry(account, {
        action: 'event.cancelled', targetType: 'event', targetId: id,
        summary: `Cancelled event “${currentTitle}”.`, details: { reason: cancelReason },
      });

      // Fetch all attendees who RSVPed to this event
      const notifMessage = `The event "${currentTitle}" scheduled for ${currentDate} has been cancelled by the organizer. Reason: ${cancelReason}`;

      try {
        const { data: attendees } = await supabase
          .from('registrations')
          .select('user_id')
          .eq('event_id', id);

        if (attendees && attendees.length > 0) {
          const notifs = (attendees as unknown as { user_id: string }[]).map((attendee) => ({
            user_id: attendee.user_id,
            type: 'announcement',
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
          type: 'announcement',
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
    const newPrice = body.price !== undefined ? Number(body.price) : Number(existingEvent?.price || 0);
    const newStatus = body.status !== undefined ? body.status : existingEvent?.status || 'active';

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
      if (body.price !== undefined && Number(body.price) !== Number(existingEvent.price || 0)) {
        changes.push(`Price: ₱${existingEvent.price || 0} -> ₱${body.price}`);
      }
      if (body.status !== undefined && body.status !== existingEvent.status) {
        changes.push(`Status: ${existingEvent.status} -> ${body.status}`);
      }
    }

    if (body.location !== undefined && body.location.trim() !== existingEvent.location?.trim()) {
      if (!existingEvent.locationId) {
        return NextResponse.json({ error: 'Event location is missing from the database.' }, { status: 500 });
      }
      const { error: locationError } = await supabase.from('locations').update({
        venue_name: body.location.trim(),
        address: body.location.trim(),
      }).eq('location_id', existingEvent.locationId);
      if (locationError) return NextResponse.json({ error: 'Could not update event location in the database.' }, { status: 500 });
    }

    const { data: updatedEvent, error: updateError } = await supabase
        .from('events')
        .update({
          title: newTitle,
          start_datetime: newDate,
          price: newPrice,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', id)
        .select('event_id')
        .maybeSingle();
    if (updateError || !updatedEvent) return NextResponse.json({ error: 'Could not update event in the database.' }, { status: 500 });

    if (changes.length > 0) await writeAuditEntry(account, {
      action: 'event.updated', targetType: 'event', targetId: id,
      summary: `Updated event “${newTitle}”.`, details: { changes },
    });

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
          const notifs = (attendees as unknown as { user_id: string }[]).map((attendee) => ({
            user_id: attendee.user_id,
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
  } catch (error: unknown) {
    console.error('Event update request failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'Unable to update this event.' }, { status: 500 });
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
    let existingEventTitle = id;

    try {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('status,title')
        .eq('event_id', id)
        .maybeSingle();

      if (eventError) return NextResponse.json({ error: 'Unable to verify event status' }, { status: 500 });
      if (eventData) {
        eventStatus = eventData.status;
        existingEventTitle = eventData.title;
      }

      const { count, error: registrationError } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id);

      if (registrationError) return NextResponse.json({ error: 'Unable to verify registrations' }, { status: 500 });
      if (typeof count === 'number') rsvpCount = count;
    } catch {
      return NextResponse.json({ error: 'Unable to verify event deletion rules' }, { status: 500 });
    }

    if (!eventStatus) {
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
    if (deleteError) {
      return NextResponse.json({ error: 'Unable to delete event' }, { status: 500 });
    }

    await writeAuditEntry(account, {
      action: 'event.deleted', targetType: 'event', targetId: id,
      summary: `Deleted event “${existingEventTitle || id}”.`,
    });

    return NextResponse.json({ success: true, message: 'Event deleted' });
  } catch (error: unknown) {
    console.error('Event deletion request failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'Unable to delete this event.' }, { status: 500 });
  }
}
