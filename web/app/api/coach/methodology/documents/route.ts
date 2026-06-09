// POST /api/coach/methodology/documents — ingest a new document.
// GET  /api/coach/methodology/documents — list non-archived documents.
//
// POST accepts either:
//   * application/json  → { title, source_type, raw_content }  (paste-text)
//   * multipart/form-data → file + title + source_type            (upload)

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { ingestDocument, IngestError } from '@/lib/rag/ingest';
import { parseUpload, UnsupportedFormatError, ParseError, inferSourceType } from '@/lib/rag/parse';
import { listDocuments } from '@/lib/rag/repository';
import {
  ingestTextRequestSchema,
  isSupportedMime,
  methodologySourceTypeSchema,
  SUPPORTED_MIME_LIST,
} from '@/lib/rag/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const rows = await listDocuments({ coach_id: auth.session.coach_id });
  return jsonOk({ documents: rows });
}

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const ctype = req.headers.get('content-type') ?? '';
  try {
    if (ctype.includes('application/json')) {
      return await handleJsonIngest(req, auth.session.coach_id);
    }
    if (ctype.includes('multipart/form-data')) {
      return await handleMultipartIngest(req, auth.session.coach_id);
    }
    return jsonError(
      'unsupported_content_type',
      'Use application/json (paste text) or multipart/form-data (upload).',
      415,
    );
  } catch (err) {
    if (err instanceof IngestError) {
      const status =
        err.code === 'llm_unconfigured'
          ? 503
          : err.code === 'empty_content'
            ? 422
            : err.code === 'llm_failure'
              ? 502
              : 500;
      return jsonError(err.code, err.message, status);
    }
    throw err;
  }
}

async function handleJsonIngest(req: Request, coach_id: bigint) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be JSON', 400);
  }
  const parsed = ingestTextRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request', 400, parsed.error.flatten());
  }
  const result = await ingestDocument({
    coach_id,
    title: parsed.data.title,
    source_type: parsed.data.source_type,
    raw_content: parsed.data.raw_content,
  });
  return jsonOk(
    {
      document_id: result.document_id.toString(),
      chunk_count: result.chunk_count,
      model_tag: result.model_tag,
    },
    201,
  );
}

async function handleMultipartIngest(req: Request, coach_id: bigint) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('invalid_form', 'Could not parse multipart form', 400);
  }

  const title_raw = form.get('title');
  const file_field = form.get('file');
  const source_type_raw = form.get('source_type');

  if (!(file_field instanceof File)) {
    return jsonError('missing_file', 'Field "file" is required', 400);
  }
  if (file_field.size === 0) {
    return jsonError('empty_file', 'Uploaded file is empty', 422);
  }
  if (file_field.size > MAX_UPLOAD_BYTES) {
    return jsonError('file_too_large', `File exceeds ${MAX_UPLOAD_BYTES} bytes`, 413);
  }

  const mime = file_field.type || 'application/octet-stream';
  if (!isSupportedMime(mime)) {
    return jsonError(
      'unsupported_file_type',
      `Unsupported file type: ${mime}. Allowed: ${SUPPORTED_MIME_LIST.join(', ')}`,
      415,
    );
  }

  const title = (typeof title_raw === 'string' && title_raw.trim()) || file_field.name || 'Untitled';
  if (title.length > 400) {
    return jsonError('invalid_title', 'Title exceeds 400 characters', 400);
  }

  let source_type = inferSourceType(mime);
  if (typeof source_type_raw === 'string' && source_type_raw.length > 0) {
    const parsed = methodologySourceTypeSchema.safeParse(source_type_raw);
    if (!parsed.success) {
      return jsonError('invalid_source_type', 'Invalid source_type', 400);
    }
    source_type = parsed.data;
  }

  const buffer = Buffer.from(await file_field.arrayBuffer());

  let parsedSrc;
  try {
    parsedSrc = await parseUpload({ mime_type: mime, buffer, name: file_field.name });
  } catch (err) {
    if (err instanceof UnsupportedFormatError) {
      return jsonError('unsupported_file_type', err.message, 415);
    }
    if (err instanceof ParseError) {
      return jsonError('parse_failed', err.message, 422);
    }
    throw err;
  }

  if (!parsedSrc.text.trim()) {
    return jsonError('empty_extract', 'Extracted text was empty', 422);
  }

  const result = await ingestDocument({
    coach_id,
    title,
    source_type,
    raw_content: parsedSrc.text,
    mime_type: parsedSrc.mime_type,
    byte_size: parsedSrc.byte_size,
    file_url: null,
  });

  return jsonOk(
    {
      document_id: result.document_id.toString(),
      chunk_count: result.chunk_count,
      model_tag: result.model_tag,
    },
    201,
  );
}
