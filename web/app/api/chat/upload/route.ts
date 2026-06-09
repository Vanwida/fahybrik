// POST /api/chat/upload
//
// Multipart upload. Form fields:
//   * file (binary) — required
//   * kind  — 'voice' | 'video' | 'image' | 'file' (required)
//   * filename — original name (optional, used for extension inference)
//
// Auth: principal must be coach (uploads for any of their athletes) or
// athlete (uploads to their own thread). The athlete_id of the resulting
// blob path is derived from principal so attackers can't write to other
// athletes' folders.
//
// Returns: { url, mime_type, size_bytes, kind }. Caller then sends a
// chat message with attachment_url + attachment_kind.

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { MAX_BYTES_BY_KIND, storeAttachment, UploadError } from '@/lib/chat/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// M14: hard ceiling on the request body, checked from the Content-Length header
// BEFORE `req.formData()` buffers the whole payload into memory (a DoS vector).
// The largest per-kind blob limit is video (200MB); add headroom for multipart
// boundaries + the other form fields so a legitimate max-size upload isn't
// rejected at the gate. Per-kind limits are still enforced afterwards in
// storeAttachment.
const MAX_UPLOAD_BYTES = Math.max(...Object.values(MAX_BYTES_BY_KIND)) + 1 * 1024 * 1024;

export async function POST(req: Request): Promise<NextResponse> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  // Early size guard: reject oversized uploads before reading the body so a
  // malicious client can't force us to buffer gigabytes into memory.
  const contentLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return jsonError(
      'payload_too_large',
      `Upload exceeds the maximum allowed size of ${MAX_UPLOAD_BYTES} bytes`,
      413,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('invalid_form', 'Expected multipart/form-data', 400);
  }
  const file = form.get('file');
  const kindRaw = form.get('kind');
  const filenameOverride = form.get('filename');
  if (!(file instanceof File)) {
    return jsonError('missing_file', 'No file uploaded', 400);
  }
  if (typeof kindRaw !== 'string') {
    return jsonError('missing_kind', 'kind field required', 400);
  }

  // Athlete uploads to their own thread; coach uploads must specify
  // target_athlete_id (blob path uses that) AND that athlete must belong to
  // the coach's cohort.
  let folderAthleteId: bigint;
  if (principal.role === 'athlete') {
    // Ignore any athlete_id in the form — an athlete can only write to their
    // own folder.
    folderAthleteId = principal.athlete_id;
  } else {
    const target = form.get('athlete_id');
    if (typeof target !== 'string' || !/^\d+$/.test(target)) {
      return jsonError('missing_athlete_id', 'athlete_id required for coach uploads', 400);
    }
    folderAthleteId = BigInt(target);

    // Ownership check: the coach may only upload into the folder of an athlete
    // assigned to them. A non-matching id is treated as not-found (404) so we
    // don't disclose the existence of other coaches' athletes.
    const owns = await sql<Array<{ n: number }>>`
      select count(*)::int as n from athletes
      where id = ${folderAthleteId as unknown as number}
        and coach_id = ${principal.coach_id as unknown as number}
    `;
    if ((owns[0]?.n ?? 0) === 0) {
      return jsonError('not_found', 'Athlete not found', 404);
    }
  }

  const filename = typeof filenameOverride === 'string' && filenameOverride.length > 0
    ? filenameOverride
    : file.name || `upload.${kindRaw}`;
  const arrayBuf = await file.arrayBuffer();

  try {
    const result = await storeAttachment({
      athlete_id: folderAthleteId,
      kind: kindRaw,
      filename,
      mime_type: file.type || 'application/octet-stream',
      bytes: Buffer.from(arrayBuf),
    });
    return jsonOk(result, 201);
  } catch (err) {
    if (err instanceof UploadError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
