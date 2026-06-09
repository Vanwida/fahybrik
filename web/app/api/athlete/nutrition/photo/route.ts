// POST /api/athlete/nutrition/photo — estimate foods + macros from a photo.
//
// TRANSPORT: multipart/form-data with a single `image` file field (more
// efficient than base64-in-JSON: no ~33% inflation, streamed by the platform).
//   curl -F image=@plate.jpg .../api/athlete/nutrition/photo
//
// MODEL: read from env LLM_VISION_MODEL (NEW). If unset → 501 vision_not_configured.
// We NEVER pick a default model (Brain rule).
//
// PERSISTENCE: none. Returns estimated items for the athlete to CONFIRM, then
// the client POSTs the chosen entries to /api/athlete/nutrition (source='photo').

import type { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { estimateMacrosFromImage, isVisionConfigured, VisionError } from '@/lib/nutrition/vision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Guard against oversized uploads (the vision API has its own limits anyway).
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export async function POST(req: Request): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  // Env-gated: 501 with the documented contract if no vision model configured.
  if (!isVisionConfigured()) {
    return jsonError('vision_not_configured', 'Configura LLM_VISION_MODEL', 501);
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return jsonError('invalid_body', 'Send multipart/form-data with an `image` file field', 400);
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const candidate = form.get('image');
    if (candidate instanceof File) file = candidate;
  } catch {
    return jsonError('invalid_body', 'Could not parse multipart body', 400);
  }

  if (!file) return jsonError('invalid_body', 'Missing `image` file field', 400);
  if (file.size === 0) return jsonError('invalid_body', 'Empty image', 400);
  if (file.size > MAX_IMAGE_BYTES) {
    return jsonError('image_too_large', 'Image exceeds 10 MB', 413);
  }

  const mime = (file.type || 'image/jpeg').toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) {
    return jsonError('unsupported_media', `Unsupported image type: ${mime}`, 415);
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  try {
    const items = await estimateMacrosFromImage({
      image_base64: base64,
      mime_type: mime,
      athlete_id: athlete.athlete_id,
    });
    return jsonOk({ items });
  } catch (err) {
    if (err instanceof VisionError && err.code === 'unconfigured') {
      return jsonError('vision_not_configured', 'Configura LLM_VISION_MODEL', 501);
    }
    console.error('[POST /api/athlete/nutrition/photo]', err);
    return jsonError('vision_failed', 'No se pudo estimar la comida desde la foto.', 502);
  }
}
