-- Align comments with the identifiers used by the app and Supabase Auth.
-- App event IDs may be UUIDs or local event keys; auth.uid() is the canonical comment owner.
ALTER TABLE public.event_comments DROP CONSTRAINT IF EXISTS event_comments_event_id_fkey;
ALTER TABLE public.event_comments DROP CONSTRAINT IF EXISTS event_comments_user_id_fkey;
ALTER TABLE public.event_comments ALTER COLUMN event_id TYPE text USING event_id::text;
ALTER TABLE public.event_comments
  ADD CONSTRAINT event_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS event_comments_event_created_idx
  ON public.event_comments (event_id, created_at);
