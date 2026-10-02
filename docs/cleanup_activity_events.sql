-- This script cleans up old activity logs (older than 90 days).
-- We do not include this in automatic migrations.
-- You can run this manually via the Supabase SQL editor or schedule it using pg_cron.

DELETE FROM public.activity_events 
WHERE created_at < NOW() - INTERVAL '90 days';
