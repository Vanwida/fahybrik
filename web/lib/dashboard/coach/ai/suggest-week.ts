import 'server-only';

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { atrBlockType } from '@fahybrid/shared/schema/_primitives';
import type { AtrBlockType } from '@fahybrid/shared/schema/_primitives';
import {
  weekDaySchema,
  type WeekDay,
} from '@fahybrid/shared/schema/program-templates';
import { isPabloIaLlmConfigured, callPabloIaLlmJson, PabloIaLlmError } from './llm';
import { loadTemplateAsBlocks } from './template-to-blocks';
import { newBlockUid } from '@/lib/dashboard/programming/studio-types';
import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';

/**
 * Clona los blocks de un template generando uids nuevos para parts e items.
 * Cada día que use el mismo template debe tener uids únicos (los uids son
 * identidad de UI/DnD; colisiones rompen el Studio).
 */
function cloneBlocksWithFreshUids(blocks: WeekDayPart[]): WeekDayPart[] {
  return blocks.map((part) => ({
    ...part,
    uid: newBlockUid(),
    items: part.items.map((item) => ({ ...item, uid: newBlockUid() })),
  }));
}

// ---------------------------------------------------------------------------
// Request / response
// ---------------------------------------------------------------------------

const programLevel = z.enum(['beginner', 'intermediate', 'pro', 'elite']);

export const suggestWeekRequestSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    focus: z.string().min(2).max(400),
    level: programLevel.optional(),
    atr_block: atrBlockType.optional(),
    /** Modo: rápido = slots con templates del catálogo. Slow = LLM ordena. */
    mode: z.enum(['fast', 'slow']).default('fast'),
    /** Para v1: 7 días siempre; el coach decide qué hacer con cada uno. */
    days_per_week: z.number().int().min(3).max(7).default(7),
    /**
     * C31 — box-class awareness. Si la semana se genera para un atleta
     * concreto (no es plantilla genérica) el LLM debe ver el calendario
     * `users.box_class_schedule` para evitar duplicar tipo de carga el día
     * que el atleta entrena en el box. Si se omite, no se inyecta.
     */
    athlete_id: z.union([z.number(), z.string()]).optional(),
  })
  .strict();

export type SuggestWeekRequest = z.infer<typeof suggestWeekRequestSchema>;

export interface SuggestedWeekDay extends WeekDay {
  /** Etiqueta informativa libre para mostrar en preview (no se persiste). */
  preview_label?: string;
}

export interface SuggestWeekResponse {
  mode: 'fast' | 'slow';
  source: 'library' | 'llm' | 'library_fallback';
  name: string;
  focus: string;
  days: SuggestedWeekDay[];
  matched_templates: Array<{
    day_of_week: number;
    session_index: number;
    template_id: string;
    template_name: string;
  }>;
  rest_days: number[];
  notes?: string | undefined;
}

