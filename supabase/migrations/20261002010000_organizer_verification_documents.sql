-- Persist organizer verification requests and their private document metadata.
ALTER TABLE public.organizers
  ADD COLUMN IF NOT EXISTS expedite_note text,
  ADD COLUMN IF NOT EXISTS expedited_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.organizer_verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(organizer_id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  file_path text NOT NULL UNIQUE,
  file_name varchar(255) NOT NULL,
  document_type varchar(100) NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  content_type varchar(100) NOT NULL DEFAULT 'application/pdf',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS organizer_verification_documents_org_idx
  ON public.organizer_verification_documents (organizer_id, uploaded_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE public.organizer_verification_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organizer_verification_documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.organizer_verification_documents TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'organizer-verification',
  'organizer-verification',
  false,
  15728640,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
