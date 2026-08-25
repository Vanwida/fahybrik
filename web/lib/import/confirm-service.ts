import 'server-only';

// #28 — CONFIRM service. The coach reviewed the typed proposal, fixed the amber
// lines and resolved every out-of-catalog exercise; this WRITES the approved days
// into the microcycle's week templates. It is the ONLY step that persists.
//
// SACRED RULE: nothing untyped/unresolved is ever saved. A line whose exercise
// did not resolve (exercise_id === null) makes the WHOLE confirm fail (400, with
// the offending lines listed) — never a partial write, never a fabricated success.
//
// FORK B — the week mapping is EXPLICIT in the body (each entry names its
// `target_week_template_id`); we NEVER infer or auto-fit. We only verify each
// target belongs to THIS microcycle (which belongs to the coach).
//
// IDEMPOTENCE: writing a day REPLACES that day's content (the confirm is the
// coach's explicit act). Re-confirming the same range overwrites, never duplicates.
//
// REUSE: the day write is the exact #33 path — `serializeDay` +
// `mergeDayIntoDays` + `upsertWeekTemplate` — so an imported day is byte-for-byte
// a hand-authored day. On resolve, `learnSynonym` teaches the coach's notation so
// the same token resolves itself next time.

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { idSchema } from '@fahybrid/shared/schema/_primitives';
import { DAY_SUBSTITUTE_MAX, dayPrioritySchema } from '@fahybrid/shared/domain/day-intent';
import {
  editorSessionInputSchema,
  type EditorSessionInput,
  type WeekDay,
} from '@fahybrid/shared/schema/program-templates';
import { itemHasExercise } from '@/lib/dashboard/v2/item-validity';
import { serializeDay, mergeDayIntoDays } from '@/lib/dashboard/v2/editor-serialize';
import {
  getWeekTemplate,
  upsertWeekTemplate,
} from '@/lib/dashboard/coach/program-weeks';
import { loadMonthTemplateWithWeeks } from '@/lib/dashboard/coach/program-months';
import { invisibleExerciseIds } from '@/lib/exercises/coach-override';
import { learnSynonym } from './exercise-resolve';
import { ImportError } from './proposal-service';

/** El tope de `WeekDay.notes` (shared/schema/program-templates.ts). Se repite aquí
 *  para poder rechazar pronto, con el mismo número. */
const WEEK_DAY_NOTES_MAX = 800;

/**
 * Junta la nota que traía la importación con la que el día YA tenía.
 *
 * LA REGLA, y su porqué: lo que escribió el coach no se pierde nunca. Una nota
 * suya puede llevar meses ahí y el importador no tiene ninguna autoridad para
 * machacarla, así que se AÑADE debajo en vez de sustituirla.
 *
 *   1. sin nota importada          → la existente, intacta.
 *   2. sin nota existente          → la importada.
 *   3. la existente YA la contiene → la existente, intacta. Reimportar la misma
 *      semana dos veces no duplica el texto.
 *   4. las dos, distintas          → existente + la importada debajo.
 *   5. si eso pasa del tope        → la EXISTENTE, intacta. Lo que se cae es lo
 *      importado, nunca lo suyo: es la regla de arriba llevada al caso límite.
 */
export function mergeDayNote(
  existing: string | undefined,
  imported: string | undefined,
): string | undefined {
  const mine = existing?.trim() ?? '';
  const theirs = imported?.trim() ?? '';
  if (!theirs) return existing;
  if (!mine) return theirs.slice(0, WEEK_DAY_NOTES_MAX);
  if (mine.includes(theirs)) return existing;
  const merged = `${mine}\n\n${theirs}`;
  return merged.length > WEEK_DAY_NOTES_MAX ? existing : merged;
}

