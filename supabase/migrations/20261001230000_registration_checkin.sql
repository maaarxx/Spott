-- Persist organizer check-in state so it is shared across devices and sessions.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
