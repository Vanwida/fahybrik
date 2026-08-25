import 'server-only';

// Cycle confirm (card 128 · hueco 6). The ONLY write of a cycle import.
// Creates a disposable microcycle for THIS coach, then hands the approved
// days to `confirmImport` — same writer as the week importer. Coverage
// below the corpus ratchet refuses the whole confirm; review stays open.
//
// HARD: callers must not feed Alex's real 12-week cycle. Tests use a
// synthetic upload and tear the rows down.

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { idSchema } from '@fahybrid/shared/schema/_primitives';
import { DAY_SUBSTITUTE_MAX, dayPrioritySchema } from '@fahybrid/shared/domain/day-intent';
import { editorSessionInputSchema } from '@fahybrid/shared/schema/program-templates';
import {
  CYCLE_IMPORT_COVERAGE_RATCHET_PCT,
  coverageAllowsConfirm,
  coverageRefuseMessage,
  type CycleCoverageSummary,
} from '@fahybrid/shared/domain/import/cycle-delivery';
import { createMonthTemplateWithEmptyWeeks } from '@/lib/dashboard/coach/program-months';
import { confirmImport, type ImportConfirmResult } from './confirm-service';
import { ImportError } from './import-shared';

const WEEK_DAY_NOTES_MAX = 800;

export const importCycleConfirmRequestSchema = z
  .object({
    mode: z.literal('cycle'),
    name: z.string().min(1).max(200),
    source_summary: z
      .object({
        total_items: z.number().int().min(0),
        detected: z.number().int().min(0),
      })
      .strict(),
    weeks: z
      .array(
        z.object({
          week_index: z.number().int().min(0).max(25),
          day_of_week: z.number().int().min(1).max(7),
          sessions: z.array(editorSessionInputSchema).min(1).max(3),
          notes: z.string().max(WEEK_DAY_NOTES_MAX).optional(),
          priority: dayPrioritySchema.optional(),
          substitute: z.string().max(DAY_SUBSTITUTE_MAX).optional(),
        }),
      )
      .min(1)
      .max(42),
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

export type ImportCycleConfirmRequest = z.infer<typeof importCycleConfirmRequestSchema>;

export function isCycleConfirmRequest(body: unknown): boolean {
  return (
    typeof body === 'object' && body !== null && (body as { mode?: unknown }).mode === 'cycle'
  );
}

export type CycleConfirmResult = ImportConfirmResult & {
  microcycle_id: string;
};

export function assertCycleCoverage(summary: CycleCoverageSummary): void {
  if (coverageAllowsConfirm(summary)) return;
  throw new ImportError(
    'coverage_below_threshold',
    coverageRefuseMessage(summary),
    400,
    { summary, ratchet_pct: CYCLE_IMPORT_COVERAGE_RATCHET_PCT },
  );
}

export async function confirmCycleImport(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
}): Promise<CycleConfirmResult> {
  const parsed = importCycleConfirmRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new ImportError('invalid_request', parsed.error.message, 400);
  }
  const req = parsed.data;
  assertCycleCoverage(req.source_summary);

  const weekCount = Math.max(...req.weeks.map((w) => w.week_index)) + 1;
  const created = await createMonthTemplateWithEmptyWeeks({
    coach_id: params.coach_id,
    payload: { name: req.name, week_count: weekCount },
    client: params.client,
  });

  const byIndex = new Map(created.weeks.map((w) => [w.week_index, w.id]));
  const mapped = req.weeks.map((entry) => {
    const target = byIndex.get(entry.week_index);
    if (!target) {
      throw new ImportError(
        'invalid_target',
        `La semana ${entry.week_index + 1} no cabe en el ciclo creado.`,
        400,
      );
    }
    return {
      target_week_template_id: target,
      day_of_week: entry.day_of_week,
      sessions: entry.sessions,
      ...(entry.notes ? { notes: entry.notes } : {}),
      ...(entry.priority ? { priority: entry.priority } : {}),
      ...(entry.substitute ? { substitute: entry.substitute } : {}),
    };
  });

  const written = await confirmImport({
    coach_id: params.coach_id,
    body: {
      microcycle_id: created.id,
      weeks: mapped,
      synonyms: req.synonyms,
    },
    client: params.client,
  });

  return { ...written, microcycle_id: created.id };
}
