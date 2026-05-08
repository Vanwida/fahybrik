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
import { jsonError, jsonOk } from '@/lib/api/responses';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { storeAttachment, UploadError } from '@/lib/chat/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
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
  // target_athlete_id (blob path uses that).
  let folderAthleteId: bigint;
  if (principal.role === 'athlete') {
    folderAthleteId = principal.athlete_id;
  } else {
    const target = form.get('athlete_id');
    if (typeof target !== 'string' || !/^\d+$/.test(target)) {
      return jsonError('missing_athlete_id', 'athlete_id required for coach uploads', 400);
    }
    folderAthleteId = BigInt(target);
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
