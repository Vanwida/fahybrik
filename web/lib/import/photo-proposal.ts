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
//
// INCIDENTE 2026-08-05 (producción): un coach subió una captura, la ruta
// murió con un 504 "Task timed out after 300 seconds" (el `maxDuration` de
// app/api/coach/import/proposal/route.ts) — el cliente esperó 5 minutos y
// vio "No se pudo conectar". La llamada al modelo SÍ tenía cota
// (`LLM_VISION_TIMEOUT_MS`, 90s por defecto, en llm.ts); `head()` y `fetch()`
// del blob NO tenían ninguna, y el bucle era SECUENCIAL por imagen — un solo
// salto de red colgado se comía el presupuesto entero sin que el timeout del
// modelo llegara siquiera a activarse, porque esa etapa nunca se alcanzaba.
// Este fichero ahora: (1) acota TODO salto de red con su propia señal de
// aborto, (2) resuelve las imágenes EN PARALELO en vez de una a una, (3)
// mide cada etapa y lo deja en los logs (nunca `console.log`, ver abajo),
// (4) vigila un presupuesto total por debajo de los 300s del `maxDuration` y
// devuelve un error legible en español ANTES de que Vercel mate la función,
// (5) acota el TOTAL de bytes de la importación, no solo por captura — 10
// capturas de 15 MB en base64 son ~200 MB hacia el modelo, muy por encima de
// lo que cualquier proveedor acepta en un turno.

import { z } from 'zod';
import { head as blobHead } from '@vercel/blob';
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

const LOG_TAG = '[import/photo]';

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

/**
 * The AGGREGATE ceiling across every image in ONE import (not just per
 * file) — the gap the 2026-08-05 incident review surfaced. Base64 inflates
 * bytes by ~33%, and `IMPORT_PHOTO_MAX_IMAGES` (10) × `IMPORT_PHOTO_MAX_BYTES`
 * (15 MB) alone would let a request reach ~150 MB raw → ~200 MB of JSON body
 * sent to the vision model in one multimodal turn — far past what any real
 * provider accepts, and slow enough by itself to burn the whole function
 * budget before the model ever replies. 30 MB raw (~40 MB base64) still
 * covers a genuinely large batch (two full-size 15 MB photos, or 6-10 normal
 * phone-screenshot captures a few MB each) while refusing the pathological
 * case outright — checked BEFORE downloading any bytes (from `head()`'s
 * declared size), so a request over the cap never pays for the download it
 * was always going to reject.
 */
export const IMPORT_PHOTO_MAX_TOTAL_BYTES = 30 * 1024 * 1024;

/** Ceiling for ONE `head()` blob-metadata lookup. Near-instant in practice
 *  (same-infra call to our own Blob store); generous only so a genuine
 *  network hiccup doesn't false-positive. */
const HEAD_TIMEOUT_MS = 10_000;
/** Ceiling for ONE image's byte download from Blob. Bigger than HEAD_TIMEOUT_MS
 *  because it moves up to IMPORT_PHOTO_MAX_BYTES of real data, but still a
 *  hard stop — a hung connection must fail loud, never eat the function's
 *  whole `maxDuration` in silence (the incident's actual root cause). */
const DOWNLOAD_TIMEOUT_MS = 20_000;

/**
 * Soft deadline for the WHOLE photo branch (resolve blobs → download →
 * vision call → grammar/resolve), comfortably under the route's
 * `maxDuration = 300` (app/api/coach/import/proposal/route.ts) so there is
 * real margin for Vercel's own invocation overhead and response
 * serialization. Checked at each stage boundary: crossing it throws a clean,
 * translated `ImportError` instead of letting Vercel kill the function with
 * an opaque 504 the coach's client can't explain. Not a hard abort on
 * `buildImportProposal` itself (grammar + exercise resolution live in
 * build-proposal.ts / exercise-resolve.ts — out of this file's reach) — but
 * checking the budget right before that stage starts is what stops the LAST
 * leg of the chain from silently running into the wall with zero warning,
 * which is the scenario that actually paged someone.
 */
const PHOTO_BUDGET_MS = 260_000;

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

/** Injectable seams for tests — a slow/hanging network hop must be provable
 *  without a REAL 10-20s wait: a test passes tiny timeouts + a `fetchImpl`
 *  that never resolves and asserts the abort fires quickly. Production never
 *  passes this — it always gets the real constants + global `fetch`. */
export interface ResolvePhotoImagesOptions {
  headTimeoutMs?: number;
  downloadTimeoutMs?: number;
  maxTotalBytes?: number;
  fetchImpl?: typeof fetch;
}

