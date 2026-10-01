import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedRole } from '@/lib/supabase-server';

const BUCKET = 'organizer-verification';
const MAX_FILE_SIZE = 15 * 1024 * 1024;

type DocumentRow = {
  id: string;
  organizer_id: string;
  file_path: string;
  file_name: string;
  document_type: string;
  file_size: number;
  content_type: string;
  uploaded_at: string;
  archived_at: string | null;
};

async function getSignedDocuments(rows: DocumentRow[]) {
  const db = createAdminClient();
  return Promise.all(rows.map(async (row) => {
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(row.file_path, 60 * 5);
    if (error || !data) throw new Error('Unable to create a private document link.');
    return {
      id: row.id,
      organizerId: row.organizer_id,
      name: row.file_name,
      type: row.document_type,
      sizeBytes: Number(row.file_size),
      uploadedAt: row.uploaded_at,
      archivedAt: row.archived_at,
      url: data.signedUrl,
    };
  }));
}

export async function GET(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (!actor || !['organizer', 'admin'].includes(actor.role)) {
    return NextResponse.json({ error: 'Organizer or administrator access required.' }, { status: actor ? 403 : 401 });
  }

  const db = createAdminClient();
  const allOrganizers = actor.role === 'admin' && new URL(request.url).searchParams.get('scope') === 'all';
  let organizerIds: string[] = [];
  let organizers: Array<Record<string, unknown>> = [];
  if (allOrganizers) {
    const { data, error } = await db.from('organizers').select('organizer_id,user_id,organization_name,verification_status');
    if (error) return NextResponse.json({ error: 'Unable to load verification applications.' }, { status: 500 });
    organizers = data || [];
    organizerIds = (data || []).map((row) => row.organizer_id);
    if (organizerIds.length === 0) return NextResponse.json({ documents: [], organizers });
  } else {
    const { data, error } = await db.from('organizers')
      .select('organizer_id,user_id,organization_name,verification_status')
      .eq('user_id', actor.userId).maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to load organizer verification record.' }, { status: 500 });
    if (!data) return NextResponse.json({ documents: [], organizers: [] });
    organizerIds = [data.organizer_id];
  }

  let documentsQuery = db.from('organizer_verification_documents')
    .select('id,organizer_id,file_path,file_name,document_type,file_size,content_type,uploaded_at,archived_at')
    .in('organizer_id', organizerIds)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('uploaded_at', { ascending: false });
  if (!allOrganizers) documentsQuery = documentsQuery.is('archived_at', null);
  const { data: rows, error } = await documentsQuery;
  if (error) return NextResponse.json({ error: 'Unable to load verification documents.' }, { status: 500 });

  try {
    return NextResponse.json({ documents: await getSignedDocuments((rows || []) as DocumentRow[]), organizers });
  } catch {
    return NextResponse.json({ error: 'Unable to create private document links.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (!actor || actor.role !== 'organizer') {
    return NextResponse.json({ error: 'Organizer access required.' }, { status: actor ? 403 : 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const documentType = form?.get('document_type');
  const requestedName = form?.get('document_name');
  if (!(file instanceof File) || typeof documentType !== 'string' || !documentType.trim()) {
    return NextResponse.json({ error: 'A PDF file and document type are required.' }, { status: 400 });
  }
  if (file.type !== 'application/pdf' || file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Choose a PDF file smaller than 15 MB.' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: organizer, error: organizerError } = await db.from('organizers')
    .select('organizer_id,organization_name').eq('user_id', actor.userId).maybeSingle();
  if (organizerError) return NextResponse.json({ error: 'Unable to load organizer profile.' }, { status: 500 });
  if (!organizer) return NextResponse.json({ error: 'Organizer profile not found.' }, { status: 404 });

  const displayName = (typeof requestedName === 'string' && requestedName.trim() ? requestedName.trim() : file.name.replace(/\.pdf$/i, ''))
    .replace(/[\\/\0-\x1f]/g, '_').slice(-250) || 'verification';
  const safeFileName = `${displayName.replace(/\.pdf$/i, '')}.pdf`;
  const storageFileName = file.name.replace(/[\\/\0-\x1f]/g, '_').slice(-255) || 'verification.pdf';
  const filePath = `${organizer.organizer_id}/${crypto.randomUUID()}-${storageFileName}`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(filePath, file, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: 'Unable to upload verification document.' }, { status: 500 });

  const { data: document, error: insertError } = await db.from('organizer_verification_documents')
    .insert({
      organizer_id: organizer.organizer_id,
      uploaded_by: actor.userId,
      file_path: filePath,
    file_name: safeFileName,
      document_type: documentType.trim().slice(0, 100),
      file_size: file.size,
      content_type: 'application/pdf',
    })
    .select('id,organizer_id,file_path,file_name,document_type,file_size,content_type,uploaded_at,archived_at')
    .single();
  if (insertError || !document) {
    console.error('Uploaded verification file has no metadata row:', { organizerId: organizer.organizer_id, filePath });
    return NextResponse.json({ error: 'File uploaded, but its record could not be saved. Contact an administrator before retrying.' }, { status: 500 });
  }

  const { error: statusError } = await db.from('organizers').update({ verification_status: 'pending' })
    .eq('organizer_id', organizer.organizer_id);
  if (statusError) return NextResponse.json({ error: 'Document saved, but the verification status could not be updated.' }, { status: 500 });

  try {
    return NextResponse.json({ success: true, documents: await getSignedDocuments([document as DocumentRow]) }, { status: 201 });
  } catch {
    return NextResponse.json({ success: true, documentId: document.id }, { status: 201 });
  }
}

export async function DELETE(request: Request) {
  const actor = await getAuthenticatedRole(request);
  if (!actor || !['organizer', 'admin'].includes(actor.role)) {
    return NextResponse.json({ error: 'Organizer or administrator access required.' }, { status: actor ? 403 : 401 });
  }

  const body = await request.json().catch(() => null);
  const documentId = typeof body?.document_id === 'string' ? body.document_id : '';
  if (!documentId) return NextResponse.json({ error: 'document_id is required.' }, { status: 400 });

  const db = createAdminClient();
  let query = db.from('organizer_verification_documents').update({ archived_at: new Date().toISOString() }).eq('id', documentId).is('archived_at', null);
  if (actor.role !== 'admin') {
    const { data: organizer, error } = await db.from('organizers').select('organizer_id').eq('user_id', actor.userId).maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to verify organizer ownership.' }, { status: 500 });
    if (!organizer) return NextResponse.json({ error: 'Organizer profile not found.' }, { status: 404 });
    query = query.eq('organizer_id', organizer.organizer_id);
  }
  const { data, error } = await query.select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to archive verification document.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
