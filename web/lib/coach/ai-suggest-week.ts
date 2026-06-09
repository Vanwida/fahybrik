import 'server-only';

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { chatCompletion } from '@/lib/coach/ai-chat';
import { LlmConfigError } from '@/lib/rag/llm';
import { retrieveRelevant } from '@/lib/rag/retrieve';
import { emptyWeekSlots, normalizeWeekSlots } from '@/lib/coach/program-week-slots';
import { suggestWorkout } from '@/lib/coach/ai-suggest-workout';
import { persistWorkoutFromAiSuggestion } from '@/lib/coach/ai-persist-workout';
import type { WeekSlots } from '@fahybrid/shared/schema/program-templates';

const suggestRequestSchema = z.object({
  prompt: z.string().min(3).max(2000),
  level: z.enum(['beginner', 'intermediate', 'pro', 'elite']).optional(),
  atr_block: z.enum(['ACC', 'TRANS', 'REAL']).optional(),
  fill_workouts: z.boolean().optional().default(false),
});

const aiDaySchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  focus: z.string().max(120).optional(),
  coach_note: z.string().max(400).optional(),
  am: z.string().max(200).nullable().optional(),
  pm: z.string().max(200).nullable().optional(),
});

const aiWeekSchema = z.object({
  name: z.string().max(200),
  focus: z.string().max(200).optional(),
  coach_notes: z.string().max(2000).optional(),
  days: z.array(aiDaySchema).min(1).max(7),
});

export type AiWeekSuggestion = z.infer<typeof aiWeekSchema> & {
  slots_json: WeekSlots;
  matched_templates: Array<{ slot: string; template_id: string; template_name: string }>;
  generated_workouts: Array<{ slot: string; template_id: string; template_name: string }>;
  skipped_slots: Array<{ slot: string; label: string; reason: string }>;
  methodology_snippets: string[];
};

export class AiSuggestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AiSuggestError';
  }
}

interface TemplateRow {
  id: string;
  name: string;
  format: string;
  segment_count: number;
}

type SlotResolution =
  | { kind: 'rest'; template_id: null }
  | { kind: 'workout'; template_id: string; source: 'library' }
  | { kind: 'pending'; label: string; dayFocus?: string; coachNote?: string };

const MAX_GENERATED_WORKOUTS = 4;
const GENERATE_CONCURRENCY = 2;

