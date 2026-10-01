-- Account identity, event comments, and payment proof metadata.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username varchar(20);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_ci ON public.users (lower(username)) WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  account_role text;
  account_name text;
  profile_user_id uuid;
BEGIN
  account_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'organizer' THEN 'organizer' ELSE 'user' END;
  account_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), split_part(NEW.email, '@', 1));
  INSERT INTO public.users (user_id, name, email, role, auth_provider, username)
  VALUES (NEW.id, account_name, lower(NEW.email), account_role, 'supabase', NULLIF(NEW.raw_user_meta_data->>'username', ''))
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, auth_provider = 'supabase', username = COALESCE(EXCLUDED.username, public.users.username)
  RETURNING user_id INTO profile_user_id;
  IF account_role = 'organizer' THEN
    INSERT INTO public.pending_organizers (user_id, name, email) VALUES (profile_user_id, account_name, lower(NEW.email)) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.event_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  content varchar(2000) NOT NULL CHECK (length(trim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_comments_read ON public.event_comments;
CREATE POLICY event_comments_read ON public.event_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS event_comments_insert_own ON public.event_comments;
CREATE POLICY event_comments_insert_own ON public.event_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS event_comments_delete_own ON public.event_comments;
CREATE POLICY event_comments_delete_own ON public.event_comments FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS payment_status varchar(30);
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS payment_proof_url text;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS attendee_name varchar(100);
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS mobile_number varchar(11);
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS attendees_count integer NOT NULL DEFAULT 1;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registrations_view_self_or_owned_event ON public.registrations;
CREATE POLICY registrations_view_self_or_owned_event ON public.registrations FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.events e JOIN public.organizers o ON o.organizer_id = e.organizer_id
  WHERE e.event_id = registrations.event_id AND o.user_id = auth.uid()
));
