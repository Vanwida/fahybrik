import 'server-only';

// #28 — PROPOSAL service. The request-shaped wrapper around the tested
// orchestrator (`buildImportProposal`): it validates the coach's request, checks
// microcycle ownership, RESOLVES the source (uploaded xlsx / pasted text /
// Pablo's canonical workbook), and runs the grammar+resolver+LLM pipeline into a
// typed per-day proposal. It SAVES NOTHING — the coach reviews the proposal and
// only the separate CONFIRM step writes.
//
// Thin route wrapper on top (`app/api/coach/import/proposal/route.ts`) adds only
// the session + JSON responses, mirroring `suggestWorkout`'s service/route split
// so this stays unit-testable with a real DB client and no HTTP.

import { tmpdir } from 'node:os';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { idSchema } from '@fahybrid/shared/schema/_primitives';
import { buildImportProposal, type ImportProposal, type LlmAssist } from './build-proposal';
import { parseWeekRange } from './range-parse';
import { readPlanWorkbook, parsePastedText, type ImportedWeek } from './xlsx-reader';
import { buildLlmAssist } from './llm-assist';

export class ImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export const importVariantSchema = z.enum(['estandar', 'fuerza', 'resistencia']);
export type ImportVariant = z.infer<typeof importVariantSchema>;

export const importProposalRequestSchema = z
  .object({
    microcycle_id: idSchema,
    variant: importVariantSchema,
    range_text: z.string().min(1).max(200),
    /** A single day pasted instead of pointing at the xlsx. */
    pasted_text: z.string().max(20_000).optional(),
    /** Base64 of the coach's uploaded workbook (preferred source). */
    xlsx_base64: z.string().min(1).max(80_000_000).optional(),
  })
  .strict();

export type ImportProposalRequest = z.infer<typeof importProposalRequestSchema>;

// Pablo's canonical 12-week workbook, used only when the coach neither uploads a
// file nor pastes text (the demo convenience path). Same location the read tests
// resolve. process.cwd() is the `web/` package dir → repo-root /docs.
const CANONICAL_XLSX = resolve(process.cwd(), '..', 'docs', 'Plantilla_HYROX_12sem (1) 2.xlsx');

// Display name for a 1..7 day index (only needed for the pasted-text path, where
// the day may be unknown). Kept local — the reader owns the xlsx mapping.
const DAY_DISPLAY = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

async function assertMicrocycleOwned(
  coach_id: number | bigint,
  microcycle_id: number | bigint,
  client: Sql,
): Promise<void> {
  const rows = await client<Array<{ id: string }>>`
    select id::text from program_month_templates
    where id = ${Number(microcycle_id)} and coach_id = ${Number(coach_id)}
    limit 1
  `;
  if (!rows[0]) {
    throw new ImportError('not_found', 'Este microciclo no existe o no es tuyo.', 404);
  }
}

/**
 * Read the source into `ImportedWeek[]`. Precedence: uploaded xlsx → pasted text →
 * canonical workbook. Pasted text yields ONE day (the reader lifts a leading day
 * name); the coach re-maps the target day/week explicitly at confirm (Fork B).
 */
async function readSource(
  req: ImportProposalRequest,
  weekNums: number[],
): Promise<ImportedWeek[]> {
  if (req.xlsx_base64) {
    const tmp = join(
      tmpdir(),
      `fahybrik-import-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`,
    );
    try {
      writeFileSync(tmp, Buffer.from(req.xlsx_base64, 'base64'));
      return await readPlanWorkbook(tmp, req.variant, weekNums);
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        // temp cleanup is best-effort.
      }
    }
  }

  if (req.pasted_text && req.pasted_text.trim()) {
    const pasted = parsePastedText(req.pasted_text);
    const week = weekNums[0] ?? 1;
    const dow = pasted.day_of_week ?? 1;
    return [
      {
        week,
        sheet: 'pegado',
        fell_back: false,
        days: [
          {
            day_of_week: dow,
            dow: pasted.dow ?? DAY_DISPLAY[dow - 1]!,
            stimulus: pasted.stimulus,
            session_text: pasted.session_text,
          },
        ],
      },
    ];
  }

  // Demo/default convenience: read Pablo's canonical workbook for the range.
  return readPlanWorkbook(CANONICAL_XLSX, req.variant, weekNums);
}

/**
 * Build the typed proposal for a validated coach request. Saves nothing.
 * `llmAssist` is injectable for tests (a test passes a no-op / omits it so no
 * model is hit); in the route it defaults to the real env-wired assist.
 */
export async function buildImportProposalFromRequest(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
  /** Explicit override; default = the real env-configured assist (or none). */
  llmAssist?: LlmAssist | null;
}): Promise<ImportProposal> {
  const parsed = importProposalRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new ImportError('invalid_request', parsed.error.message, 400);
  }
  const req = parsed.data;
  const client = params.client ?? defaultSql;

  const range = parseWeekRange(req.range_text);
  if ('error' in range) {
    throw new ImportError('invalid_range', range.error, 400);
  }

  await assertMicrocycleOwned(params.coach_id, req.microcycle_id, client);

  let weeks: ImportedWeek[];
  try {
    weeks = await readSource(req, range.weeks);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo leer el origen.';
    throw new ImportError('source_read_failed', message, 422);
  }

  const assist =
    params.llmAssist === null
      ? undefined
      : (params.llmAssist ?? buildLlmAssist(params.coach_id));

  return buildImportProposal({
    coach_id: Number(params.coach_id),
    weeks,
    llmAssist: assist,
    client,
  });
}
