import 'server-only';

import { z } from 'zod';
import { modalitySchema, type Modality } from '@fahybrid/shared/domain/prescription';
import { isPabloIaLlmConfigured, callPabloIaLlmJson, PabloIaLlmError } from './llm';

// suggest-session-title — derive a short Spanish workout TITLE for a day's session
// (the coach- and athlete-facing "Entreno de pierna" / "Series" / "Carrera
// continua") from the session's blocks + exercises. Uses the LLM when configured;
// otherwise an HONEST content-derived fallback (dominant modality + key exercises
// or the block format) — never a fake/empty title.
//
// Brain rule: NEVER hardcode the model/provider — the LLM is driven entirely by
// env via the shared `llm.ts` wiring (same as suggest-workout/suggest-week).

const MAX_TITLE = 120; // mirrors WeekSession.focus max length

// ── Request ──────────────────────────────────────────────────────────────────
// The client sends the session's blocks: each block's title/format and its items
// (exercise name + modality). Enough to name the workout, nothing sensitive.
const sessionTitleItemSchema = z.object({
  exercise_name: z.string().max(200).optional(),
  modality: modalitySchema.optional(),
});

const sessionTitleBlockSchema = z.object({
  title: z.string().max(120).optional(),
  format: z.string().max(60).nullable().optional(),
  items: z.array(sessionTitleItemSchema).max(24).default([]),
});

export const suggestSessionTitleRequestSchema = z
  .object({
    blocks: z.array(sessionTitleBlockSchema).max(16).default([]),
  })
  .strict();

export type SuggestSessionTitleRequest = z.infer<typeof suggestSessionTitleRequestSchema>;

export interface SuggestSessionTitleResponse {
  title: string;
  source: 'ai' | 'fallback';
}

export class SuggestSessionTitleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SuggestSessionTitleError';
  }
}

// ── Modality → Spanish label (for the fallback) ───────────────────────────────
const MODALITY_LABEL: Record<Modality, string> = {
  run: 'Carrera',
  row: 'Remo',
  ski: 'Ski',
  bike: 'Bici',
  strength: 'Fuerza',
  functional: 'Funcional',
  core: 'Core',
  mobility: 'Movilidad',
  other: 'Entreno',
};

// Block format → a sensible Spanish word when no modality is present (a from-
// scratch block before exercises are added). Best-effort, never throws.
function formatLabel(format: string | null | undefined): string | null {
  switch ((format ?? '').toLowerCase()) {
    case 'strength_block':
      return 'Fuerza';
    case 'tempo':
    case 'intervals':
      return 'Carrera';
    case 'amrap':
    case 'for_time':
    case 'emom':
    case 'circuit':
      return 'Circuito';
    case 'hyrox_sim':
      return 'Simulación HYROX';
    default:
      return null;
  }
}

// ── Service ───────────────────────────────────────────────────────────────────
export async function suggestSessionTitle(params: {
  coach_id: number | bigint;
  body: unknown;
}): Promise<SuggestSessionTitleResponse> {
  const parsed = suggestSessionTitleRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new SuggestSessionTitleError('invalid_request', parsed.error.message, 400);
  }
  const { blocks } = parsed.data;

  // LLM available → ask for a short title. Any failure degrades to the fallback.
  if (isPabloIaLlmConfigured()) {
    try {
      const title = await llmSuggestTitle({ blocks, coach_id: params.coach_id });
      if (title) return { title: clampTitle(title), source: 'ai' };
    } catch {
      // fall through to the honest content-derived fallback
    }
  }

  return { title: fallbackTitle(blocks), source: 'fallback' };
}

// ── LLM path ───────────────────────────────────────────────────────────────--
const llmTitleSchema = z.object({ title: z.string().min(1).max(MAX_TITLE) });

async function llmSuggestTitle(args: {
  blocks: SuggestSessionTitleRequest['blocks'];
  coach_id: number | bigint;
}): Promise<string | null> {
  const system = [
    'Eres Pablo IA, coach de HYROX/hybrid del Fabrik Training Club Barcelona.',
    'Te paso el contenido de UNA sesión de entrenamiento (sus bloques y ejercicios).',
    'Devuelve SOLO un JSON: { "title": "..." }.',
    'El título es un nombre CORTO en español (máx 6 palabras, máx 120 caracteres)',
    'que el atleta lee de un vistazo. Ejemplos: "Entreno de pierna", "Series",',
    '"Carrera continua", "Fuerza tren superior", "Simulación HYROX".',
    'No uses comillas ni emojis. No describas, NOMBRA el entreno.',
  ].join('\n');

  const user = ['Contenido de la sesión:', describeBlocks(args.blocks)].join('\n');

  const raw = await callPabloIaLlmJson({
    system,
    user,
    temperature: 0.4,
    max_tokens: Number(process.env.LLM_CHAT_MAX_TOKENS_TITLE ?? 128),
    meta: { surface: 'suggest_session_title', coach_id: args.coach_id },
  });

  const parsed = llmTitleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PabloIaLlmError('invalid_json', `LLM title schema inválido: ${parsed.error.message}`);
  }
  const title = parsed.data.title.trim();
  return title.length > 0 ? title : null;
}

function describeBlocks(blocks: SuggestSessionTitleRequest['blocks']): string {
  if (blocks.length === 0) return '(sin bloques)';
  return blocks
    .map((b, i) => {
      const exercises = b.items
        .map((it) => it.exercise_name?.trim())
        .filter((n): n is string => !!n);
      const head = `Bloque ${i + 1}: ${b.title?.trim() || b.format || 'sin nombre'}`;
      return exercises.length > 0 ? `${head} — ${exercises.join(', ')}` : head;
    })
    .join('\n');
}

// ── Honest fallback (no LLM) ──────────────────────────────────────────────────
// Derive a real title from the session's content: dominant modality (by item
// count) + the first couple of exercise names; or the block format when there are
// no exercises yet; or a plain "Entreno" as the last honest default.
function fallbackTitle(blocks: SuggestSessionTitleRequest['blocks']): string {
  const items = blocks.flatMap((b) => b.items);

  // Dominant modality by item count (deterministic: first to reach the max).
  const counts = new Map<Modality, number>();
  let dominant: Modality | null = null;
  let best = 0;
  for (const it of items) {
    if (!it.modality) continue;
    const next = (counts.get(it.modality) ?? 0) + 1;
    counts.set(it.modality, next);
    if (next > best) {
      best = next;
      dominant = it.modality;
    }
  }

  // Key exercise names (de-duplicated, capped at 2) for the "· a + b" suffix.
  const names: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const n = it.exercise_name?.trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(n);
    if (names.length >= 2) break;
  }

  const head = dominant ? MODALITY_LABEL[dominant] : formatLabel(blocks[0]?.format) ?? 'Entreno';
  const suffix = names.length > 0 ? ` · ${names.join(' + ')}` : '';
  return clampTitle(`${head}${suffix}`);
}

function clampTitle(title: string): string {
  const t = title.trim().replace(/\s+/g, ' ');
  return t.length > MAX_TITLE ? t.slice(0, MAX_TITLE).trim() : t;
}