interface BlobHeadInfo {
  pathname: string;
  url: string;
  contentType: string;
  size: number;
}

/** `AbortSignal.timeout(ms)` fires with a `TimeoutError` (a manual `.abort()`
 *  fires with `AbortError`) — either way, this hop got cut off, it wasn't
 *  told "no". Distinguishing it from a real not-found/read-failure is what
 *  makes the coach-facing message HONEST instead of just bounded: "no existe
 *  o no es tuya" is a lie when the real answer is "no dio tiempo a mirar". */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

/** One image's blob metadata, with the ownership check + a bounded `head()`.
 *  Never downloads bytes — that's a separate, later step so the AGGREGATE
 *  size check (across every image) can reject a too-big request before any
 *  bandwidth is spent. */
async function headOnePhoto(
  coach_id: number | bigint,
  pathname: string,
  blobToken: string,
  headTimeoutMs: number,
): Promise<BlobHeadInfo> {
  const owner = importPhotoPathnameOwner(pathname);
  if (owner === null || owner !== BigInt(coach_id)) {
    throw new ImportError('not_found', 'Una de las capturas no existe o no es tuya.', 404);
  }
  const startedAt = Date.now();
  let meta: { url: string; contentType: string; size: number };
  try {
    meta = await blobHead(pathname, {
      token: blobToken,
      abortSignal: AbortSignal.timeout(headTimeoutMs),
    });
  } catch (err) {
    console.info(`${LOG_TAG} head_failed`, {
      pathname,
      ms: Date.now() - startedAt,
      aborted: isAbortError(err),
      error: err instanceof Error ? err.message : String(err),
    });
    if (isAbortError(err)) {
      throw new ImportError(
        'network_timeout',
        'No se pudo comprobar una de las capturas a tiempo. Vuelve a intentarlo.',
        504,
      );
    }
    throw new ImportError('not_found', 'Una de las capturas no existe o no es tuya.', 404);
  }
  console.info(`${LOG_TAG} head`, { pathname, size_bytes: meta.size, ms: Date.now() - startedAt });
  return { pathname, url: meta.url, contentType: meta.contentType, size: meta.size };
}

/** One image's bytes, base64-encoded — bounded download, on an ALREADY
 *  size-checked blob (see `resolvePhotoImages`). */
