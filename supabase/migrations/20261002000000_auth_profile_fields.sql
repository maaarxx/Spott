-- Keep the application profile synchronized with Supabase Auth for new signups.
-- This preserves the legacy `name` column while populating the structured
-- name fields and the username that signup already collects.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_role TEXT;
  account_name TEXT;
  account_first_name TEXT;
  account_middle_initial TEXT;
  account_last_name TEXT;
  account_username TEXT;
  legacy_given_names TEXT;
  given_name_parts TEXT[];
  profile_user_id UUID;
BEGIN
  account_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' = 'organizer' THEN 'organizer'
    ELSE 'user'
  END;
  account_first_name := NULLIF(btrim(NEW.raw_user_meta_data->>'first_name'), '');
  account_middle_initial := NULLIF(btrim(NEW.raw_user_meta_data->>'middle_initial'), '');
  account_last_name := NULLIF(btrim(NEW.raw_user_meta_data->>'last_name'), '');
  account_username := NULLIF(btrim(NEW.raw_user_meta_data->>'username'), '');
  account_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(concat_ws(' ', account_first_name, account_middle_initial, account_last_name), ''),
    split_part(NEW.email, '@', 1)
  );

  -- Older signup clients send "Last name, First name MI" in the `name`
  -- metadata field. Parse only this explicit comma-separated format; leave
  -- other legacy name formats untouched rather than guessing their order.
  IF position(',' IN account_name) > 0 THEN
    IF account_last_name IS NULL THEN
      account_last_name := NULLIF(btrim(split_part(account_name, ',', 1)), '');
    END IF;
    legacy_given_names := NULLIF(btrim(split_part(account_name, ',', 2)), '');
    IF legacy_given_names IS NOT NULL THEN
      given_name_parts := regexp_split_to_array(legacy_given_names, '[[:space:]]+');
      IF array_length(given_name_parts, 1) >= 2
        AND given_name_parts[array_length(given_name_parts, 1)] ~* '^[[:alpha:]]\.?$'
      THEN
        IF account_middle_initial IS NULL THEN
          account_middle_initial := regexp_replace(given_name_parts[array_length(given_name_parts, 1)], '\.', '', 'g');
        END IF;
        IF account_first_name IS NULL THEN
          account_first_name := NULLIF(array_to_string(given_name_parts[1:array_length(given_name_parts, 1) - 1], ' '), '');
        END IF;
      ELSIF account_first_name IS NULL THEN
        account_first_name := legacy_given_names;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.users (
    user_id, name, first_name, middle_initial, last_name, username, email, role, auth_provider
  )
  VALUES (
    NEW.id, account_name, account_first_name, account_middle_initial,
    account_last_name, account_username, lower(NEW.email), account_role, 'supabase'
  )
  ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    first_name = COALESCE(EXCLUDED.first_name, public.users.first_name),
    middle_initial = COALESCE(EXCLUDED.middle_initial, public.users.middle_initial),
    last_name = COALESCE(EXCLUDED.last_name, public.users.last_name),
    username = COALESCE(EXCLUDED.username, public.users.username),
    role = EXCLUDED.role,
    auth_provider = 'supabase'
  RETURNING user_id INTO profile_user_id;

  IF account_role = 'organizer' THEN
    INSERT INTO public.pending_organizers (user_id, name, email)
    VALUES (profile_user_id, account_name, lower(NEW.email))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
