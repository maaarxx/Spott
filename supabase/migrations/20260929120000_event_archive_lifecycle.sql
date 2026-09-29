-- Track event archive entry and retention boundaries.
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_events_archived_at
  ON public.events (archived_at)
  WHERE status = 'archived';

-- Past active records enter the archive once. Drafts and cancelled events are
-- intentionally excluded from automatic completion archival.
UPDATE public.events
SET status = 'archived', archived_at = COALESCE(archived_at, now())
WHERE status IN ('active', 'published', 'past', 'completed', 'done')
  AND COALESCE(end_datetime, start_datetime) <= now();

UPDATE public.events
SET archived_at = COALESCE(archived_at, updated_at, created_at, now())
WHERE status = 'archived' AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.archive_expired_events()
RETURNS TABLE (archived_count INTEGER, purged_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_rows INTEGER;
  purged_rows INTEGER;
BEGIN
  UPDATE public.events
  SET status = 'archived', archived_at = COALESCE(archived_at, now()), updated_at = now()
  WHERE status IN ('active', 'published', 'past', 'completed', 'done')
    AND COALESCE(end_datetime, start_datetime) <= now();
  GET DIAGNOSTICS archived_rows = ROW_COUNT;

  DELETE FROM public.events
  WHERE status = 'archived'
    AND archived_at <= now() - INTERVAL '30 days';
  GET DIAGNOSTICS purged_rows = ROW_COUNT;

  RETURN QUERY SELECT archived_rows, purged_rows;
END;
$$;

-- Only trusted server-side API calls should be able to trigger archive purges.
REVOKE ALL ON FUNCTION public.archive_expired_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_expired_events() TO service_role;

-- Check every minute so physical deletion stays close to the 30-day boundary.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'archive-expired-events-hourly';

    PERFORM cron.schedule(
      'archive-expired-events-hourly',
      '* * * * *',
      'SELECT public.archive_expired_events();'
    );
  END IF;
END;
$$;