async function downloadOnePhoto(
  info: BlobHeadInfo,
  blobToken: string,
  downloadTimeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<LlmImageInput> {
  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetchImpl(info.url, {
      headers: { authorization: `Bearer ${blobToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(downloadTimeoutMs),
    });
  } catch (err) {
    console.info(`${LOG_TAG} download_failed`, {
      pathname: info.pathname,
      ms: Date.now() - startedAt,
      aborted: isAbortError(err),
      error: err instanceof Error ? err.message : String(err),
    });
    if (isAbortError(err)) {
      throw new ImportError(
        'network_timeout',
        'La descarga de una de las capturas tardó demasiado. Vuelve a intentarlo.',
        504,
      );
    }
    throw new ImportError(
      'source_read_failed',
      'No se pudo leer una de las capturas subidas.',
      502,
    );
  }
  if (!upstream.ok) {
    console.info(`${LOG_TAG} download_bad_status`, {
      pathname: info.pathname,
      status: upstream.status,
      ms: Date.now() - startedAt,
    });
    throw new ImportError(
      'source_read_failed',
      'No se pudo leer una de las capturas subidas.',
      502,
    );
  }
  const bytes = Buffer.from(await upstream.arrayBuffer());
  console.info(`${LOG_TAG} download`, {
    pathname: info.pathname,
    bytes: bytes.length,
    ms: Date.now() - startedAt,
  });
  return { image_base64: bytes.toString('base64'), mime_type: info.contentType };
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
 *
 * HEAD → sum sizes → DOWNLOAD, all in two PARALLEL passes (not sequential —
 * the incident's actual root cause): worst-case latency is bounded by the
 * SLOWEST single hop, not the sum of N hops. The aggregate size check runs
 * between the two passes so a too-big request is rejected before a single
 * byte is downloaded.
 */
export async function resolvePhotoImages(
  coach_id: number | bigint,
  images: ImportPhotoRequest['images'],
  opts: ResolvePhotoImagesOptions = {},
): Promise<LlmImageInput[]> {
  const headTimeoutMs = opts.headTimeoutMs ?? HEAD_TIMEOUT_MS;
  const downloadTimeoutMs = opts.downloadTimeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  const maxTotalBytes = opts.maxTotalBytes ?? IMPORT_PHOTO_MAX_TOTAL_BYTES;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    throw new ImportError(
      'storage_unavailable',
      'El almacén de imágenes no está configurado.',
      503,
    );
  }

  const heads = await Promise.all(
    images.map(({ pathname }) => headOnePhoto(coach_id, pathname, blobToken, headTimeoutMs)),
  );

  for (const h of heads) {
    if (h.size > IMPORT_PHOTO_MAX_BYTES) {
      throw new ImportError('too_large', 'Una de las capturas supera el tamaño permitido.', 413);
    }
  }
  const totalBytes = heads.reduce((sum, h) => sum + h.size, 0);
  if (totalBytes > maxTotalBytes) {
    console.info(`${LOG_TAG} total_too_large`, { total_bytes: totalBytes, max: maxTotalBytes });
    throw new ImportError(
      'too_large',
      'Las capturas juntas pesan demasiado. Prueba con menos capturas o imágenes más ligeras.',
      413,
    );
  }

  return Promise.all(heads.map((h) => downloadOnePhoto(h, blobToken, downloadTimeoutMs, fetchImpl)));
}

/** Throws a clean, translated timeout error the FIRST time the running
 *  elapsed time crosses `PHOTO_BUDGET_MS` — called at each stage boundary so
 *  the coach's client gets a readable message instead of Vercel's opaque 504
 *  when the function's own `maxDuration` would otherwise kill it. */
function assertWithinBudget(startedAt: number, stage: string): void {
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs > PHOTO_BUDGET_MS) {
    console.info(`${LOG_TAG} budget_exceeded`, { stage, elapsed_ms: elapsedMs });
    throw new ImportError(
      'timeout',
      'La lectura de las capturas está tardando demasiado. Prueba con menos capturas o una imagen más ligera.',
      504,
    );
  }
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
  const startedAt = Date.now();
  const parsed = importPhotoRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new ImportError('invalid_request', parsed.error.message, 400);
  }
  const req = parsed.data;
  const client = params.client ?? defaultSql;

  await assertMicrocycleOwned(params.coach_id, req.microcycle_id, client);

  const images = await resolvePhotoImages(params.coach_id, req.images);
  console.info(`${LOG_TAG} images_resolved`, {
    count: images.length,
    ms: Date.now() - startedAt,
  });
  assertWithinBudget(startedAt, 'download');

  // `readWeekVision` (not the plain `readWeekFromImages`) so `uncertain[]`/
  // `notes` — the reader's own honesty signals about what it could NOT read
  // with confidence — survive past this function instead of being dropped.
  const visionStartedAt = Date.now();
  let reading: WeekVisionReading;
  try {
    reading = await readWeekVision({
      images,
      start_week: req.start_week,
      coach_id: params.coach_id,
    });
  } catch (err) {
    console.info(`${LOG_TAG} vision_failed`, {
      ms: Date.now() - visionStartedAt,
      error: err instanceof Error ? err.message : String(err),
    });
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
  console.info(`${LOG_TAG} vision`, {
    model: reading.model,
    weeks: reading.weeks.length,
    ms: Date.now() - visionStartedAt,
  });
  assertWithinBudget(startedAt, 'vision');

  if (reading.weeks.length === 0) {
    throw new ImportError(
      'empty_reading',
      'No se ha reconocido ningún entreno en las capturas.',
      422,
    );
  }

  const assist =
    params.llmAssist === null ? undefined : (params.llmAssist ?? buildLlmAssist(params.coach_id));

  // Grammar + exercise resolution (parseNotationCell / resolveExercise) live
  // inside buildImportProposal (build-proposal.ts, exercise-resolve.ts) — out
  // of this file's reach, so this can only time the stage as a whole, not
  // instrument its internals.
  const resolveStartedAt = Date.now();
  const proposal = await buildImportProposal({
    coach_id: Number(params.coach_id),
    weeks: reading.weeks,
    llmAssist: assist,
    client,
  });
  console.info(`${LOG_TAG} grammar_resolve`, {
    items: proposal.summary.total_items,
    ms: Date.now() - resolveStartedAt,
  });

  console.info(`${LOG_TAG} total`, { ms: Date.now() - startedAt });

  // Surface what the model flagged as uncertain (or any free note about the
  // capture) the SAME way the generate branch surfaces its own honesty
  // signals — `ImportProposal.notices`, never silently dropped.
  const notice = visionReadingNotice(reading.uncertain, reading.notes);
  if (!notice) return proposal;
  return { ...proposal, notices: [...(proposal.notices ?? []), notice] };
}
