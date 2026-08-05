import 'server-only';

// #28 importer — PHOTO branch. A coach's screenshots of their calendar
// (TrainingPeaks or similar), already uploaded to Blob via
// /api/coach/import/upload-url. Split out of proposal-service.ts (which
// dispatches to `buildPhotoProposal` below) to keep that file a thin
// per-mode dispatcher, same reasoning as build-proposal.ts / generate-
// proposal.ts already being their own modules.
//
// Unlike the paste flow, `readWeekVision` (./vision-reader.ts) reads a WHOLE
// WEEK per screenshot — each day's position comes from the calendar image
// itself, not from a UI selector — so this mirrors the EXCEL branch (whole
// weeks in), not the single-day paste branch. There is deliberately no
// `target_weekday` here: nothing downstream would consume it.

import { z } from 'zod';
import { head } from '@vercel/blob';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { idSchema } from '@fahybrid/shared/schema/_primitives';
import { buildImportProposal, type ImportProposal, type LlmAssist } from './build-proposal';
import { buildLlmAssist } from './llm-assist';
import {
  readWeekVision,
  ImportVisionError,
  type LlmImageInput,
  type WeekVisionReading,
} from './vision-reader';
import { visionReadingNotice } from '@/lib/dashboard/coach/ai/week-notices';
import { ImportError, assertMicrocycleOwned } from './import-shared';

export const IMPORT_PHOTO_MAX_IMAGES = 10; // stays under callLlmJsonWithImage's
// own 12-images-per-turn ceiling (lib/dashboard/coach/ai/llm.ts) so a request
// that would fail the model call is rejected at validation, before we spend a
// single Blob download.

/**
 * Per-file size ceiling — a high-resolution screenshot or camera photo of a
 * week's calendar rarely exceeds a few MB; 15 MB leaves generous headroom
 * without inviting a client to disguise video as "an image". THE SAME
 * constant signs the upload (upload-url/route.ts imports it) and re-checks
 * the downloaded blob's real size here (`resolvePhotoImages`) — one source of
 * truth for the two touchpoints of the same limit.
 */
export const IMPORT_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

const importPhotoImageSchema = z
  .object({
    /** The pathname /api/coach/import/upload-url returned after signing that
     *  exact upload — NEVER a client-supplied URL (see `resolvePhotoImages`
     *  below for why accepting a URL would be unsafe). */
    pathname: z.string().min(1).max(500),
  })
  .strict();

export const importPhotoRequestSchema = z
  .object({
    microcycle_id: idSchema,
    mode: z.literal('photo'),
    /** In visual/reading order — vision-reader treats the array as ONE
     *  ordered read, not N independent ones. */
    images: z.array(importPhotoImageSchema).min(1).max(IMPORT_PHOTO_MAX_IMAGES),
    /**
     * Which week number the FIRST screenshot represents; later screenshots
     * read as consecutive weeks. Purely cosmetic labelling for the review
     * grid — same as the paste flow's `week: 1` — because the coach maps
     * each read week to a real week_template_id explicitly at /confirm
     * (Fork B). Left unset, a multi-week photo batch would always be labelled
     * "Semana 1, Semana 2…" regardless of which real weeks were photographed.
     */
    start_week: z.number().int().positive().max(52).optional(),
  })
  .strict();
export type ImportPhotoRequest = z.infer<typeof importPhotoRequestSchema>;

/** Peek the discriminant without full validation: the PHOTO branch. */
export function isPhotoRequest(body: unknown): boolean {
  return (
    typeof body === 'object' && body !== null && (body as { mode?: unknown }).mode === 'photo'
  );
}

/**
 * The coach_id folder segment of an `import-photos/<coach_id>/…` pathname —
 * the same convention `athleteIdFromPathname` uses for `chat/<athlete_id>/…`
 * (lib/chat/upload.ts). `/api/coach/import/upload-url` is the ONLY writer of
 * this prefix (it derives it from the signed-in coach's own session), so a
 * pathname whose owner segment doesn't match the CALLING coach's id can only
 * mean one of two things: a stale/foreign pathname, or a client trying to
 * reference an image it never uploaded. Either way: reject, never resolve it.
 */
export function importPhotoPathnameOwner(pathname: string): bigint | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 5 || segments[0] !== 'import-photos') return null;
  const idSeg = segments[1];
  if (!idSeg || !/^\d+$/.test(idSeg)) return null;
  try {
    return BigInt(idSeg);
  } catch {
    return null;
  }
}

