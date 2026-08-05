import 'server-only';

// #28 importer — PHOTO branch. A coach's screenshots of their calendar
// (TrainingPeaks or similar), already uploaded to Blob via
// /api/coach/import/upload-url. Split out of proposal-service.ts (which
// dispatches to `buildPhotoProposal` below) to keep that file a thin
// per-mode dispatcher, same reasoning as build-proposal.ts / generate-
// proposal.ts already being their own modules. This file now only
// ORCHESTRATES: parse the request → resolve `target_week_id` against the
// real microcycle → resolve images (./photo-blob-resolve.ts) → run the
// vision call → place what was found (./photo-placement.ts) → hand off to
// buildImportProposal. Each of those pieces lives in its own module once
// this file crossed the repo's 500-line ceiling with all of them inline.
//
// Unlike the paste flow, `readWeekVision` (./vision-reader.ts) reads a WHOLE
// WEEK per screenshot — each day's position comes from the calendar image
// itself, not from a UI selector — so this mirrors the EXCEL branch (whole
// weeks in), not the single-day paste branch.
//
// PLACEMENT (2026-08-05, client-approved): the coach never declares WHAT
// they're uploading — only WHERE it starts (`target_week_id`, and optionally
// `target_weekday`). The reader already sees the day headers in the photo;
// it knows how many days there are and which ones without being told. The
// arithmetic that turns "what the reader found" into "where it lands in the
// real microciclo" is `./photo-placement.ts` — this file only resolves
// `target_week_id` against the coach's actual weeks (ownership + real order)
// and calls it. The OLD model — "every capture is one week, in order,
// starting from the first" (`start_week`, now gone) — was an invention: there
// was no way to import a loose day, three days, or land anything on week 45.
//
// INCIDENTE 2026-08-05 (producción): un coach subió una captura, la ruta
// murió con un 504 "Task timed out after 300 seconds" — el cliente esperó 5
// minutos y vio "No se pudo conectar". `head()`/`fetch()` del blob no tenían
// ninguna cota y el bucle era secuencial (ver ./photo-blob-resolve.ts para el
// arreglo completo). Este fichero añade la otra mitad: un presupuesto blando
// por debajo de los 300s del `maxDuration` (`PHOTO_BUDGET_MS`), comprobado
// entre etapas, que devuelve un error legible en español ANTES de que Vercel
// mate la función.

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { idSchema } from '@fahybrid/shared/schema/_primitives';
import { buildImportProposal, type ImportProposal, type LlmAssist } from './build-proposal';
import { buildLlmAssist } from './llm-assist';
import { readWeekVision, ImportVisionError, type WeekVisionReading } from './vision-reader';
import { visionReadingNotice } from '@/lib/dashboard/coach/ai/week-notices';
import { ImportError } from './import-shared';
import { placeImportedWeeks, type AvailableWeek } from './photo-placement';
import { resolvePhotoImages } from './photo-blob-resolve';
import { loadMonthTemplateWithWeeks } from '@/lib/dashboard/coach/program-months';

const LOG_TAG = '[import/photo]';

export const IMPORT_PHOTO_MAX_IMAGES = 10; // stays under callLlmJsonWithImage's
// own 12-images-per-turn ceiling (lib/dashboard/coach/ai/llm.ts) so a request
// that would fail the model call is rejected at validation, before we spend a
// single Blob download.

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
     *  exact upload — NEVER a client-supplied URL (see `resolvePhotoImages`,
     *  photo-blob-resolve.ts, for why accepting a URL would be unsafe). */
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
    /** REQUIRED — the real week of THIS microcycle where placement starts.
     *  `idSchema` (not a bare string) to match `confirm-service.ts`'s own
     *  `target_week_template_id` — one validation shape for the same concept
     *  everywhere it appears. Verified as this coach's own, in THIS
     *  microcycle, in `buildPhotoProposal` below — an id from the client is
     *  never trusted at face value. */
    target_week_id: idSchema,
    /** 1..7 (1=Lunes). Absent = "place the whole week as read" — each day
     *  keeps its own real weekday. Present = anchor the first day the reader
     *  found onto this weekday; see `./photo-placement.ts` for the full rule
     *  (it also covers "several days", one algorithm, not two). */
    target_weekday: z.number().int().min(1).max(7).optional(),
  })
  .strict();
export type ImportPhotoRequest = z.infer<typeof importPhotoRequestSchema>;

/** Peek the discriminant without full validation: the PHOTO branch. */
export function isPhotoRequest(body: unknown): boolean {
  return (
    typeof body === 'object' && body !== null && (body as { mode?: unknown }).mode === 'photo'
  );
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

  // Resolves ownership of BOTH the microcycle and every one of its weeks in
  // one call (program-months.ts already scopes both to coach_id) and hands
  // back the real order (`program_month_weeks.position`) — the exact thing
  // `target_week_id` needs to be checked against and sliced from. Done BEFORE
  // touching Blob or the vision model: a bad `target_week_id` fails cheap,
  // not after paying for a download + an LLM call it was always going to
  // waste.
  const month = await loadMonthTemplateWithWeeks({
    coach_id: params.coach_id,
    month_id: req.microcycle_id,
    client,
  });
  if (!month) {
    throw new ImportError('not_found', 'Este microciclo no existe o no es tuyo.', 404);
  }
  const targetIndex = month.weeks.findIndex((w) => w.id === String(req.target_week_id));
  if (targetIndex === -1) {
    throw new ImportError(
      'invalid_target',
      'La semana destino no pertenece a este microciclo.',
      400,
    );
  }
  const availableWeeks: AvailableWeek[] = month.weeks
    .slice(targetIndex)
    .map((w) => ({ id: w.id, week_index: w.week_index }));

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
    reading = await readWeekVision({ images, coach_id: params.coach_id });
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

  // WHERE it lands — the reader only said what it found; placeImportedWeeks
  // (photo-placement.ts) is the one place that turns that into real weeks of
  // THIS microcycle, per `req.target_weekday`. Throws a translated
  // `week_overflow` (422) if the photo needs more weeks than exist from
  // `target_week_id` onward — never silently truncated.
  const placedWeeks = placeImportedWeeks(reading.weeks, availableWeeks, req.target_weekday);
  console.info(`${LOG_TAG} placed`, {
    target_week_id: String(req.target_week_id),
    target_weekday: req.target_weekday ?? null,
    weeks: placedWeeks.length,
  });

  const assist =
    params.llmAssist === null ? undefined : (params.llmAssist ?? buildLlmAssist(params.coach_id));

  // Grammar + exercise resolution (parseNotationCell / resolveExercise) live
  // inside buildImportProposal (build-proposal.ts, exercise-resolve.ts) — out
  // of this file's reach, so this can only time the stage as a whole, not
  // instrument its internals.
  const resolveStartedAt = Date.now();
  const proposal = await buildImportProposal({
    coach_id: Number(params.coach_id),
    weeks: placedWeeks,
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
