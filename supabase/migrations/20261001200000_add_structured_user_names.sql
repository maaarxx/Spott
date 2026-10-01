-- Add structured name fields while retaining `name` for compatibility during
-- the application rollout. Ambiguous legacy names are intentionally left
-- unparsed so we do not silently assign part of a name to the wrong column.
ALTER TABLE public.users
  ALTER COLUMN name TYPE VARCHAR(200),
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS middle_initial VARCHAR(10),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(150);

WITH source_names AS (
  SELECT
    user_id,
    btrim(name) AS full_name,
    CASE WHEN position(',' IN name) > 0
      THEN btrim(split_part(name, ',', 1))
      ELSE NULL
    END AS comma_last_name,
    CASE WHEN position(',' IN name) > 0
      THEN btrim(split_part(name, ',', 2))
      ELSE NULL
    END AS comma_given_names
  FROM public.users
  WHERE name IS NOT NULL AND btrim(name) <> ''
), parsed_names AS (
  SELECT
    user_id,
    CASE
      WHEN comma_given_names IS NOT NULL AND comma_given_names <> '' THEN
        CASE
          WHEN comma_given_names ~ '[[:space:]]+[[:alpha:]]\.?$'
            THEN regexp_replace(comma_given_names, '[[:space:]]+[[:alpha:]]\.?$', '')
          ELSE comma_given_names
        END
      WHEN full_name ~ '^[^[:space:]]+[[:space:]]+[^[:space:]]+$'
        THEN split_part(full_name, ' ', 1)
      WHEN full_name ~ '^[^[:space:]]+[[:space:]]+[[:alpha:]]\.?[[:space:]]+[^[:space:]]+$'
        THEN split_part(full_name, ' ', 1)
      ELSE NULL
    END AS first_name,
    CASE
      WHEN comma_given_names ~ '[[:space:]]+[[:alpha:]]\.?$'
        THEN substring(comma_given_names FROM '[[:space:]]([[:alpha:]])\.?$')
      WHEN comma_given_names IS NULL
        AND full_name ~ '^[^[:space:]]+[[:space:]]+[[:alpha:]]\.?[[:space:]]+[^[:space:]]+$'
        THEN substring(full_name FROM '^[^[:space:]]+[[:space:]]+([[:alpha:]])\.?[[:space:]]+[^[:space:]]+$')
      ELSE NULL
    END AS middle_initial,
    CASE
      WHEN comma_last_name IS NOT NULL AND comma_last_name <> '' THEN comma_last_name
      WHEN full_name ~ '^[^[:space:]]+[[:space:]]+[^[:space:]]+$'
        THEN split_part(full_name, ' ', 2)
      WHEN full_name ~ '^[^[:space:]]+[[:space:]]+[[:alpha:]]\.?[[:space:]]+[^[:space:]]+$'
        THEN regexp_replace(full_name, '^[^[:space:]]+[[:space:]]+[[:alpha:]]\.?[[:space:]]+', '')
      ELSE NULL
    END AS last_name
  FROM source_names
)
UPDATE public.users AS users
SET
  first_name = COALESCE(users.first_name, parsed_names.first_name),
  middle_initial = COALESCE(users.middle_initial, parsed_names.middle_initial),
  last_name = COALESCE(users.last_name, parsed_names.last_name)
FROM parsed_names
WHERE users.user_id = parsed_names.user_id;

-- Keep Supabase Auth signup in sync with the structured profile columns. The
-- legacy `name` value remains populated for code that has not been migrated.
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
  profile_user_id UUID;
BEGIN
  account_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' = 'organizer' THEN 'organizer'
    ELSE 'user'
  END;
  account_first_name := NULLIF(btrim(NEW.raw_user_meta_data->>'first_name'), '');
  account_middle_initial := NULLIF(btrim(NEW.raw_user_meta_data->>'middle_initial'), '');
  account_last_name := NULLIF(btrim(NEW.raw_user_meta_data->>'last_name'), '');
  account_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(concat_ws(' ', account_first_name, account_middle_initial, account_last_name), ''),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.users (
    user_id, name, first_name, middle_initial, last_name, email, role, auth_provider
  )
  VALUES (
    NEW.id, account_name, account_first_name, account_middle_initial,
    account_last_name, lower(NEW.email), account_role, 'supabase'
  )
  ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    first_name = COALESCE(EXCLUDED.first_name, public.users.first_name),
    middle_initial = COALESCE(EXCLUDED.middle_initial, public.users.middle_initial),
    last_name = COALESCE(EXCLUDED.last_name, public.users.last_name),
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