/**
 * Turns the coach's already-uploaded pathnames into the base64 images
 * `readWeekVision` consumes.
 *
 * WHY A PATHNAME AND NEVER A URL: if this accepted a client-supplied URL, the
 * endpoint would become a proxy that fetches WHATEVER host the client names —
 * a classic SSRF hole, and worse here because the fetched bytes get forwarded
 * on to an LLM call. A pathname closes it two ways: (1) `head()` below is an
 * AUTHENTICATED call to Vercel Blob's API scoped by our own token — it can
 * only ever resolve an object inside OUR store, never an arbitrary external
 * host, no matter what string is passed; (2) the `import-photos/<coach_id>/…`
 * prefix — written only by upload-url, from the session, never the client —
 * is checked against the CALLING coach before we even ask Blob, so one coach
 * can't reference another coach's upload either. Outside our store: nothing
 * resolves. Inside it: only the caller's own.
 */
async function resolvePhotoImages(
  coach_id: number | bigint,
  images: ImportPhotoRequest['images'],
): Promise<LlmImageInput[]> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    throw new ImportError(
      'storage_unavailable',
      'El almacén de imágenes no está configurado.',
      503,
    );
  }

  const out: LlmImageInput[] = [];
  for (const { pathname } of images) {
    const owner = importPhotoPathnameOwner(pathname);
    if (owner === null || owner !== BigInt(coach_id)) {
      throw new ImportError('not_found', 'Una de las capturas no existe o no es tuya.', 404);
    }

    let meta: { url: string; contentType: string; size: number };
    try {
      meta = await head(pathname, { token: blobToken });
    } catch {
      throw new ImportError('not_found', 'Una de las capturas no existe o no es tuya.', 404);
    }
    if (meta.size > IMPORT_PHOTO_MAX_BYTES) {
      throw new ImportError('too_large', 'Una de las capturas supera el tamaño permitido.', 413);
    }

    const upstream = await fetch(meta.url, {
      headers: { authorization: `Bearer ${blobToken}` },
      cache: 'no-store',
    });
    if (!upstream.ok) {
      throw new ImportError(
        'source_read_failed',
        'No se pudo leer una de las capturas subidas.',
        502,
      );
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    out.push({ image_base64: bytes.toString('base64'), mime_type: meta.contentType });
  }
  return out;
}

/**
 * PHOTO branch. Resolves the coach's already-uploaded screenshots, runs the
 * vision reader, and feeds the SAME `ImportedWeek[]` intermediate the
 * Excel/paste branches produce into `buildImportProposal()` — no parallel
 * pipeline. Saves nothing.
 */
export async function buildPhotoProposal(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
  llmAssist?: LlmAssist | null;
}): Promise<ImportProposal> {
  const parsed = importPhotoRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new ImportError('invalid_request', parsed.error.message, 400);
  }
  const req = parsed.data;
  const client = params.client ?? defaultSql;

  await assertMicrocycleOwned(params.coach_id, req.microcycle_id, client);

  const images = await resolvePhotoImages(params.coach_id, req.images);

  // `readWeekVision` (not the plain `readWeekFromImages`) so `uncertain[]`/
  // `notes` — the reader's own honesty signals about what it could NOT read
  // with confidence — survive past this function instead of being dropped.
  let reading: WeekVisionReading;
  try {
    reading = await readWeekVision({
      images,
      start_week: req.start_week,
      coach_id: params.coach_id,
    });
  } catch (err) {
    if (err instanceof ImportVisionError) {
      if (err.code === 'unconfigured') {
        throw new ImportError('vision_not_configured', 'Configura LLM_VISION_MODEL.', 501);
      }
      if (err.code === 'invalid_request') {
        // 0 images or > the reader's own per-turn cap — a malformed request,
        // not an upstream failure (defense in depth: our own Zod schema above
        // already keeps `images` in 1..IMPORT_PHOTO_MAX_IMAGES, itself under
        // the reader's ceiling, so this should never actually fire).
        throw new ImportError('invalid_request', err.message, 400);
      }
      // 'http' | 'empty' | 'invalid_json' — the vision provider failed or
      // returned something we couldn't parse: an UPSTREAM failure, not ours.
      throw new ImportError('vision_failed', 'No se pudo leer alguna de las capturas.', 502);
    }
    const message = err instanceof Error ? err.message : 'No se pudo leer la captura.';
    throw new ImportError('vision_failed', message, 502);
  }

  if (reading.weeks.length === 0) {
    throw new ImportError(
      'empty_reading',
      'No se ha reconocido ningún entreno en las capturas.',
      422,
    );
  }

  const assist =
    params.llmAssist === null ? undefined : (params.llmAssist ?? buildLlmAssist(params.coach_id));

  const proposal = await buildImportProposal({
    coach_id: Number(params.coach_id),
    weeks: reading.weeks,
    llmAssist: assist,
    client,
  });

  // Surface what the model flagged as uncertain (or any free note about the
  // capture) the SAME way the generate branch surfaces its own honesty
  // signals — `ImportProposal.notices`, never silently dropped.
  const notice = visionReadingNotice(reading.uncertain, reading.notes);
  if (!notice) return proposal;
  return { ...proposal, notices: [...(proposal.notices ?? []), notice] };
}