export async function suggestWeekPlan(params: {
  coach_id: bigint;
  body: unknown;
  client?: Sql;
}): Promise<AiWeekSuggestion> {
  const parsed = suggestRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new AiSuggestError('invalid_request', parsed.error.message, 400);
  }

  const client = params.client ?? defaultSql;
  const { prompt, level, atr_block, fill_workouts } = parsed.data;

  const templates = await client<TemplateRow[]>`
    select
      t.id::text as id,
      t.name,
      t.format::text as format,
      coalesce(seg.cnt, 0)::int as segment_count
    from templates t
    left join (
      select template_id, count(*)::int as cnt
      from template_segments
      group by template_id
    ) seg on seg.template_id = t.id
    where t.coach_id = ${params.coach_id} and t.archived_at is null
    order by t.updated_at desc
    limit 80
  `;

  let methodology_snippets: string[] = [];
  try {
    const chunks = await retrieveRelevant({
      coach_id: params.coach_id,
      query: `${prompt} HYROX ${atr_block ?? ''} ${level ?? ''} semana entrenamiento`,
      top_k: 4,
    });
    methodology_snippets = chunks.map((c) => c.content.slice(0, 400));
  } catch {
    methodology_snippets = [];
  }

  const withExercises = templates.filter((t) => t.segment_count > 0);
  const templateList =
    withExercises.length > 0
      ? withExercises.map((t) => `- ${t.name} (${t.format}, ${t.segment_count} ej.)`).join('\n')
      : templates.length > 0
        ? '(tus entrenos guardados están vacíos — describe sesiones concretas; la IA creará entrenos nuevos)'
        : '(sin entrenos guardados — describe sesiones concretas)';

  const system = `Eres el asistente de programación de Pablo (Fabrik, HYROX élite).
Genera UNA semana de entrenamiento en JSON.
Reglas:
- HYROX / hybrid: puede haber 2 sesiones/día (am, pm). null o "rest" = descanso.
- Prioriza entrenos de la lista del coach (tienen ejercicios reales).
- Si no hay match en la lista, escribe una descripción corta y concreta de la sesión (ej. "EMOM 12' burpees + ski", "Tempo 45' Z2").
- Incluye foco por día cuando ayude (threshold, Z2, estaciones, fuerza…).
- Respeta bloque ATR si se indica (ACC=volumen, TRANS=específico, REAL=taper).
- JSON exacto: { "name", "focus", "coach_notes", "days": [{ "day_of_week": 1-7, "focus", "coach_note", "am", "pm" }] }`;

  const user = `Pedido del coach: ${prompt}
Nivel atleta: ${level ?? 'pro'}
Bloque ATR: ${atr_block ?? 'no especificado'}

Entrenos con ejercicios en biblioteca:
${templateList}

${methodology_snippets.length ? `Fragmentos metodología Pablo:\n${methodology_snippets.join('\n---\n')}` : ''}`;

  let raw: string;
  try {
    raw = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      json_mode: true,
      temperature: 0.35,
      max_tokens: Number(process.env.LLM_CHAT_MAX_TOKENS_WEEK ?? 4096),
      meta: { surface: 'suggest_week', coach_id: params.coach_id },
    });
  } catch (err) {
    if (err instanceof LlmConfigError) {
      throw new AiSuggestError('llm_unconfigured', err.message, 503);
    }
    throw new AiSuggestError('llm_failure', err instanceof Error ? err.message : 'LLM error', 502);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AiSuggestError('invalid_response', 'La IA no devolvió JSON válido', 502);
  }

  const weekParsed = aiWeekSchema.safeParse(json);
  if (!weekParsed.success) {
    throw new AiSuggestError('invalid_response', weekParsed.error.message, 502);
  }

  const base = emptyWeekSlots();
  const byName = new Map(templates.map((t) => [normalize(t.name), t]));
  const matched: AiWeekSuggestion['matched_templates'] = [];
  const generated: AiWeekSuggestion['generated_workouts'] = [];
  const skipped: AiWeekSuggestion['skipped_slots'] = [];
  const pending: Array<{
    slotKey: string;
    label: string;
    dayFocus?: string;
    coachNote?: string;
    day: number;
    slot: 'am' | 'pm';
  }> = [];

  const dayResolutions = base.days.map((day) => {
    const aiDay = weekParsed.data.days.find((d) => d.day_of_week === day.day_of_week);
    if (!aiDay) return { day, am: null as SlotResolution | null, pm: null as SlotResolution | null };

    const am = resolveSlot(aiDay.am, byName, matched, `${day.day_of_week}-am`, {
      dayFocus: aiDay.focus,
      coachNote: aiDay.coach_note,
    });
    const pm = resolveSlot(aiDay.pm, byName, matched, `${day.day_of_week}-pm`, {
      dayFocus: aiDay.focus,
      coachNote: aiDay.coach_note,
    });

    if (am.kind === 'pending') {
      pending.push({
        slotKey: `${day.day_of_week}-am`,
        label: am.label,
        dayFocus: am.dayFocus,
        coachNote: am.coachNote,
        day: day.day_of_week,
        slot: 'am',
      });
    }
    if (pm.kind === 'pending') {
      pending.push({
        slotKey: `${day.day_of_week}-pm`,
        label: pm.label,
        dayFocus: pm.dayFocus,
        coachNote: pm.coachNote,
        day: day.day_of_week,
        slot: 'pm',
      });
    }

    return {
      day: {
        ...day,
        focus: aiDay.focus,
        notes: aiDay.coach_note,
      },
      am,
      pm,
    };
  });

  let days = dayResolutions.map(({ day, am, pm }) => ({
    ...day,
    sessions: buildSessions(am, pm),
  }));

  if (fill_workouts && pending.length > 0) {
    const toGenerate = pending.slice(0, MAX_GENERATED_WORKOUTS);

    for (let i = 0; i < toGenerate.length; i += GENERATE_CONCURRENCY) {
      const batch = toGenerate.slice(i, i + GENERATE_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          const workoutPrompt = [
            weekParsed.data.name,
            item.dayFocus ? `Foco: ${item.dayFocus}` : null,
            item.coachNote ? `Notas: ${item.coachNote}` : null,
            `Sesión ${item.slot.toUpperCase()} día ${item.day}: ${item.label}`,
            prompt,
          ]
            .filter(Boolean)
            .join('. ');

          try {
            const suggestion = await suggestWorkout({
              coach_id: params.coach_id,
              body: { prompt: workoutPrompt, level, atr_block },
              client,
            });

            const saved = await persistWorkoutFromAiSuggestion({
              coach_id: params.coach_id,
              suggestion,
              is_draft: true,
              client,
            });

            if (saved.segment_count === 0) {
              return {
                ok: false as const,
                item,
                reason: 'La IA no pudo emparejar ejercicios del catálogo',
              };
            }

            return { ok: true as const, item, saved, suggestion };
          } catch {
            return { ok: false as const, item, reason: 'Error al generar el entreno' };
          }
        }),
      );

      for (const result of batchResults) {
        if (!result.ok) {
          skipped.push({
            slot: result.item.slotKey,
            label: result.item.label,
            reason: result.reason,
          });
          continue;
        }

        generated.push({
          slot: result.item.slotKey,
          template_id: result.saved.id,
          template_name: result.suggestion.name,
        });

        days = days.map((d) => {
          if (d.day_of_week !== result.item.day) return d;
          return {
            ...d,
            sessions: setSessionAtSlot(
              d.sessions,
              result.item.slot,
              {
                kind: 'workout',
                template_id: result.saved.id as unknown as WeekSlots['days'][0]['sessions'][0]['template_id'],
              },
            ),
          };
        });
      }
    }

    for (const item of pending.slice(MAX_GENERATED_WORKOUTS)) {
      skipped.push({
        slot: item.slotKey,
        label: item.label,
        reason: `Límite de ${MAX_GENERATED_WORKOUTS} entrenos generados por petición`,
      });
    }
  } else if (pending.length > 0) {
    for (const item of pending) {
      skipped.push({
        slot: item.slotKey,
        label: item.label,
        reason: 'Sin entreno en biblioteca — activa fill_workouts o créalo a mano',
      });
    }
  }

  return {
    ...weekParsed.data,
    slots_json: normalizeWeekSlots({ days }),
    matched_templates: matched,
    generated_workouts: generated,
    skipped_slots: skipped,
    methodology_snippets,
  };
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