export const importConfirmRequestSchema = z
  .object({
    microcycle_id: idSchema,
    /** Each reviewed day, EXPLICITLY mapped to a week template of the microcycle. */
    weeks: z
      .array(
        z.object({
          target_week_template_id: idSchema,
          day_of_week: z.number().int().min(1).max(7),
          /**
           * Las sesiones del día. Array porque un día puede llevar DOBLE SESIÓN
           * (am+pm) y el coach la pide con esas palabras; el slot es posicional,
           * igual que en `slots_json`. Con `min(1)`: un día sin sesiones no se
           * manda (eso es un descanso, y un descanso no se escribe).
           */
          sessions: z.array(editorSessionInputSchema).min(1).max(3),
          /**
           * Lo que la fuente traía y no era entreno («Semana 12», «Control test
           * salto»). Va a `WeekDay.notes`, que es donde ese concepto ya vive. El
           * tope es el del esquema del día: una nota más larga se rechaza aquí y
           * no revienta la validación del slot a mitad de escritura.
           */
          notes: z.string().max(WEEK_DAY_NOTES_MAX).optional(),
          /** Prioridad de poda del día. Ausente = no se toca el original. */
          priority: dayPrioritySchema.optional(),
          /** Sustituto declarado del día. Ausente = no se toca el original. */
          substitute: z.string().max(DAY_SUBSTITUTE_MAX).optional(),
        }),
      )
      .min(1)
      .max(84), // up to 12 weeks × 7 days
    /**
     * The coach's resolutions to learn: the original notation token → the catalog
     * exercise he picked for it. Learned per-coach so the token resolves itself
     * next import ("aprende su notación"). Decoupled from the session shape so the
     * saved day stays exactly the #33 shape.
     */
    synonyms: z
      .array(
        z.object({
          term: z.string().min(1).max(200),
          exercise_id: idSchema,
        }),
      )
      .max(300)
      .optional()
      .default([]),
  })
  .strict();

export type ImportConfirmRequest = z.infer<typeof importConfirmRequestSchema>;

export interface ImportConfirmResult {
  written: Array<{ week_template_id: string; days: number[] }>;
  learned: number;
}

/** An offending line (unresolved exercise) for the honest 400 payload. */
interface UnresolvedLine {
  target_week_template_id: string;
  day_of_week: number;
  block_title: string;
  exercise_name: string;
}

function collectUnresolved(req: ImportConfirmRequest): UnresolvedLine[] {
  const out: UnresolvedLine[] = [];
  for (const entry of req.weeks) {
    for (const block of entry.sessions.flatMap((s) => s.blocks)) {
      for (const item of block.items) {
        if (!itemHasExercise(item)) {
          out.push({
            target_week_template_id: String(entry.target_week_template_id),
            day_of_week: entry.day_of_week,
            block_title: block.title,
            exercise_name: item.exercise_name || '(sin nombre)',
          });
        }
      }
    }
  }
  return out;
}

/**
 * Persist the coach-approved days into their mapped week templates. Reads
 * (ownership + current slots) run first with the base client; the writes (day
 * upserts + synonym learning) run in ONE transaction so a confirm is atomic.
 */
