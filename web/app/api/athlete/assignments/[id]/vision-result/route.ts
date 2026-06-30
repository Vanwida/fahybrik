// POST /api/athlete/assignments/[id]/vision-result — Idea 1: the athlete uploads
// a SCREENSHOT of another app's workout summary (Concept2 PM5 · Garmin · Coros ·
// Strava · Apple); a multimodal LLM reads it and maps the numbers onto our
// canonical execution model. The handler knows what the workout PRESCRIBED (from
// the assignment's prescription) and feeds that as context so the IA places each
// value in its slot.
//
// TRANSPORT: multipart/form-data
//   - `image` (File, required): the screenshot.
//   - `app`   (string, optional): which app it came from — one of
//     concept2|garmin|coros|strava|apple|other (drives the prompt hint +
//     provenance stamp).
//   curl -F image=@pm5.jpg -F app=concept2 .../assignments/123/vision-result
//
// MODEL: env LLM_VISION_MODEL ?? LLM_MODEL. Unset → 501 (we never pick a default).
//
// PERSISTENCE: NONE. Returns a PROPOSAL with per-field honesty
// ({ value, confidence:'detected'|'review', source }) plus a ready-to-confirm
// `proposed_execution` in the recordWorkoutExecution shape. The athlete reviews/
// corrects, then POSTs the confirmed values to /api/sync/workout-execution.

import { z } from 'zod';
import type { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { sql } from '@/lib/db';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import {
  captureAppSchema,
  extractWorkoutResultFromImage,
  isWorkoutVisionConfigured,
  WorkoutVisionError,
} from '@/lib/sync/workout-vision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vision APIs cap upload size anyway; guard early to avoid buffering huge bodies.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const idParamSchema = z.coerce.bigint();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  if (!isWorkoutVisionConfigured()) {
    return jsonError('vision_not_configured', 'Configura LLM_VISION_MODEL o LLM_MODEL', 501);
  }

  const { id } = await ctx.params;
  const idParsed = idParamSchema.safeParse(id);
  if (!idParsed.success) return jsonError('invalid_request', 'Invalid assignment id', 400);

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return jsonError('invalid_body', 'Send multipart/form-data with an `image` file field', 400);
  }

  let file: File | null = null;
  let app: z.infer<typeof captureAppSchema> | null = null;
  try {
    const form = await req.formData();
    const candidate = form.get('image');
    if (candidate instanceof File) file = candidate;
    const appRaw = form.get('app');
    if (typeof appRaw === 'string' && appRaw.trim()) {
      const a = captureAppSchema.safeParse(appRaw.trim().toLowerCase());
      if (a.success) app = a.data;
    }
  } catch {
    return jsonError('invalid_body', 'Could not parse multipart body', 400);
  }

  if (!file) return jsonError('invalid_body', 'Missing `image` file field', 400);
  if (file.size === 0) return jsonError('invalid_body', 'Empty image', 400);
  if (file.size > MAX_IMAGE_BYTES) return jsonError('image_too_large', 'Image exceeds 10 MB', 413);

  const mime = (file.type || 'image/jpeg').toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) {
    return jsonError('unsupported_media', `Unsupported image type: ${mime}`, 415);
  }

  // Ownership-scoped: loadAssignmentDetail returns null if the assignment isn't
  // the calling athlete's (or doesn't exist) → 404 (no existence leak).
  const detail = await loadAssignmentDetail({
    sql,
    athlete_id: athlete.athlete_id,
    assignment_id: idParsed.data,
  });
  if (!detail) return jsonError('not_found', 'Assignment not found', 404);

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  try {
    const proposal = await extractWorkoutResultFromImage({
      detail,
      image_base64: base64,
      mime_type: mime,
      app,
      athlete_id: athlete.athlete_id,
    });
    return jsonOk(proposal);
  } catch (err) {
    if (err instanceof WorkoutVisionError && err.code === 'unconfigured') {
      return jsonError('vision_not_configured', 'Configura LLM_VISION_MODEL o LLM_MODEL', 501);
    }
    console.error('[POST /api/athlete/assignments/[id]/vision-result]', err);
    return jsonError('vision_failed', 'No se pudo leer la captura del entreno.', 502);
  }
}
