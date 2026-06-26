import 'server-only';

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { templateFormat } from '@fahybrid/shared/schema/_primitives';
import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import {
  weekDayPartSchema,
  type WeekDayPart,
} from '@fahybrid/shared/schema/program-templates';
import {
  WEEK_DAY_PART_PRESETS,
  defaultConfigForPartFormat,
} from '@/lib/dashboard/constants/week-day-part-presets';
import { newBlockUid } from '@/lib/dashboard/programming/studio-types';
import { isPabloIaLlmConfigured, callPabloIaLlmJson, PabloIaLlmError } from './llm';
import { loadTemplateAsBlocks } from './template-to-blocks';

// ---------------------------------------------------------------------------
// Request / response
// ---------------------------------------------------------------------------

const programLevel = z.enum(['beginner', 'intermediate', 'pro', 'elite']);

export const suggestWorkoutRequestSchema = z
  .object({
    focus: z.string().min(2).max(400),
    level: programLevel.optional(),
    /** Modo: rápido = solo plantillas catálogo, lento = LLM compone bloques nuevos. */
    mode: z.enum(['fast', 'slow']).default('fast'),
    athlete_id: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export type SuggestWorkoutRequest = z.infer<typeof suggestWorkoutRequestSchema>;

export interface SuggestWorkoutResponse {
  mode: 'fast' | 'slow';
  source: 'library' | 'llm' | 'library_fallback';
  /** Bloques propuestos para la sesión (lista de WeekDayPart hidratados). */
  blocks: WeekDayPart[];
  /** Plantilla del catálogo que respaldó la sugerencia (modo fast). */
  matched_template?: { id: string; name: string; format: string };
  notes?: string;
}

export class SuggestWorkoutError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SuggestWorkoutError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function suggestWorkout(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
}): Promise<SuggestWorkoutResponse> {
  const parsed = suggestWorkoutRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new SuggestWorkoutError('invalid_request', parsed.error.message, 400);
  }
  const client = params.client ?? defaultSql;
  const req = parsed.data;

  // ---- Fast mode: pick a template from the coach's library ------------------
  if (req.mode === 'fast') {
    const tpl = await pickLibraryTemplate({
      coach_id: params.coach_id,
      level: req.level,
      focus: req.focus,
      client,
    });
    if (!tpl) {
      // Sin templates con segmentos → devolvemos un bloque vacío "Principal"
      // como seed manual. Pablo decide si lo rellena.
      return {
        mode: 'fast',
        source: 'library_fallback',
        blocks: [seedPrincipalBlock()],
        notes:
          'No hay plantillas con ejercicios en tu biblioteca todavía — se ha sembrado un bloque vacío. Arrastra ejercicios o usa el modo lento (LLM).',
      };
    }
    return {
      mode: 'fast',
      source: 'library',
      blocks: tpl.blocks,
      matched_template: { id: tpl.id, name: tpl.name, format: tpl.format },
    };
  }

  // ---- Slow mode: LLM compone bloques nuevos --------------------------------
  if (!isPabloIaLlmConfigured()) {
    // Fallback automático a modo fast.
    const tpl = await pickLibraryTemplate({
      coach_id: params.coach_id,
      level: req.level,
      focus: req.focus,
      client,
    });
    if (!tpl) {
      return {
        mode: 'slow',
        source: 'library_fallback',
        blocks: [seedPrincipalBlock()],
        notes:
          'LLM no configurado y no hay plantillas con ejercicios en la biblioteca — se sembró un bloque vacío.',
      };
    }
    return {
      mode: 'slow',
      source: 'library_fallback',
      blocks: tpl.blocks,
      matched_template: { id: tpl.id, name: tpl.name, format: tpl.format },
      notes: 'LLM no configurado: se ha caído a selección de plantilla del catálogo.',
    };
  }

  // LLM disponible — pedir bloques nuevos.
  const exercises = await loadExerciseCatalog(client);
  try {
    const blocks = await llmSuggestBlocks({
      focus: req.focus,
      level: req.level ?? 'pro',
      exercises,
      coach_id: params.coach_id,
      athlete_id: req.athlete_id != null ? Number(req.athlete_id) : null,
    });
    return { mode: 'slow', source: 'llm', blocks };
  } catch (err) {
    // Cualquier fallo LLM → fallback rápido.
    const tpl = await pickLibraryTemplate({
      coach_id: params.coach_id,
      level: req.level,
      focus: req.focus,
      client,
    });
    const notes =
      err instanceof PabloIaLlmError
        ? `Pablo IA LLM falló (${err.code}); se cayó a plantilla del catálogo.`
        : 'Pablo IA LLM falló; se cayó a plantilla del catálogo.';
    if (!tpl) {
      return {
        mode: 'slow',
        source: 'library_fallback',
        blocks: [seedPrincipalBlock()],
        notes,
      };
    }
    return {
      mode: 'slow',
      source: 'library_fallback',
      blocks: tpl.blocks,
      matched_template: { id: tpl.id, name: tpl.name, format: tpl.format },
      notes,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PickArgs {
  coach_id: number | bigint;
  level?: z.infer<typeof programLevel> | undefined;
  focus: string;
  client: Sql;
}

interface PickedTemplate {
  id: string;
  name: string;
  format: string;
  blocks: WeekDayPart[];
}

async function pickLibraryTemplate(args: PickArgs): Promise<PickedTemplate | null> {
  // Buscamos templates con segmentos del coach. Filtrado heurístico simple por
  // tokens del focus y target_block.
  const levelMap: Record<NonNullable<PickArgs['level']>, number> = {
    beginner: 1,
    intermediate: 2,
    pro: 3,
    elite: 3,
  };
  const targetLevel = args.level ? levelMap[args.level] : null;

  const rows = await args.client<
    Array<{
      id: string;
      name: string;
      format: string;
      target_block: string;
      target_level: number | null;
      segment_count: number;
    }>
  >`
    select
      t.id::text as id,
      t.name,
      t.format::text as format,
      t.target_block::text as target_block,
      t.target_level,
      coalesce(seg.cnt, 0)::int as segment_count
    from templates t
    left join (
      select template_id, count(*)::int as cnt
      from template_segments
      group by template_id
    ) seg on seg.template_id = t.id
    where t.coach_id = ${args.coach_id as number}
      and t.archived_at is null
      and t.is_draft = false
    order by t.updated_at desc
    limit 100
  `;

  const usable = rows.filter((r) => r.segment_count > 0);
  if (usable.length === 0) return null;

  const focusTokens = args.focus.toLowerCase().split(/\s+/).filter(Boolean);
  const ranked = usable
    .map((t) => {
      let score = 0;
      const nameLc = t.name.toLowerCase();
      for (const tok of focusTokens) {
        if (tok.length >= 3 && nameLc.includes(tok)) score += 3;
      }
      if (targetLevel != null && t.target_level === targetLevel) score += 1;
      return { tpl: t, score };
    })
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0]?.tpl ?? usable[0]!;
  const blocks = await loadTemplateAsBlocks(winner.id, args.client);
  return {
    id: winner.id,
    name: winner.name,
    format: winner.format,
    blocks,
  };
}

function seedPrincipalBlock(): WeekDayPart {
  return {
    uid: newBlockUid(),
    format: 'strength_block',
    title: 'Principal',
    config_json: defaultConfigForPartFormat('strength_block'),
    items: [],
  };
}

interface CatalogRow {
  id: string;
  name: string;
  category: string;
}

async function loadExerciseCatalog(client: Sql): Promise<CatalogRow[]> {
  return await client<CatalogRow[]>`
    select id::text as id, name, category::text as category
    from exercises
    order by name
    limit 200
  `;
}

const llmBlockSchema = z.object({
  format: templateFormat,
  title: z.string().min(1).max(120),
  coach_note: z.string().max(400).optional(),
  config: z
    .object({
      time_cap_seconds: z.number().int().positive().optional(),
      emom_interval_seconds: z.number().int().positive().optional(),
      rounds: z.number().int().positive().optional(),
      work_seconds: z.number().int().positive().optional(),
      rest_seconds: z.number().int().nonnegative().optional(),
      stations: z.number().int().positive().optional(),
    })
    .optional(),
  exercises: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        sets: z.number().int().positive().optional(),
        reps: z.number().int().positive().optional(),
        distance_meters: z.number().int().positive().optional(),
        duration_seconds: z.number().int().positive().optional(),
        load_pct: z.number().int().min(0).max(150).optional(),
        rest_seconds: z.number().int().nonnegative().optional(),
        rpe: z.number().int().min(1).max(10).optional(),
        notes: z.string().max(300).optional(),
      }),
    )
    .min(1)
    .max(12),
});

