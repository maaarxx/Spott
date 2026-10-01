-- Store the selected reminder offset so reminders can be recalculated when
-- an organizer changes an event's date or time.
ALTER TABLE public.event_reminders
  ADD COLUMN IF NOT EXISTS offset_minutes INTEGER NOT NULL DEFAULT 0;
