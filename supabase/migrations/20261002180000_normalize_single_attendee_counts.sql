-- The product rule is one attendee per account-level RSVP. Normalize legacy
-- rows that retained the old multi-attendee form value (for example, 20).
ALTER TABLE public.registrations DISABLE TRIGGER registrations_capacity_guard;

-- A legacy multi-attendee RSVP reserved one seat per registration now. Keep
-- the original single-attendee payment amounts intact; only correct amounts
-- that were calculated from an old attendees_count greater than one.
UPDATE public.registrations AS r
SET payment_amount = GREATEST(COALESCE(e.price, 0), 0)
FROM public.events AS e
WHERE e.event_id = r.event_id
  AND r.attendees_count > 1
  AND r.payment_amount IS NOT NULL;

UPDATE public.registrations
SET attendees_count = 1
WHERE attendees_count IS DISTINCT FROM 1;

ALTER TABLE public.registrations ENABLE TRIGGER registrations_capacity_guard;

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

  SELECT COUNT(*)
    INTO other_confirmed_attendees
    FROM public.registrations
    WHERE event_id = NEW.event_id
      AND lower(COALESCE(status, '')) IN ('confirmed', 'registered', 'approved')
      AND (TG_OP = 'INSERT' OR registration_id <> NEW.registration_id);

  IF other_confirmed_attendees + 1 > event_capacity THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EVENT_CAPACITY_REACHED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_event_registration_counts(p_event_ids uuid[])
RETURNS TABLE (event_id uuid, registration_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.event_id, COUNT(*)::bigint
  FROM public.registrations AS r
  WHERE r.event_id = ANY (p_event_ids)
    AND r.status IN ('confirmed', 'registered', 'approved')
  GROUP BY r.event_id;
$$;

CREATE OR REPLACE FUNCTION public.get_event_pending_registration_counts(p_event_ids uuid[])
RETURNS TABLE (event_id uuid, pending_registration_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.event_id, COUNT(*)::bigint
  FROM public.registrations AS r
  WHERE r.event_id = ANY (p_event_ids)
    AND r.status IN ('pending', 'pending verification')
  GROUP BY r.event_id;
$$;

REVOKE ALL ON FUNCTION public.get_event_registration_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_registration_counts(uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.get_event_pending_registration_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_pending_registration_counts(uuid[]) TO service_role;
