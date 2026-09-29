import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// Server-side in-memory cache for event reminders resilience
interface StoredReminder {
  id: string;
  user_id: string;
  event_id: string;
  event_title?: string;
  remind_at: string;
  offset_label: string;
  sent: boolean;
  created_at: string;
}

declare global {
  var __spott_server_reminders: StoredReminder[] | undefined;
}

if (!globalThis.__spott_server_reminders) {
  globalThis.__spott_server_reminders = [];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    const userId = searchParams.get('user_id');

    const supabase = createAdminClient();
    try {
      let query = supabase.from('event_reminders').select('*');
      if (eventId) query = query.eq('event_id', eventId);
      if (userId) query = query.eq('user_id', userId);

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return NextResponse.json(data);
      }
    } catch {}

    // Fallback in-memory
    let list = globalThis.__spott_server_reminders || [];
    if (eventId) list = list.filter((r) => r.event_id === eventId);
    if (userId) list = list.filter((r) => r.user_id === userId);

    return NextResponse.json(list);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch reminders' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { user_id, event_id, event_title, remind_at, offset_label } = body;

    if (!user_id || !event_id || !remind_at || !offset_label) {
      return NextResponse.json({ error: 'Missing required reminder fields' }, { status: 400 });
    }

    const remindAtMs = new Date(remind_at).getTime();
    if (isNaN(remindAtMs) || remindAtMs <= Date.now()) {
      return NextResponse.json(
        { error: 'Reminder time is already in the past' },
        { status: 400 }
      );
    }

    const newRecord: StoredReminder = {
      id: body.id || `rem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id,
      event_id,
      event_title,
      remind_at,
      offset_label,
      sent: false,
      created_at: new Date().toISOString(),
    };

    // Update in-memory
    const existingIdx = (globalThis.__spott_server_reminders || []).findIndex(
      (r) => r.user_id === user_id && r.event_id === event_id && r.offset_label === offset_label
    );
    if (existingIdx !== -1) {
      globalThis.__spott_server_reminders![existingIdx] = newRecord;
    } else {
      globalThis.__spott_server_reminders!.push(newRecord);
    }

    // Persist to Supabase event_reminders
    const supabase = createAdminClient();
    try {
      await supabase.from('event_reminders').upsert([
        {
          id: newRecord.id,
          user_id,
          event_id,
          remind_at,
          offset_label,
          sent: false,
        },
      ], { onConflict: 'user_id,event_id,offset_label' });
    } catch {}

    return NextResponse.json({ success: true, reminder: newRecord }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { event_id, user_id, offset_label } = body;

    if (!event_id || !user_id) {
      return NextResponse.json({ error: 'event_id and user_id are required' }, { status: 400 });
    }

    // In-memory delete
    globalThis.__spott_server_reminders = (globalThis.__spott_server_reminders || []).filter((r) => {
      if (r.event_id === event_id && r.user_id === user_id) {
        if (offset_label && r.offset_label !== offset_label) return true;
        return false;
      }
      return true;
    });

    // Supabase delete
    const supabase = createAdminClient();
    try {
      let query = supabase.from('event_reminders').delete().eq('event_id', event_id).eq('user_id', user_id);
      if (offset_label) {
        query = query.eq('offset_label', offset_label);
      }
      await query;
    } catch {}

    return NextResponse.json({ success: true, message: 'Reminder deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
