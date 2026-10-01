-- Restore application tables used by existing API routes. This migration is
-- additive and safe to re-run; it does not delete or rewrite existing rows.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text DEFAULT NULL;

CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  type varchar(30) NOT NULL DEFAULT 'update',
  title varchar(255) NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  related_event_id uuid REFERENCES public.events(event_id) ON DELETE SET NULL,
  target_role varchar(20) NOT NULL DEFAULT 'all'
    CHECK (target_role IN ('all', 'user', 'organizer', 'admin')),
  recipient_email varchar(254),
  link text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_related_event_idx
  ON public.notifications (related_event_id);

-- API routes authenticate the caller and query/write notifications with the
-- service role. Keep this table inaccessible to anon/authenticated SQL clients.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;

CREATE TABLE IF NOT EXISTS public.listing_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id varchar(255) NOT NULL,
  visitor_id varchar(255) NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_views_lookup
  ON public.listing_views (listing_id, visitor_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_views_listing
  ON public.listing_views (listing_id);

ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.listing_views FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.listing_views TO service_role;

DROP POLICY IF EXISTS "Allow public insert to listing_views" ON public.listing_views;
DROP POLICY IF EXISTS "Allow public select from listing_views" ON public.listing_views;

CREATE TABLE IF NOT EXISTS public.event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(255) NOT NULL,
  event_id varchar(255) NOT NULL,
  event_title text,
  remind_at timestamptz NOT NULL,
  offset_label varchar(50) NOT NULL,
  sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unq_user_event_reminder UNIQUE (user_id, event_id, offset_label)
);

CREATE INDEX IF NOT EXISTS idx_event_reminders_pending
  ON public.event_reminders (sent, remind_at);
CREATE INDEX IF NOT EXISTS idx_event_reminders_user_event
  ON public.event_reminders (user_id, event_id);

ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_reminders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.event_reminders TO service_role;

DROP POLICY IF EXISTS "Allow public insert to event_reminders" ON public.event_reminders;
DROP POLICY IF EXISTS "Allow public select from event_reminders" ON public.event_reminders;
DROP POLICY IF EXISTS "Allow public update to event_reminders" ON public.event_reminders;