export class SuggestWeekError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SuggestWeekError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function suggestWeekPlan(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
}): Promise<SuggestWeekResponse> {
  const parsed = suggestWeekRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new SuggestWeekError('invalid_request', parsed.error.message, 400);
  }
  const client = params.client ?? defaultSql;
  const req = parsed.data;

  const templates = await loadCoachTemplates(params.coach_id, client);
  const allUsable = templates.filter((t) => t.segment_count > 0);

  // Hard filter por bloque ATR — meter templates de otros bloques en una semana
  // ACC/TRANS/REAL es incorrecto periodológicamente. Si tras filtrar quedan 0,
  // caemos al catálogo completo con una nota visible (mejor algo que nada).
  const blockMatches = req.atr_block
    ? allUsable.filter((t) => t.target_block === req.atr_block || t.target_block === 'any')
    : allUsable;
  const blockFilterFellThrough = req.atr_block != null && blockMatches.length === 0;
  const usable = blockFilterFellThrough ? allUsable : blockMatches;
  const blockNote = blockFilterFellThrough
    ? `Sin templates para bloque ${req.atr_block} — usando catálogo completo.`
    : undefined;

  // Distribución por defecto: 6 días entrenamiento + 1 descanso (domingo).
  const trainingDays = computeTrainingDayDistribution(req.days_per_week);

  // ---- Fast mode (default) -------------------------------------------------
  if (req.mode === 'fast' || !isPabloIaLlmConfigured()) {
    const filled = await buildWeekFromLibrary({
      training_days: trainingDays,
      templates: usable,
      focus: req.focus,
      atr_block: req.atr_block,
      level: req.level,
      client,
    });
    return {
      mode: req.mode,
      source: req.mode === 'slow' && !isPabloIaLlmConfigured() ? 'library_fallback' : 'library',
      name: req.name ?? defaultWeekName(req.focus, req.atr_block),
      focus: req.focus,
      days: filled.days,
      matched_templates: filled.matched,
      rest_days: filled.rest_days,
      notes:
        [
          blockNote,
          req.mode === 'slow' && !isPabloIaLlmConfigured()
            ? 'LLM no configurado: semana compuesta desde plantillas del catálogo.'
            : undefined,
        ]
          .filter(Boolean)
          .join(' ') || undefined,
    };
  }

  // ---- Slow mode: LLM ordena el catálogo y pone foco día a día -------------
  // C31 — si la request trae athlete_id, cargamos su calendario de box para
  // que el LLM no apile carga del mismo tipo el día que el atleta hace clase
  // presencial con Pablo.
  const boxClassSchedule = req.athlete_id != null
    ? await loadBoxClassScheduleForAthlete(client, req.athlete_id)
    : null;

  try {
    const planned = await llmOrderWeek({
      focus: req.focus,
      level: req.level ?? 'pro',
      atr_block: req.atr_block,
      templates: usable,
      training_days: trainingDays,
      client,
      box_class_schedule: boxClassSchedule,
      coach_id: params.coach_id,
      athlete_id: req.athlete_id != null ? Number(req.athlete_id) : null,
    });
    return {
      mode: 'slow',
      source: 'llm',
      name: req.name ?? defaultWeekName(req.focus, req.atr_block),
      focus: req.focus,
      days: planned.days,
      matched_templates: planned.matched,
      rest_days: planned.rest_days,
    };
  } catch (err) {
    const fallback = await buildWeekFromLibrary({
      training_days: trainingDays,
      templates: usable,
      focus: req.focus,
      atr_block: req.atr_block,
      level: req.level,
      client,
    });
    const llmFailNote =
      err instanceof PabloIaLlmError
        ? `Pablo IA LLM falló (${err.code}); semana compuesta desde el catálogo.`
        : 'Pablo IA LLM falló; semana compuesta desde el catálogo.';
    const notes = [blockNote, llmFailNote].filter(Boolean).join(' ');
    return {
      mode: 'slow',
      source: 'library_fallback',
      name: req.name ?? defaultWeekName(req.focus, req.atr_block),
      focus: req.focus,
      days: fallback.days,
      matched_templates: fallback.matched,
      rest_days: fallback.rest_days,
      notes,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers — library / heuristics
// ---------------------------------------------------------------------------

interface TemplateRow {
  id: string;
  name: string;
  format: string;
  target_block: string;
  target_level: number | null;
  segment_count: number;
}

async function loadCoachTemplates(
  coach_id: number | bigint,
  client: Sql,
): Promise<TemplateRow[]> {
  return await client<TemplateRow[]>`
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
    where t.coach_id = ${coach_id as number}
      and t.archived_at is null
      and t.is_draft = false
    order by t.updated_at desc
    limit 80
  `;
}

function computeTrainingDayDistribution(days_per_week: number): number[] {
  // Días entrenamiento por defecto (1=lunes…7=domingo).
  // 7d→6 train (rest dom), 6d→5 train, 5d→5 train+2 rest, etc.
  switch (days_per_week) {
    case 3:
      return [1, 3, 5];
    case 4:
      return [1, 3, 5, 6];
    case 5:
      return [1, 2, 4, 5, 6];
    case 6:
      return [1, 2, 3, 5, 6, 7];
    case 7:
    default:
      return [1, 2, 3, 4, 5, 6];
  }
}

interface BuildArgs {
  training_days: number[];
  templates: TemplateRow[];
  focus: string;
  atr_block?: AtrBlockType | undefined;
  level?: z.infer<typeof programLevel> | undefined;
  client: Sql;
}

interface BuildResult {
  days: SuggestedWeekDay[];
  matched: SuggestWeekResponse['matched_templates'];
  rest_days: number[];
}

async function buildWeekFromLibrary(args: BuildArgs): Promise<BuildResult> {
  const trainingSet = new Set(args.training_days);
  const rest_days: number[] = [];
  const matched: SuggestWeekResponse['matched_templates'] = [];
  const ranked = rankTemplatesForWeek(args);

  // Cache template_id → blocks para evitar re-fetch si el mismo template
  // se asigna a varios días (idempotente: blocks usan uids nuevos por llamada,
  // pero dentro de UNA llamada cada día tiene su propio uid set).
  const blocksCache = new Map<string, Awaited<ReturnType<typeof loadTemplateAsBlocks>>>();
  const blocksFor = async (templateId: string) => {
    if (!blocksCache.has(templateId)) {
      blocksCache.set(templateId, await loadTemplateAsBlocks(templateId, args.client));
    }
    return blocksCache.get(templateId)!;
  };

  // Rotación simple: vamos asignando templates de mejor a peor por día.
  let cursor = 0;
  const days: SuggestedWeekDay[] = [];

  for (let dow = 1 as 1 | 2 | 3 | 4 | 5 | 6 | 7; dow <= 7; dow = (dow + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7) {
    if (!trainingSet.has(dow)) {
      rest_days.push(dow);
      const restDay = weekDaySchema.parse({
        day_of_week: dow,
        sessions: [],
        focus: undefined,
        notes: undefined,
      });
      days.push({ ...restDay, preview_label: 'Descanso' });
      continue;
    }

    if (ranked.length === 0) {
      // No hay templates utilizables → día vacío como seed manual.
      const day = weekDaySchema.parse({
        day_of_week: dow,
        sessions: [{ kind: 'workout', template_id: null, blocks: [] }],
      });
      days.push({ ...day, preview_label: 'Sesión pendiente (sin plantilla)' });
      continue;
    }

    const tpl = ranked[cursor % ranked.length]!;
    cursor += 1;
    matched.push({
      day_of_week: dow,
      session_index: 0,
      template_id: tpl.id,
      template_name: tpl.name,
    });
    // Inline blocks del template (con uids nuevos por día) para que el Studio
    // tenga contenido renderizable sin tener que resolver template_id en cliente.
    const cached = await blocksFor(tpl.id);
    const dayBlocks = cloneBlocksWithFreshUids(cached);
    const day = weekDaySchema.parse({
      day_of_week: dow,
      sessions: [
        {
          kind: 'workout',
          template_id: Number(tpl.id),
          ...(dayBlocks.length > 0 ? { blocks: dayBlocks } : {}),
        },
      ],
      focus: focusHintForDay(dow, args),
    });
    days.push({ ...day, preview_label: tpl.name });
  }

  return { days, matched, rest_days };
}

function rankTemplatesForWeek(args: BuildArgs): TemplateRow[] {
  const focusTokens = args.focus.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  const levelMap: Record<NonNullable<BuildArgs['level']>, number> = {
    beginner: 1,
    intermediate: 2,
    pro: 3,
    elite: 3,
  };
  const targetLevel = args.level ? levelMap[args.level] : null;

  return [...args.templates]
    .map((t) => {
      let score = 0;
      const nameLc = t.name.toLowerCase();
      for (const tok of focusTokens) {
        if (nameLc.includes(tok)) score += 3;
      }
      if (args.atr_block && (t.target_block === args.atr_block || t.target_block === 'any')) {
        score += 2;
      }
      if (targetLevel != null && t.target_level === targetLevel) score += 1;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ t }) => t);
}

function focusHintForDay(dow: number, args: BuildArgs): string | undefined {
  // Heurística simple v1 — Pablo edita después.
  if (!args.atr_block) return undefined;
  if (args.atr_block === 'ACC') {
    return dow % 2 === 0 ? 'Volumen / Z2' : 'Fuerza';
  }
  if (args.atr_block === 'TRANS') {
    return dow === 3 ? 'Specific HYROX' : 'Threshold';
  }
  return dow === 6 ? 'Taper / sim corto' : 'Estaciones';
}

function defaultWeekName(focus: string, atr?: AtrBlockType): string {
  const block = atr ?? 'Semana';
  const head = focus.split(/[.,;]/)[0]!.trim().slice(0, 60);
  return `${block} · ${head || 'Pablo IA'}`;
}

// ---------------------------------------------------------------------------
// LLM ordering — el LLM solo ordena templates del catálogo + escribe focus.
// No genera bloques nuevos aquí (eso lo hace suggest-workout en modo slow).
// ---------------------------------------------------------------------------

/**
 * Acepta `template_names: string[]` (nuevo) o `template_name: string` (legacy
 * single). El `.transform` normaliza a array para downstream.
 */
const llmDaySchema = z
  .object({
    day_of_week: z.number().int().min(1).max(7),
    kind: z.enum(['rest', 'workout']),
    template_names: z.array(z.string().max(200)).max(4).optional(),
    template_name: z.string().max(200).optional().nullable(),
    focus: z.string().max(120).optional(),
    notes: z.string().max(400).optional(),
  })
  .transform((d) => {
    // Defensive: si el LLM responde con el shape viejo (single string), lo
    // promovemos a array. Si vienen ambos, prevalece `template_names`.
    const names =
      d.template_names && d.template_names.length > 0
        ? d.template_names
        : d.template_name
          ? [d.template_name]
          : [];
    return {
      day_of_week: d.day_of_week,
      kind: d.kind,
      template_names: names,
      focus: d.focus,
      notes: d.notes,
    };
  });

const llmWeekSchema = z.object({
  days: z.array(llmDaySchema).min(1).max(7),
});

interface LlmOrderArgs {
  focus: string;
  level: 'beginner' | 'intermediate' | 'pro' | 'elite';
  atr_block?: AtrBlockType | undefined;
  templates: TemplateRow[];
  training_days: number[];
  client: Sql;
  /**
   * C31 — calendario del box del atleta (días que va a clases presenciales
   * con Pablo). El LLM lo usa para evitar pisar la carga del box ese día.
   * `null` cuando la semana se genera como plantilla genérica.
   */
  box_class_schedule?: BoxScheduleForPrompt | null;
  /** Cost-telemetry context (A7). */
  coach_id: number | bigint;
  athlete_id?: number | bigint | null;
}

/**
 * Forma reducida que el LLM consume — un mapa día→tipo (legible). Si el
 * atleta es `box_member` pero no tiene calendario poblado, devolvemos
 * `{ days: [] }` (el prompt lo omite).
 */
export interface BoxScheduleForPrompt {
  days: Array<{ day_of_week: number; type: string; notes?: string | null }>;
}

const DOW_LABELS_ES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/**
 * Carga `users.box_class_schedule` para el atleta. Devuelve `null` si el
 * atleta no es `box_member`, no tiene calendario, o no existe.
 */
async function loadBoxClassScheduleForAthlete(
  client: Sql,
  athlete_id: number | string,
): Promise<BoxScheduleForPrompt | null> {
  const id = typeof athlete_id === 'string' ? Number(athlete_id) : athlete_id;
  if (!Number.isFinite(id)) return null;

  const rows = await client<
    Array<{ box_member: boolean; box_class_schedule: unknown }>
  >`
    select u.box_member, u.box_class_schedule
    from athletes a
    join users u on u.id = a.user_id
    where a.id = ${id}
    limit 1
  `;
  const row = rows[0];
  if (!row || !row.box_member) return null;

  const raw = row.box_class_schedule as
    | { days?: Array<{ day_of_week?: number; type?: string; notes?: string | null }> }
    | null;
  if (!raw || !Array.isArray(raw.days) || raw.days.length === 0) return null;

  const days = raw.days
    .filter(
      (d): d is { day_of_week: number; type: string; notes?: string | null } =>
        typeof d?.day_of_week === 'number' &&
        d.day_of_week >= 1 &&
        d.day_of_week <= 7 &&
        typeof d?.type === 'string' &&
        d.type.length > 0,
    )
    .map((d) => ({
      day_of_week: d.day_of_week,
      type: d.type,
      notes: d.notes ?? null,
    }));

  return { days };
}

/**
 * Render del calendario del box para el system prompt — 7 líneas legibles.
 * Si el día no tiene clase, se marca "—" para que el LLM lo lea claro.
 * Exportada para tests.
 */
export function formatBoxScheduleForPrompt(schedule: BoxScheduleForPrompt | null): string | null {
  if (!schedule || schedule.days.length === 0) return null;
  const byDow = new Map(schedule.days.map((d) => [d.day_of_week, d]));
  const lines: string[] = ['Calendario del box (días con clase del atleta):'];
  for (let dow = 1; dow <= 7; dow += 1) {
    const day = byDow.get(dow);
    const label = DOW_LABELS_ES[dow]!;
    if (!day) {
      lines.push(`  - ${label}: —`);
    } else {
      const note = day.notes ? ` (${day.notes})` : '';
      lines.push(`  - ${label}: ${day.type}${note}`);
    }
  }
  return lines.join('\n');
}

async function llmOrderWeek(args: LlmOrderArgs): Promise<BuildResult> {
  const boxBlock = formatBoxScheduleForPrompt(args.box_class_schedule ?? null);

  const systemLines = [
    'Eres Pablo IA, coach HYROX/hybrid élite — Fabrik Training Club Barcelona.',
    'Ordenas una SEMANA seleccionando templates EXACTOS del catálogo proporcionado.',
    'JSON exacto: { "days": [{ "day_of_week", "kind": "rest"|"workout", "template_names"?: string[], "focus"?, "notes"? }] }',
    'Reglas:',
    '- 7 días (1=lunes…7=domingo). Marca rest como kind:"rest" (sin template_names).',
    '- Cada día con kind:"workout" lleva 1-3 templates en `template_names[]` (máx 4). Cada template = 1 BLOQUE de la sesión (warmup / principal / finisher). El orden en el array es el orden en que se ejecutan.',
    '- Combinaciones típicas HYROX/élite:',
    '  • [warmup ligero] + [principal] + [finisher]  (sesión completa estándar)',
    '  • [warmup] + [principal]  (si principal ya es denso)',
    '  • [principal]  (si la sesión es muy específica y carga total alta — p.ej. simulacro)',
    '- NUNCA inventes templates: copia EXACTO los nombres del catálogo (case-sensitive si puedes, case-insensitive aceptable).',
    '- Respeta el bloque ATR si se indica (ACC=volumen aeróbico+fuerza máxima, TRANS=específico HYROX+threshold, REAL=race-pace y taper).',
    '- NUNCA combines un `cardio_running` con un `strength_block` en el MISMO día si el atleta está en deload o si el bloque ATR es REAL avanzado (compromete recovery del taper).',
    '- NUNCA pongas ejercicios cardio (running/rowing/ski erg/bike) dentro de un template con format=strength_block. Cardio vive en templates intervals, for_time, circuit, amrap, emom o hyrox_sim.',
    '- Sesión dura + recuperación / Z2 al día siguiente.',
    '- Lenguaje técnico ATR.',
  ];

  if (boxBlock) {
    systemLines.push(
      '',
      '- BOX-CLASS AWARENESS (este atleta entrena con Pablo en clases presenciales).',
      '  Si el box hace fuerza un día, ese día el plan va Z2 / técnica / recovery — NO añadas más fuerza pesada.',
      '  Si el box hace HYROX/metabolic ese día, el plan va aeróbico ligero o descanso activo — NO dupliques estaciones.',
      '  Misma lógica para running, rowing, intervals.',
      '  El objetivo es complementar, no apilar el mismo tipo de carga el mismo día.',
      boxBlock,
    );
  }

  const system = systemLines.join('\n');

  const tplList = args.templates
    .map((t) => `- "${t.name}" (format=${t.format}, block=${t.target_block}, level=${t.target_level ?? '?'})`)
    .join('\n');
  const user = [
    `Foco semana: ${args.focus}`,
    `Nivel: ${args.level}`,
    `Bloque ATR: ${args.atr_block ?? 'no especificado'}`,
    `Días entreno preferidos: ${args.training_days.join(', ')}`,
    '',
    'Catálogo de templates (copia los nombres EXACTOS en `template_names[]`, en orden de ejecución dentro del día):',
    tplList,
  ].join('\n');

  const raw = await callPabloIaLlmJson({
    system,
    user,
    meta: {
      surface: 'suggest_week',
      coach_id: args.coach_id,
      athlete_id: args.athlete_id ?? null,
    },
    temperature: 0.3,
    max_tokens: Number(process.env.LLM_CHAT_MAX_TOKENS_WEEK ?? 2048),
  });

  const parsed = llmWeekSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PabloIaLlmError('invalid_json', `LLM week schema inválido: ${parsed.error.message}`);
  }

  const byName = new Map(args.templates.map((t) => [t.name.trim().toLowerCase(), t]));
  const matched: SuggestWeekResponse['matched_templates'] = [];
  const rest_days: number[] = [];

  // Cache blocks por template_id (un mismo template puede repetirse en
  // varios días — solo fetch una vez, uids únicos por día).
  const blocksCache = new Map<string, Awaited<ReturnType<typeof loadTemplateAsBlocks>>>();
  const blocksFor = async (templateId: string) => {
    if (!blocksCache.has(templateId)) {
      blocksCache.set(templateId, await loadTemplateAsBlocks(templateId, args.client));
    }
    return blocksCache.get(templateId)!;
  };

  // Completa 7 días (rellena rest si LLM se dejó alguno).
  const llmByDow = new Map(parsed.data.days.map((d) => [d.day_of_week, d]));
  const days: SuggestedWeekDay[] = [];

  for (let dow = 1; dow <= 7; dow += 1) {
    const item = llmByDow.get(dow);
    if (!item || item.kind === 'rest' || item.template_names.length === 0) {
      rest_days.push(dow);
      const restDay = weekDaySchema.parse({ day_of_week: dow, sessions: [] });
      days.push({ ...restDay, preview_label: 'Descanso' });
      continue;
    }

    // Resolver cada nombre → template del catálogo. Los no-match se anotan
    // en `notes` (concat al notes del LLM) y se omiten (no rompen el día).
    const resolved: TemplateRow[] = [];
    const missing: string[] = [];
    for (const rawName of item.template_names) {
      const tpl = byName.get(rawName.trim().toLowerCase());
      if (tpl) resolved.push(tpl);
      else missing.push(rawName);
    }

    if (resolved.length === 0) {
      // Todos los names fueron inventados → día vacío con focus + nota.
      const noMatchNote = `Sin match: ${missing.map((m) => `"${m}"`).join(', ')}`;
      const day = weekDaySchema.parse({
        day_of_week: dow,
        sessions: [{ kind: 'workout', template_id: null, blocks: [] }],
        focus: item.focus,
        notes: [item.notes, noMatchNote].filter(Boolean).join(' · '),
      });
      days.push({ ...day, preview_label: noMatchNote });
      continue;
    }

    // Materializar: por cada template resuelto, cargar sus parts y
    // concatenar al `blocks[]` único del día (1 sesión, N bloques).
    // `cloneBlocksWithFreshUids` garantiza uids únicos por instancia, incluso
    // si el mismo template aparece dos veces o en varios días.
    const aggregatedBlocks: WeekDayPart[] = [];
    for (let i = 0; i < resolved.length; i += 1) {
      const tpl = resolved[i]!;
      matched.push({
        day_of_week: dow,
        session_index: i,
        template_id: tpl.id,
        template_name: tpl.name,
      });
      const cached = await blocksFor(tpl.id);
      const cloned = cloneBlocksWithFreshUids(cached);
      aggregatedBlocks.push(...cloned);
    }

    // `template_id` queda referenciado al primer template resuelto. El
    // Studio renderiza desde `blocks[]` (que incluye TODOS los templates),
    // así que esa referencia es solo informativa para "abrir como template".
    const primaryTpl = resolved[0]!;
    const dayNotes =
      missing.length > 0
        ? [item.notes, `Sin match: ${missing.map((m) => `"${m}"`).join(', ')}`]
            .filter(Boolean)
            .join(' · ')
        : item.notes;
    const previewLabel =
      resolved.length === 1
        ? primaryTpl.name
        : resolved.map((t) => t.name).join(' + ');

    const day = weekDaySchema.parse({
      day_of_week: dow,
      sessions: [
        {
          kind: 'workout',
          template_id: Number(primaryTpl.id),
          ...(aggregatedBlocks.length > 0 ? { blocks: aggregatedBlocks } : {}),
        },
      ],
      focus: item.focus,
      notes: dayNotes,
    });
    days.push({ ...day, preview_label: previewLabel });
  }

  return { days, matched, rest_days };
}
