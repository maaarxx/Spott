-- Persist profile and moderation data in Supabase so local and deployed
-- clients share the same source of truth. Additive and re-runnable.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name varchar(120),
  ADD COLUMN IF NOT EXISTS phone varchar(30),
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS bio varchar(300);

ALTER TABLE public.organizers
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS public_email varchar(254),
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS category varchar(100);

CREATE TABLE IF NOT EXISTS public.moderation_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  capacity_threshold integer NOT NULL DEFAULT 200 CHECK (capacity_threshold >= 10),
  sensitivity varchar(20) NOT NULL DEFAULT 'Strict' CHECK (sensitivity IN ('Strict', 'Standard')),
  auto_flag_large_events boolean NOT NULL DEFAULT true,
  legacy_imported boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.moderation_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.moderation_keywords (
  keyword varchar(100) PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.moderation_keywords (keyword)
VALUES
  ('unofficial party'),
  ('off-campus alcohol'),
  ('unauthorized vendor'),
  ('scalping'),
  ('pyrotechnics'),
  ('hazing')
ON CONFLICT (keyword) DO NOTHING;

ALTER TABLE public.moderation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_keywords ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_settings, public.moderation_keywords FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.moderation_settings, public.moderation_keywords TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-avatars', 'profile-avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
