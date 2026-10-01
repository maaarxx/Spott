-- Keep event-list responses small by counting RSVP rows in Postgres.
CREATE INDEX IF NOT EXISTS registrations_event_status_idx
  ON public.registrations (event_id, status);

CREATE OR REPLACE FUNCTION public.get_event_registration_counts(p_event_ids uuid[])
RETURNS TABLE (event_id uuid, registration_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.event_id, COALESCE(SUM(GREATEST(COALESCE(r.attendees_count, 1), 1)), 0)::bigint
  FROM public.registrations AS r
  WHERE r.event_id = ANY (p_event_ids)
    AND r.status IN ('confirmed', 'registered', 'approved')
  GROUP BY r.event_id;
$$;

REVOKE ALL ON FUNCTION public.get_event_registration_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_registration_counts(uuid[]) TO service_role;
