-- Keep report submissions and admin resolutions in the shared database.
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS details TEXT,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
