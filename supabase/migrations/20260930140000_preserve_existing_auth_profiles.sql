CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  account_role TEXT;
  account_name TEXT;
  profile_user_id UUID;
BEGIN
  account_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'organizer' THEN 'organizer' ELSE 'user' END;
  account_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), split_part(NEW.email, '@', 1));
  INSERT INTO public.users (user_id, name, email, role, auth_provider)
  VALUES (NEW.id, account_name, lower(NEW.email), account_role, 'supabase')
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role
  RETURNING user_id INTO profile_user_id;
  IF account_role = 'organizer' THEN
    INSERT INTO public.pending_organizers (user_id, name, email)
    VALUES (profile_user_id, account_name, lower(NEW.email)) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
