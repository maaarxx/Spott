-- Idempotent migration to drop and recreate foreign keys referencing public.users(user_id)
-- with ON UPDATE CASCADE, while preserving their original ON DELETE behavior.

ALTER TABLE public.organizers DROP CONSTRAINT IF EXISTS organizers_user_id_fkey;
ALTER TABLE public.organizers ADD CONSTRAINT organizers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_user_id_fkey;
ALTER TABLE public.registrations ADD CONSTRAINT registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.user_interests DROP CONSTRAINT IF EXISTS user_interests_user_id_fkey;
ALTER TABLE public.user_interests ADD CONSTRAINT user_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reported_by_fkey;
ALTER TABLE public.reports ADD CONSTRAINT reports_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.organizer_verification_documents DROP CONSTRAINT IF EXISTS organizer_verification_documents_uploaded_by_fkey;
ALTER TABLE public.organizer_verification_documents ADD CONSTRAINT organizer_verification_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.pending_organizers DROP CONSTRAINT IF EXISTS pending_organizers_user_id_fkey;
ALTER TABLE public.pending_organizers ADD CONSTRAINT pending_organizers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_actor_user_id_fkey;
ALTER TABLE public.admin_audit_logs ADD CONSTRAINT admin_audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.saved_events DROP CONSTRAINT IF EXISTS saved_events_user_id_fkey;
ALTER TABLE public.saved_events ADD CONSTRAINT saved_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE;
