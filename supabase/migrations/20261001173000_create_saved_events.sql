-- Safe, additive migration: creates the saved-events table without dropping data.
CREATE TABLE IF NOT EXISTS public.saved_events (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.saved_events TO authenticated;

DROP POLICY IF EXISTS saved_events_owner_select ON public.saved_events;
CREATE POLICY saved_events_owner_select ON public.saved_events FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users AS profile
    WHERE profile.user_id = saved_events.user_id
      AND lower(profile.email) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS saved_events_owner_insert ON public.saved_events;
CREATE POLICY saved_events_owner_insert ON public.saved_events FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users AS profile
    WHERE profile.user_id = saved_events.user_id
      AND lower(profile.email) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS saved_events_owner_delete ON public.saved_events;
CREATE POLICY saved_events_owner_delete ON public.saved_events FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users AS profile
    WHERE profile.user_id = saved_events.user_id
      AND lower(profile.email) = lower(auth.jwt() ->> 'email')
  )
);
