import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', account.userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (data || []).map((n: {
      notification_id: string;
      type: string;
      title: string;
      message: string | null;
      is_read: boolean;
      created_at: string;
      target_role: string;
      recipient_email: string | null;
      related_event_id: string | null;
      link: string | null;
    }) => ({
      id: n.notification_id,
      type: n.type === 'cancellation' ? 'announcement' : n.type,
      title: n.title,
      message: n.message || '',
      isRead: n.is_read,
      createdAt: n.created_at,
      targetRole: n.target_role,
      recipientEmail: n.recipient_email || undefined,
      eventId: n.related_event_id || undefined,
      link: n.link || (n.related_event_id ? `/events/${n.related_event_id}` : undefined),
    }));

    if (new URL(request.url).searchParams.get('count') === 'unread') {
      return NextResponse.json({ unreadCount: formatted.filter((item) => !item.isRead).length });
    }
    return NextResponse.json({ notifications: formatted });
  } catch {
    return NextResponse.json({ error: 'Unable to load notifications.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedRole(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const type = body.type;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const targetRole = ['all', 'user', 'organizer', 'admin'].includes(body.targetRole) ? body.targetRole : 'all';
    const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim().toLowerCase() : '';
    const link = typeof body.link === 'string' ? body.link.trim() : '';
    const dbType = type === 'cancellation' ? 'announcement' : type;
    if (!['reminder', 'update', 'announcement'].includes(dbType) || !title || title.length > 200 || message.length > 2000 || link.length > 500) {
      return NextResponse.json({ error: 'Invalid notification details.' }, { status: 400 });
    }

    const db = createAdminClient();
    let recipients: Array<{ user_id: string; email: string; role: string }> = [];
    if (actor.role === 'admin') {
      let query = db.from('users').select('user_id,email,role');
      if (recipientEmail) query = query.eq('email', recipientEmail);
      else if (targetRole !== 'all') query = query.eq('role', targetRole);
      const { data, error } = await query;
      if (error) throw error;
      recipients = data || [];
    } else if (actor.role === 'organizer' && targetRole === 'user' && link) {
      const eventId = link.match(/\/events\/([0-9a-f-]{36})/i)?.[1];
      if (eventId) {
        const { data: event } = await db.from('events').select('organizer_id').eq('event_id', eventId).maybeSingle();
        const { data: organizer } = event ? await db.from('organizers').select('user_id').eq('organizer_id', event.organizer_id).maybeSingle() : { data: null };
        if (organizer?.user_id === actor.userId) {
          const { data: registrations } = await db.from('registrations').select('user_id,users(email,role)').eq('event_id', eventId);
          recipients = (registrations || []).map((row) => {
            const profile = Array.isArray(row.users) ? row.users[0] : row.users;
            return { user_id: row.user_id, email: profile?.email || '', role: profile?.role || 'user' };
          }).filter((row) => !recipientEmail || row.email.toLowerCase() === recipientEmail);
        }
      }
    } else if (actor.role === 'user' && (!recipientEmail || recipientEmail === actor.email)) {
      const { data } = await db.from('users').select('user_id,email,role').eq('user_id', actor.userId).maybeSingle();
      if (data) recipients = [data];
    }

    const uniqueRecipients = [...new Map(recipients.map((recipient) => [recipient.user_id, recipient])).values()];
    if (uniqueRecipients.length) {
      const { error } = await db.from('notifications').insert(uniqueRecipients.map((recipient) => ({
        user_id: recipient.user_id,
        type: dbType,
        title,
        message,
        is_read: false,
        target_role: recipient.role,
        recipient_email: recipientEmail || null,
        related_event_id: link.match(/\/events\/([0-9a-f-]{36})/i)?.[1] || null,
        link: link || null,
      })));
      if (error) throw error;
    }
    return NextResponse.json({ success: true, delivered: uniqueRecipients.length }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to create notification.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    if (body.markAllRead !== true) return NextResponse.json({ error: 'Invalid notification update.' }, { status: 400 });
    const { error } = await createAdminClient().from('notifications').update({ is_read: true }).eq('user_id', account.userId).eq('is_read', false);
    if (error) return NextResponse.json({ error: 'Unable to update notifications.' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unable to update notifications.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await getAuthenticatedRole(request);
    if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = createAdminClient();
    const eventId = new URL(request.url).searchParams.get('event_id');
    let query = db.from('notifications').delete();
    if (eventId) {
      if (account.role === 'organizer') {
        const { data: event, error: eventError } = await db.from('events')
          .select('event_id,organizers!inner(user_id)').eq('event_id', eventId).eq('organizers.user_id', account.userId).maybeSingle();
        if (eventError) return NextResponse.json({ error: 'Unable to verify event ownership.' }, { status: 500 });
        if (!event) return NextResponse.json({ error: 'Event not found or access denied.' }, { status: 404 });
      } else if (account.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      query = query.eq('related_event_id', eventId);
    } else {
      query = query.eq('user_id', account.userId);
    }
    const { error } = await query;
    if (error) return NextResponse.json({ error: 'Unable to clear notifications.' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unable to clear notifications.' }, { status: 500 });
  }
}