const llmWorkoutSchema = z.object({
  blocks: z.array(llmBlockSchema).min(1).max(6),
});

interface LlmArgs {
  focus: string;
  level: 'beginner' | 'intermediate' | 'pro' | 'elite';
  exercises: CatalogRow[];
  coach_id: number | bigint;
  athlete_id?: number | bigint | null;
}

const PRESET_FORMAT_TITLES = WEEK_DAY_PART_PRESETS.map(
  (p) => `- ${p.format}: ${p.title} (${p.hint})`,
).join('\n');

async function llmSuggestBlocks(args: LlmArgs): Promise<WeekDayPart[]> {
  const system = [
    'Eres Pablo IA, coach de HYROX/hybrid élite del Fabrik Training Club Barcelona.',
    'Generas UN entreno (varios bloques) en JSON exacto:',
    '{ "blocks": [ { "format", "title", "coach_note"?, "config"?, "exercises": [{ "name", sets?, reps?, distance_meters?, duration_seconds?, load_pct?, rest_seconds?, rpe?, notes? }] } ] }',
    'Reglas:',
    '- format ∈ amrap|for_time|emom|intervals|strength_block|hyrox_sim|tempo|circuit',
    '- Cada bloque = parte de clase. 2-4 bloques típicos (calentamiento + principal + finisher/cooldown).',
    '- Usa EXACTAMENTE el nombre del catálogo proporcionado cuando exista — no inventes ejercicios.',
    '- Conservador en volumen. Élite ≠ kamikaze.',
    'Presets sugeridos por format:',
    PRESET_FORMAT_TITLES,
  ].join('\n');

  const exerciseList = args.exercises.map((e) => `- ${e.name} (${e.category})`).join('\n');
  const user = [
    `Foco del día: ${args.focus}`,
    `Nivel: ${args.level}`,
    '',
    'Catálogo de ejercicios disponibles:',
    exerciseList,
  ].join('\n');

  const raw = await callPabloIaLlmJson({
    system,
    user,
    temperature: 0.35,
    max_tokens: Number(process.env.LLM_CHAT_MAX_TOKENS_WORKOUT ?? 4096),
    meta: {
      surface: 'suggest_workout',
      coach_id: args.coach_id,
      athlete_id: args.athlete_id ?? null,
    },
  });

  const parsed = llmWorkoutSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PabloIaLlmError('invalid_json', `LLM workout schema inválido: ${parsed.error.message}`);
  }

  const byName = new Map(args.exercises.map((e) => [normalize(e.name), e]));
  return parsed.data.blocks.map((b) => {
    const fmt = b.format as TemplateFormat;
    const items = b.exercises
      .map((ex) => {
        const hit = matchExercise(ex.name, byName);
        if (!hit) return null;
        const params: Record<string, unknown> = {};
        if (ex.sets) params.sets = ex.sets;
        if (ex.reps) params.reps = ex.reps;
        if (ex.distance_meters) params.distance_meters = ex.distance_meters;
        if (ex.duration_seconds) params.duration_seconds = ex.duration_seconds;
        if (ex.load_pct) params.load_pct = ex.load_pct;
        if (ex.rest_seconds != null) params.rest_seconds = ex.rest_seconds;
        if (ex.rpe) params.rpe = ex.rpe;
        return {
          uid: newBlockUid(),
          exercise_id: Number(hit.id),
          exercise_name: hit.name,
          params_json: params,
          ...(ex.notes ? { notes: ex.notes } : {}),
        };
      })
      .filter(<T>(v: T | null): v is T => v != null);

    const part: WeekDayPart = {
      uid: newBlockUid(),
      format: fmt,
      title: b.title,
      config_json: b.config ?? defaultConfigForPartFormat(fmt),
      items,
      ...(b.coach_note ? { coach_note: b.coach_note } : {}),
    };
    // Validar shape final con el schema canónico — falla rápida si algo no encaja.
    return weekDayPartSchema.parse(part);
  });
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