type SessionWire = WeekSlots['days'][0]['sessions'][0];

/**
 * Construye `sessions[]` desde dos resoluciones de slot legacy (am/pm) que
 * vienen del LLM. AM ocupa session[0], PM ocupa session[1]. Rest = no añadir.
 */
function buildSessions(
  am: SlotResolution | null,
  pm: SlotResolution | null,
): WeekSlots['days'][0]['sessions'] {
  const out: WeekSlots['days'][0]['sessions'] = [];
  if (am && am.kind === 'workout') {
    out.push({
      kind: 'workout',
      template_id: am.template_id as unknown as SessionWire['template_id'],
    });
  } else if (pm && pm.kind === 'workout') {
    // Si AM es rest pero PM no, dejamos hueco con sesión rest en idx 0 para
    // que PM caiga en idx 1 (preserva la semántica AM/PM de la UI).
    out.push({ kind: 'rest', template_id: null });
  }
  if (pm && pm.kind === 'workout') {
    out.push({
      kind: 'workout',
      template_id: pm.template_id as unknown as SessionWire['template_id'],
    });
  }
  return out;
}

/**
 * Inserta/sustituye en `sessions[]` la sesión correspondiente al slot AM/PM.
 * Crea el slot intermedio (rest) si hace falta para que PM siempre caiga en idx 1.
 */
function setSessionAtSlot(
  sessions: WeekSlots['days'][0]['sessions'],
  slot: 'am' | 'pm',
  session: WeekSlots['days'][0]['sessions'][0],
): WeekSlots['days'][0]['sessions'] {
  const idx = slot === 'am' ? 0 : 1;
  const out = [...sessions];
  while (out.length <= idx) out.push({ kind: 'rest', template_id: null });
  out[idx] = session;
  return out;
}

function resolveSlot(
  label: string | null | undefined,
  byName: Map<string, TemplateRow>,
  matched: AiWeekSuggestion['matched_templates'],
  slotKey: string,
  ctx: { dayFocus?: string; coachNote?: string },
): SlotResolution {
  if (!label || label.toLowerCase() === 'rest' || label.toLowerCase() === 'descanso') {
    return { kind: 'rest', template_id: null };
  }

  const n = normalize(label);
  const exact = byName.get(n);
  if (exact && exact.segment_count > 0) {
    matched.push({ slot: slotKey, template_id: exact.id, template_name: exact.name });
    return { kind: 'workout', template_id: exact.id, source: 'library' };
  }

  for (const [key, t] of byName) {
    if (t.segment_count > 0 && (key.includes(n) || n.includes(key))) {
      matched.push({ slot: slotKey, template_id: t.id, template_name: t.name });
      return { kind: 'workout', template_id: t.id, source: 'library' };
    }
  }

  return {
    kind: 'pending',
    label: label.trim(),
    dayFocus: ctx.dayFocus,
    coachNote: ctx.coachNote,
  };
}
