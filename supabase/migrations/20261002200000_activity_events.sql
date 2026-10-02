CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  actor_role VARCHAR(20) NOT NULL,
  anon_id TEXT,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id TEXT,
  path VARCHAR(200),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_activity_events_created_at
  ON public.activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_action
  ON public.activity_events (action);
CREATE INDEX IF NOT EXISTS idx_activity_events_actor
  ON public.activity_events (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_target
  ON public.activity_events (target_id);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_events FROM anon, authenticated;
GRANT ALL ON public.activity_events TO service_role;
