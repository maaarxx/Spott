-- New and edited registrations represent one person per authenticated account.
-- This preserves legacy multi-attendee rows while preventing future writes from
-- changing an RSVP back to more than one attendee.
CREATE OR REPLACE FUNCTION public.enforce_single_attendee_per_registration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.attendees_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SINGLE_ATTENDEE_ONLY';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrations_single_attendee_guard ON public.registrations;
CREATE TRIGGER registrations_single_attendee_guard
BEFORE INSERT OR UPDATE OF attendees_count
ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_attendee_per_registration();

REVOKE ALL ON FUNCTION public.enforce_single_attendee_per_registration() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_single_attendee_per_registration() TO service_role;
