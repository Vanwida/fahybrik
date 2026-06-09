import 'server-only';

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { chatCompletion } from '@/lib/coach/ai-chat';
import { LlmConfigError } from '@/lib/rag/llm';
import { retrieveRelevant } from '@/lib/rag/retrieve';
import { HYROX_SECTION_TYPES } from '@/lib/studio/section-types';
import { targetBlockSchema, templateFormatSchema } from '@/lib/templates/schema';
import type { AiWorkoutSuggestion } from '@/lib/coach/ai-workout-types';

const suggestRequestSchema = z.object({
  prompt: z.string().min(3).max(2000),
  level: z.enum(['beginner', 'intermediate', 'pro', 'elite']).optional(),
  atr_block: z.enum(['ACC', 'TRANS', 'REAL']).optional(),
});

const aiExerciseSchema = z.object({
  name: z.string().max(120),
  notes: z.string().max(400).optional(),
  sets: z.number().int().optional(),
  reps: z.number().int().optional(),
  distance_meters: z.number().int().optional(),
});

const aiBlockSchema = z.object({
  section_id: z.string().max(40),
  title: z.string().max(120).optional(),
  config: z
    .object({
      time_cap_seconds: z.number().int().optional(),
      emom_interval_seconds: z.number().int().optional(),
      rounds: z.number().int().optional(),
      work_seconds: z.number().int().optional(),
      rest_seconds: z.number().int().optional(),
    })
    .optional(),
  exercises: z.array(aiExerciseSchema).max(12).optional(),
  coach_note: z.string().max(400).optional(),
});

const aiWorkoutSchema = z.object({
  name: z.string().max(200),
  format: templateFormatSchema,
  target_block: targetBlockSchema.optional(),
  coach_notes: z.string().max(2000).optional(),
  warmup: z.string().max(800).optional(),
  blocks: z.array(aiBlockSchema).min(1).max(8),
});

export type { AiWorkoutSuggestion } from '@/lib/coach/ai-workout-types';

export class AiSuggestWorkoutError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AiSuggestWorkoutError';
  }
}

const SECTION_IDS = HYROX_SECTION_TYPES.map((s) => s.id).join(', ');

export async function suggestWorkout(params: {
  coach_id: bigint;
  body: unknown;
  client?: Sql;
}): Promise<AiWorkoutSuggestion> {
  const parsed = suggestRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new AiSuggestWorkoutError('invalid_request', parsed.error.message, 400);
  }

  const client = params.client ?? defaultSql;
  const { prompt, level, atr_block } = parsed.data;

  const exercises = await client<
    Array<{ id: string; name: string; slug: string; category: string }>
  >`
    select id::text, name, slug, category::text
    from exercises
    order by name
    limit 200
  `;

  let methodology_snippets: string[] = [];
  try {
    const chunks = await retrieveRelevant({
      coach_id: params.coach_id,
      query: `${prompt} HYROX entreno ${atr_block ?? ''} ${level ?? ''}`,
      top_k: 4,
    });
    methodology_snippets = chunks.map((c) => c.content.slice(0, 400));
  } catch {
    methodology_snippets = [];
  }

  const exerciseList = exercises.map((e) => `- ${e.name} (${e.category})`).join('\n');
  const system = `Eres el asistente de Pablo (Fabrik, HYROX élite). Genera UN entreno en JSON.
Bloques disponibles (section_id): ${SECTION_IDS}
Reglas:
- Cada bloque = parte de clase (EMOM, AMRAP, estaciones HYROX, fuerza, tempo…).
- Usa ejercicios del catálogo cuando encajen por nombre — copia el nombre EXACTO del catálogo.
- Mínimo 3 ejercicios por bloque principal salvo calentamiento/recuperación.
- format del entreno: amrap|emom|for_time|intervals|strength_block|hyrox_sim|tempo|circuit
- JSON: { name, format, target_block?, coach_notes?, warmup?, blocks: [{ section_id, title?, config?, exercises?, coach_note? }] }`;

  const user = `Pedido: ${prompt}
Nivel: ${level ?? 'pro'}
ATR: ${atr_block ?? 'no especificado'}

Catálogo ejercicios:
${exerciseList}

${methodology_snippets.length ? `Metodología:\n${methodology_snippets.join('\n---\n')}` : ''}`;

  let raw: string;
  try {
    raw = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      json_mode: true,
      temperature: 0.35,
      max_tokens: Number(process.env.LLM_CHAT_MAX_TOKENS_WORKOUT ?? 12_288),
      meta: { surface: 'suggest_workout', coach_id: params.coach_id },
    });
  } catch (err) {
    if (err instanceof LlmConfigError) {
      throw new AiSuggestWorkoutError('llm_unconfigured', err.message, 503);
    }
    throw new AiSuggestWorkoutError(
      'llm_failure',
      err instanceof Error ? err.message : 'LLM error',
      502,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AiSuggestWorkoutError('invalid_response', 'JSON inválido', 502);
  }

  const workoutParsed = aiWorkoutSchema.safeParse(json);
  if (!workoutParsed.success) {
    throw new AiSuggestWorkoutError('invalid_response', workoutParsed.error.message, 502);
  }

  const byName = new Map(exercises.map((e) => [normalize(e.name), e]));
  const matched: AiWorkoutSuggestion['matched_exercises'] = [];

  for (const block of workoutParsed.data.blocks) {
    for (const ex of block.exercises ?? []) {
      const hit = matchExercise(ex.name, byName);
      if (hit) {
        matched.push({ name: ex.name, exercise_id: hit.id, exercise_name: hit.name });
      }
    }
  }

  return { ...workoutParsed.data, matched_exercises: matched, methodology_snippets };
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function matchExercise(
  name: string,
  byName: Map<string, { id: string; name: string }>,
): { id: string; name: string } | null {
  const n = normalize(name);
  const exact = byName.get(n);
  if (exact) return exact;
  for (const [key, e] of byName) {
    if (key.includes(n) || n.includes(key)) return e;
  }
  return null;
}