export async function confirmImport(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
}): Promise<ImportConfirmResult> {
  const parsed = importConfirmRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new ImportError('invalid_request', parsed.error.message, 400);
  }
  const req = parsed.data;
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);

  // Ownership + the set of week templates that legitimately belong to the microcycle.
  const month = await loadMonthTemplateWithWeeks({
    coach_id,
    month_id: Number(req.microcycle_id),
    client,
  });
  if (!month) {
    throw new ImportError('not_found', 'Este microciclo no existe o no es tuyo.', 404);
  }
  const ownedWeekIds = new Set(month.weeks.map((w) => w.id));

  // FORK B — every target must be a real week of THIS microcycle. No auto-fit.
  for (const entry of req.weeks) {
    if (!ownedWeekIds.has(String(entry.target_week_template_id))) {
      throw new ImportError(
        'invalid_target',
        `La semana destino ${entry.target_week_template_id} no pertenece a este microciclo.`,
        400,
      );
    }
  }

  // SACRED — never save an unresolved line. Fail the whole confirm, list them.
  const unresolved = collectUnresolved(req);
  if (unresolved.length > 0) {
    throw new ImportError(
      'unresolved_lines',
      unresolved.length === 1
        ? '1 línea sin ejercicio del catálogo. Resuélvela antes de confirmar.'
        : `${unresolved.length} líneas sin ejercicio del catálogo. Resuélvelas antes de confirmar.`,
      400,
      { lines: unresolved },
    );
  }

  // Every synonym target must be an exercise this coach may see — a synonym is a
  // WRITE that, once learned, wins on EVERY future import (layer 1 of the
  // cascade), so an unchecked exercise_id would teach a mapping into another
  // coach's exercise. Refuse BEFORE learning any of them (same "gate, then act"
  // shape as the two checks above).
  const invalidSynonymIds = await invisibleExerciseIds(
    client,
    coach_id,
    req.synonyms.map((s) => Number(s.exercise_id)),
  );
  if (invalidSynonymIds.length > 0) {
    throw new ImportError(
      'invalid_synonym_exercise',
      invalidSynonymIds.length === 1
        ? '1 sinónimo señala un ejercicio que no existe o no es tuyo.'
        : `${invalidSynonymIds.length} sinónimos señalan ejercicios que no existen o no son tuyos.`,
      404,
    );
  }

  // Group entries by target week so several imported days land in ONE week upsert
  // (each day REPLACES its slot; the week's other days are preserved).
  const byWeek = new Map<string, ImportConfirmRequest['weeks']>();
  for (const entry of req.weeks) {
    const key = String(entry.target_week_template_id);
    const list = byWeek.get(key) ?? [];
    list.push(entry);
    byWeek.set(key, list);
  }

  // Build each week's next slots_json from its CURRENT content (read outside the
  // tx, matching the copyWeekContentInto pattern) + the approved days merged in.
  const writes: Array<{
    week_id: number;
    payload: {
      name: string;
      focus: string | null;
      coach_notes: string | null;
      slots_json: { days: WeekDay[] };
    };
    days: number[];
  }> = [];

  for (const [weekIdStr, entries] of byWeek) {
    const week = await getWeekTemplate({ coach_id, id: Number(weekIdStr), client });
    if (!week) {
      throw new ImportError('not_found', `Semana ${weekIdStr} no encontrada.`, 404);
    }
    let days = week.slots_json.days;
    for (const entry of entries) {
      const original: WeekDay =
        days.find((d) => d.day_of_week === entry.day_of_week) ?? {
          day_of_week: entry.day_of_week,
          sessions: [],
        };
      const nextDay = serializeDay({
        day_of_week: entry.day_of_week,
        sessions: entry.sessions as EditorSessionInput[],
        original,
        ...(entry.priority !== undefined ? { priority: entry.priority } : {}),
        ...(entry.substitute !== undefined ? { substitute: entry.substitute } : {}),
      });
      // `serializeDay` conserva la nota original (parte de `...original`); esto solo
      // añade la que traía la fuente, sin machacar la del coach. Ver `mergeDayNote`.
      const notes = mergeDayNote(original.notes, entry.notes);
      if (notes) nextDay.notes = notes;
      else delete nextDay.notes;
      days = mergeDayIntoDays(days, nextDay);
    }
    writes.push({
      week_id: Number(weekIdStr),
      payload: {
        name: week.name,
        focus: week.focus,
        coach_notes: week.coach_notes,
        slots_json: { days },
      },
      days: entries.map((e) => e.day_of_week).sort((a, b) => a - b),
    });
  }

  // Atomic: all day upserts + all synonym learning succeed together, or none.
  await client.begin(async (tx) => {
    for (const w of writes) {
      await upsertWeekTemplate({
        coach_id,
        id: w.week_id,
        payload: w.payload,
        client: tx,
      });
    }
    for (const s of req.synonyms) {
      await learnSynonym(coach_id, s.term, Number(s.exercise_id), tx);
    }
  });

  return {
    written: writes.map((w) => ({ week_template_id: String(w.week_id), days: w.days })),
    learned: req.synonyms.length,
  };
}
