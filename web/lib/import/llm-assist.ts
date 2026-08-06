import 'server-only';

// #28 — the LLM SECOND PASS for the importer (Fork A: grammar first, IA only for
// the dense). The grammar (`parseNotationCell`) types everything it can prove and
// marks the rest `confidence:'review'`. This module wires the REAL model seam
// (`callCoachIaLlmJson`, whose model comes from env — NEVER hardcoded) as the
// `LlmAssist` the orchestrator injects, and Zod-GATES the model's output to typed
// `ParsedLine[]` via the SAME `prescriptionSchema` the grammar uses. Anything the
// model returns that is not a schema-valid prescription is DROPPED (returns null),
// so the honest grammar review line survives — the model can never smuggle a
// fabricated number or a free-text blob past the gate (Alex's sacred rule).
//
// Mirrors the #33 `llmSuggestBlocks` LLM→typed pattern: build the request, parse
// JSON, `safeParse` against a Zod schema, return only the validated shape.

import { z } from 'zod';
import {
  prescriptionSchema,
  prescriptionGrammarLines,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import type { ParsedLine } from '@fahybrid/shared/domain/import/notation';
import type { LlmAssist } from './build-proposal';
import {
  callCoachIaLlmJson,
  isCoachIaLlmConfigured,
} from '@/lib/dashboard/coach/ai/llm';

// One decomposed line the model proposes. `prescription` goes through the exact
// canonical `prescriptionSchema` (`.strict`): an unknown field or an out-of-range
// number fails the whole line, which is then dropped. `exercise_token` is the
// verbatim movement label (resolution to a catalog id is the orchestrator's job).
const llmLineSchema = z.object({
  exercise_token: z.string().max(200).default(''),
  prescription: prescriptionSchema,
  confidence: z.enum(['detected', 'review']).default('review'),
  review_reasons: z.array(z.string().max(300)).max(10).default([]),
});

const llmResultSchema = z.object({
  lines: z.array(llmLineSchema).max(24),
});

// The honesty contract, spelled out for the model. It ONLY sees dense lines the
// deterministic grammar could not type (WOD/HYROX-sim/chippers). The overriding
// rule: type ONLY what the text states verbatim; never invent reps/loads/paces.
function buildSystemPrompt(): string {
  return [
    'Eres el motor de tipado del importador de entrenos de un coach de HYROX/híbrido.',
    'Recibes UNA línea/celda densa de la notación real del coach (un WOD, una simulación HYROX, un chipper…) que el parser determinista NO pudo tipar.',
    'La conviertes en líneas TIPADAS en JSON EXACTO: { "lines": [ { "exercise_token", "prescription", "confidence", "review_reasons" } ] }',
    '',
    'REGLA SAGRADA — honestidad absoluta:',
    '- Tipa SOLO lo que el texto dice literalmente. JAMÁS inventes un número (reps, series, carga, %RM, ritmo, distancia, tiempo).',
    '- Si un dato no está explícito, OMITE ese campo. No lo rellenes por defecto.',
    '- Si no puedes descomponer la línea con confianza, devuelve UNA sola línea con confidence "review", exercise_token "" y prescription { "scheme": <formato>, "note": <texto verbatim> } — nada más.',
    '- Todo texto libre va SOLO en el campo "note". El resto es estructura.',
    '',
    ...prescriptionGrammarLines(),
  ].join('\n');
}

export type BuildLlmAssistOptions = {
  /** Per-call abort (ms). Photo import uses a shorter value; see `budgetLlmAssist`. */
  timeout_ms?: number;
};

/**
 * Build the real `LlmAssist` for the orchestrator, or `undefined` when no model is
 * configured (env absent) — in which case the orchestrator keeps every grammar
 * review line untouched (no LLM-impostor). Best-effort: any failure (network,
 * bad JSON, schema miss) resolves to `null` so the honest review line survives.
 */
export function buildLlmAssist(
  coach_id: number | bigint,
  opts: BuildLlmAssistOptions = {},
): LlmAssist | undefined {
  if (!isCoachIaLlmConfigured()) return undefined;

  const system = buildSystemPrompt();
  const timeout_ms = opts.timeout_ms;
  return async (text: string): Promise<ParsedLine[] | null> => {
    try {
      const raw = await callCoachIaLlmJson({
        system,
        user: `Línea densa a tipar:\n${text}`,
        temperature: 0.1,
        max_tokens: Number(process.env.LLM_CHAT_MAX_TOKENS_IMPORT ?? 1536),
        ...(timeout_ms != null ? { timeout_ms } : {}),
        meta: { surface: 'import_notation', coach_id },
      });
      const parsed = llmResultSchema.safeParse(raw);
      if (!parsed.success) return null;
      const lines = parsed.data.lines;
      if (lines.length === 0) return null;
      return lines.map((l) => ({
        exercise_token: l.exercise_token,
        prescription: l.prescription as Prescription,
        confidence: l.confidence,
        review_reasons: l.review_reasons,
      }));
    } catch {
      // Best-effort: keep the grammar's honest review line on any failure.
      return null;
    }
  };
}

/**
 * Soft limits around an `LlmAssist` so a photo of a full TrainingPeaks week
 * (dozens of grammar-`review` lines) cannot burn the route's `maxDuration`
 * with sequential 120s LLM calls.
 *
 * INCIDENTE 2026-08-06: vision + place finished in ~20s; `buildImportProposal`
 * then called assist once per review line with no cap → Vercel 504 after 300s
 * and the client only saw "No se pudieron leer las capturas."
 *
 * When the cap or deadline is hit, returns `null` immediately (honest review
 * line survives). Never throws — same contract as the unwrapped assist.
 */
export type BudgetLlmAssistOptions = {
  /** Absolute wall-clock deadline (Date.now() + budget). */
  deadlineAt: number;
  /** Max model calls for this proposal. Further review lines stay review. */
  maxCalls: number;
  /**
   * Do not start a new call unless at least this many ms remain before
   * `deadlineAt`. Leaves headroom for exercise resolve + response serialize.
   */
  minRemainingMs: number;
  logTag?: string;
};

export function budgetLlmAssist(
  assist: LlmAssist | undefined,
  opts: BudgetLlmAssistOptions,
): LlmAssist | undefined {
  if (!assist) return undefined;

  let calls = 0;
  let skipped = 0;
  const tag = opts.logTag ?? '[import/llm-assist]';

  return async (text: string): Promise<ParsedLine[] | null> => {
    const remaining = opts.deadlineAt - Date.now();
    if (calls >= opts.maxCalls || remaining < opts.minRemainingMs) {
      skipped += 1;
      if (skipped === 1 || skipped % 10 === 0) {
        console.info(`${tag} assist_skipped`, {
          calls,
          skipped,
          remaining_ms: remaining,
          reason: calls >= opts.maxCalls ? 'max_calls' : 'budget',
        });
      }
      return null;
    }

    calls += 1;
    const t0 = Date.now();
    try {
      return await assist(text);
    } finally {
      console.info(`${tag} assist`, {
        call: calls,
        ms: Date.now() - t0,
        remaining_ms: opts.deadlineAt - Date.now(),
      });
    }
  };
}
