-- ==============================================================================
-- Migration: 002_event_cancellations_and_reminders.sql
-- Description: Adds event cancellation support and event_reminders table
-- ==============================================================================

-- 1. Alter public.events to support cancellation tracking
DO $$
BEGIN
  -- Add cancelled_at column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE public.events ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
  END IF;

  -- Add cancel_reason column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'cancel_reason'
  ) THEN
    ALTER TABLE public.events ADD COLUMN cancel_reason TEXT DEFAULT NULL;
  END IF;
END $$;

-- 2. Create public.event_reminders table
CREATE TABLE IF NOT EXISTS public.event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
  offset_label VARCHAR(50) NOT NULL,
  sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unq_user_event_reminder UNIQUE (user_id, event_id, offset_label)
);

-- Index for pending reminders lookup
CREATE INDEX IF NOT EXISTS idx_event_reminders_pending 
  ON public.event_reminders (sent, remind_at);

-- Index for fast user/event lookups
CREATE INDEX IF NOT EXISTS idx_event_reminders_user_event 
  ON public.event_reminders (user_id, event_id);

-- Optional Row Level Security (RLS)
ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert to event_reminders"
  ON public.event_reminders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public select from event_reminders"
  ON public.event_reminders FOR SELECT
  USING (true);

CREATE POLICY "Allow public update to event_reminders"
  ON public.event_reminders FOR UPDATE
  USING (true);

-- 3. pg_cron job to process due event reminders every minute (for Supabase pg_cron)
CREATE OR REPLACE FUNCTION public.process_due_event_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT er.id, er.user_id, er.event_id, er.offset_label, e.title AS event_title
    FROM public.event_reminders er
    LEFT JOIN public.events e ON e.id = er.event_id
    WHERE er.sent = false AND er.remind_at <= now()
  LOOP
    -- Mark reminder as sent
    UPDATE public.event_reminders SET sent = true WHERE id = r.id;

    -- Insert in-app reminder notification
    INSERT INTO public.notifications (
      type,
      title,
      message,
      target_role,
      link,
      is_read,
      created_at
    ) VALUES (
      'reminder',
      'Reminder: ' || COALESCE(r.event_title, 'Upcoming Event'),
      'Your upcoming event starts soon (' || r.offset_label || '). Check your passes and venue directions!',
      'user',
      '/events/' || r.event_id,
      false,
      now()
    );
  END LOOP;
END;
$$;

-- Schedule with pg_cron if pg_cron extension is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'process-due-event-reminders-job',
      '* * * * *',
      'SELECT public.process_due_event_reminders();'
    );
  END IF;
END $$;
