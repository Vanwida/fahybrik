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
import { parseWeekRange, parseDayDestination } from './range-parse';
import { readPlanWorkbook, parsePastedText, type ImportedWeek } from './xlsx-reader';
import { buildLlmAssist } from './llm-assist';
import { suggestWeekPlan } from '@/lib/dashboard/coach/ai/suggest-week';
import { weekDaysToProposal } from './generate-proposal';

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
    /**
     * Week RANGE for the Excel/canonical flow (whole weeks → container weeks).
     * Optional: the paste flow targets a single DAY instead (target_weekday).
     */
    range_text: z.string().max(200).optional(),
    /** A single day pasted instead of pointing at the xlsx. */
    pasted_text: z.string().max(20_000).optional(),
    /**
     * Paste-flow destination: the weekday (1=Lun … 7=Dom) the pasted session goes
     * into. Primary input is the review UI's day selector; the container week is
     * chosen there too. Kept explicit so the day is NEVER silently defaulted.
     */
    target_weekday: z.number().int().min(1).max(7).optional(),
    /** Base64 of the coach's uploaded workbook (preferred source). */
    xlsx_base64: z.string().min(1).max(80_000_000).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // The Excel/canonical flow needs a week range; the paste flow doesn't (it
    // targets one day). Require the range only when nothing is pasted.
    const hasPaste = !!v.pasted_text && v.pasted_text.trim().length > 0;
    if (!hasPaste && (!v.range_text || !v.range_text.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['range_text'],
        message: 'Indica qué semanas del microciclo quieres importar.',
      });
    }
  });

export type ImportProposalRequest = z.infer<typeof importProposalRequestSchema>;

/**
 * The AI-GENERATE branch (#48). A distinct request shape — no xlsx/paste source,
 * just a natural-language FOCUS → `suggest-week` composes a full week from the
 * coach's real library, and it is routed through the SAME typed proposal so the
 * review gate still holds. `mode: 'generate'` is the discriminant the service
 * peeks at before the file/paste schema (which requires `variant`).
 */
export const importGenerateRequestSchema = z
  .object({
    microcycle_id: idSchema,
    mode: z.literal('generate'),
    focus: z.string().min(2).max(400),
    level: z.enum(['beginner', 'intermediate', 'pro', 'elite']).optional(),
  })
  .strict();

export type ImportGenerateRequest = z.infer<typeof importGenerateRequestSchema>;

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
 * Read the WEEK-RANGE source into `ImportedWeek[]` (whole weeks). Precedence:
 * uploaded xlsx → canonical workbook. The paste flow is single-day and handled
 * separately (`buildPastedDay`), so it never reaches here.
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

  // Demo/default convenience: read Pablo's canonical workbook for the range.
  return readPlanWorkbook(CANONICAL_XLSX, req.variant, weekNums);
}

/**
 * The PASTE flow's destination weekday (1..7). The review UI's day selector is the
 * primary source (`target_weekday`); we then tolerate a free-typed hint
 * ("semana 1 jueves") and, last, a day name the coach put atop the pasted block.
 * If none resolve we ERROR — the day is never silently defaulted (that was the bug:
 * a pasted session landed on Monday regardless of intent).
 */
function resolvePasteWeekday(req: ImportProposalRequest): number {
  if (req.target_weekday) return req.target_weekday;
  if (req.range_text && req.range_text.trim()) {
    const dest = parseDayDestination(req.range_text);
    if (!('error' in dest)) return dest.weekday;
  }
  const pasted = parsePastedText(req.pasted_text ?? '');
  if (pasted.day_of_week) return pasted.day_of_week;
  throw new ImportError(
    'missing_weekday',
    'Elige el día de la semana para este entreno pegado.',
    400,
  );
}

/**
 * Build the single-day proposal input from a pasted session placed on `weekday`.
 * ONE day only — no fabricated full week, no "Descanso" filler. The container week
 * is chosen in the review step (Fork B), so `week` here is cosmetic.
 */
function buildPastedDay(pasted_text: string, weekday: number): ImportedWeek[] {
  const pasted = parsePastedText(pasted_text);
  return [
    {
      week: 1,
      sheet: 'pegado',
      fell_back: false,
      days: [
        {
          day_of_week: weekday,
          dow: DAY_DISPLAY[weekday - 1]!,
          stimulus: pasted.stimulus,
          session_text: pasted.session_text,
        },
      ],
    },
  ];
}

/**
 * Build the typed proposal for a validated coach request. Saves nothing.
 * `llmAssist` is injectable for tests (a test passes a no-op / omits it so no
 * model is hit); in the route it defaults to the real env-wired assist.
 */
/** Peek the discriminant without full validation: the GENERATE branch. */
function isGenerateRequest(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { mode?: unknown }).mode === 'generate'
  );
}

/**
 * AI-GENERATE branch: compose a full week from the coach's library (`suggest-week`
 * in slow mode — LLM if configured, deterministic library fallback otherwise) and
 * convert it into the typed proposal. Its blocks carry catalog-resolved items, so
 * the generated week is fully typed by construction; the coach still reviews and
 * confirms it through the same gate. Saves nothing.
 */
async function buildGeneratedProposal(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
}): Promise<ImportProposal> {
  const parsed = importGenerateRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new ImportError('invalid_request', parsed.error.message, 400);
  }
  const req = parsed.data;
  const client = params.client ?? defaultSql;

  await assertMicrocycleOwned(params.coach_id, req.microcycle_id, client);

  const week = await suggestWeekPlan({
    coach_id: params.coach_id,
    body: { focus: req.focus, mode: 'slow', ...(req.level ? { level: req.level } : {}) },
    client,
  });

  return weekDaysToProposal({ days: week.days, sheetLabel: week.name });
}

export async function buildImportProposalFromRequest(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
  /** Explicit override; default = the real env-configured assist (or none). */
  llmAssist?: LlmAssist | null;
}): Promise<ImportProposal> {
  // The GENERATE branch is a distinct request; route it before the file/paste
  // schema (which requires `variant`, absent here).
  if (isGenerateRequest(params.body)) {
    return buildGeneratedProposal({
      coach_id: params.coach_id,
      body: params.body,
      client: params.client,
    });
  }

  const parsed = importProposalRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new ImportError('invalid_request', parsed.error.message, 400);
  }
  const req = parsed.data;
  const client = params.client ?? defaultSql;

  await assertMicrocycleOwned(params.coach_id, req.microcycle_id, client);

  // Two flows: PASTE = a single day placed on a concrete weekday; EXCEL/canonical =
  // whole weeks over a week range.
  let weeks: ImportedWeek[];
  const isPaste = !!req.pasted_text && req.pasted_text.trim().length > 0;
  if (isPaste) {
    const weekday = resolvePasteWeekday(req);
    weeks = buildPastedDay(req.pasted_text!, weekday);
  } else {
    const range = parseWeekRange(req.range_text ?? '');
    if ('error' in range) {
      throw new ImportError('invalid_range', range.error, 400);
    }
    try {
      weeks = await readSource(req, range.weeks);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo leer el origen.';
      throw new ImportError('source_read_failed', message, 422);
    }
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
