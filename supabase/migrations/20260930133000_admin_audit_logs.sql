CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  actor_email VARCHAR(150) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(60) NOT NULL,
  target_id TEXT,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor
  ON public.admin_audit_logs (actor_user_id, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
