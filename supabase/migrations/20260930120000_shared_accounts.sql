-- Keep account and organizer registration data shared across deployments/devices.
CREATE TABLE IF NOT EXISTS public.pending_organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

ALTER TABLE public.pending_organizers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_organizers FROM anon, authenticated;
GRANT ALL ON public.pending_organizers TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  account_role TEXT;
  account_name TEXT;
BEGIN
  account_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'organizer' THEN 'organizer' ELSE 'user' END;
  account_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), split_part(NEW.email, '@', 1));
  INSERT INTO public.users (user_id, name, email, role, auth_provider)
  VALUES (NEW.id, account_name, lower(NEW.email), account_role, 'supabase')
  ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, name = EXCLUDED.name;
  IF account_role = 'organizer' THEN
    INSERT INTO public.pending_organizers (user_id, name, email)
    VALUES (NEW.id, account_name, lower(NEW.email)) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_spott ON auth.users;
CREATE TRIGGER on_auth_user_created_spott
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
