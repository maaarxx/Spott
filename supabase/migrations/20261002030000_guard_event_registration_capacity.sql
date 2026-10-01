-- Serialize capacity checks per event and reject any write that would cause
-- confirmed attendee counts to exceed the configured capacity. Additive only.
CREATE OR REPLACE FUNCTION public.enforce_event_registration_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_capacity INTEGER;
  other_confirmed_attendees BIGINT;
  new_status TEXT;
BEGIN
  new_status := lower(COALESCE(NEW.status, ''));
  IF new_status NOT IN ('confirmed', 'registered', 'approved') THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN capacity > 0 THEN capacity ELSE 100 END
    INTO event_capacity
    FROM public.events
    WHERE event_id = NEW.event_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'EVENT_NOT_FOUND';
  END IF;

  SELECT COALESCE(SUM(GREATEST(attendees_count, 1)), 0)
    INTO other_confirmed_attendees
    FROM public.registrations
    WHERE event_id = NEW.event_id
      AND lower(COALESCE(status, '')) IN ('confirmed', 'registered', 'approved')
      AND (TG_OP = 'INSERT' OR registration_id <> NEW.registration_id);

  IF other_confirmed_attendees + GREATEST(COALESCE(NEW.attendees_count, 1), 1) > event_capacity THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EVENT_CAPACITY_REACHED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrations_capacity_guard ON public.registrations;
CREATE TRIGGER registrations_capacity_guard
BEFORE INSERT OR UPDATE OF event_id, status, attendees_count
ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_event_registration_capacity();

REVOKE ALL ON FUNCTION public.enforce_event_registration_capacity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_event_registration_capacity() TO service_role;
