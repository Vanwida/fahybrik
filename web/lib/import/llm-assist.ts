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
  prescriptionSchemeSchema,
  modalitySchema,
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
    'prescription.scheme ∈ ' + prescriptionSchemeSchema.options.join(' | '),
    'prescription.modality (opcional) ∈ ' + modalitySchema.options.join(' | '),
    'Campos de prescription (todos opcionales salvo scheme): modality, rounds, work_s, rest_s, total_s, start, increment, note,',
    '  target (objetivo de intensidad: { kind: "percent_rm"|"kg"|"rpe"|"rir"|"pace"|"hr_zone"|"hr_bpm"|"calories"|"watts"|"bodyweight", value?|min?|max? ; pace usa unit + value_s/min_s/max_s }),',
    '  sets (array por-serie: { measure?: { kind:"reps"|"distance"|"duration"|"calories", ... }, target?, rest_s?, tempo?, note? }).',
    'Los segundos son números en segundos; las distancias en metros; el ritmo en segundos por unidad.',
  ].join('\n');
}

/**
 * Build the real `LlmAssist` for the orchestrator, or `undefined` when no model is
 * configured (env absent) — in which case the orchestrator keeps every grammar
 * review line untouched (no LLM-impostor). Best-effort: any failure (network,
 * bad JSON, schema miss) resolves to `null` so the honest review line survives.
 */
export function buildLlmAssist(coach_id: number | bigint): LlmAssist | undefined {
  if (!isCoachIaLlmConfigured()) return undefined;

  const system = buildSystemPrompt();
  return async (text: string): Promise<ParsedLine[] | null> => {
    try {
      const raw = await callCoachIaLlmJson({
        system,
        user: `Línea densa a tipar:\n${text}`,
        temperature: 0.1,
        max_tokens: Number(process.env.LLM_CHAT_MAX_TOKENS_IMPORT ?? 1536),
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
