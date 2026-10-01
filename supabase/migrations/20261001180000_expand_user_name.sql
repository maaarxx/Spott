-- Allow a combined last name, first name, and middle initial in the single
-- public.users.name field without adding separate name columns.
ALTER TABLE public.users
  ALTER COLUMN name TYPE VARCHAR(200);
