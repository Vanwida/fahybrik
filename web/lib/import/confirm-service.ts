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
import { visibleToCoach } from '@/lib/exercises/coach-override';
import { learnSynonym } from './exercise-resolve';
import { ImportError } from './proposal-service';

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

/**
 * Verify every synonym's `exercise_id` is one this coach may actually see (base
 * catalog or their own PROPIO) — a synonym is a WRITE that, once learned, wins on
 * EVERY future import (layer 1 of the cascade), so an unchecked exercise_id would
 * let a crafted confirm teach a mapping into another coach's exercise. Returns the
 * ids that are NOT visible (either they don't exist, or they belong to another
 * coach) — the caller turns both into the same rejection, never revealing which.
 */
async function findInvisibleExerciseIds(
  client: Sql,
  coach_id: number,
  ids: number[],
): Promise<number[]> {
  if (ids.length === 0) return [];
  const unique = Array.from(new Set(ids));
  const visible = await client<Array<{ id: string }>>`
    select e.id::text as id
    from exercises e
    where e.id = any(${unique}::bigint[])
      and ${visibleToCoach(client, coach_id)}
  `;
  const visibleIds = new Set(visible.map((r) => Number(r.id)));
  return unique.filter((id) => !visibleIds.has(id));
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

  // Every synonym target must be an exercise this coach may see — refuse BEFORE
  // learning any of them (same "gate, then act" shape as the two checks above).
  const invalidSynonymIds = await findInvisibleExerciseIds(
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
      });
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
