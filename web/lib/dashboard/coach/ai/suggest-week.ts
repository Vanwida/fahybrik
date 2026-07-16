import 'server-only';

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  weekDaySchema,
  type WeekDay,
} from '@fahybrid/shared/schema/program-templates';
import { isCoachIaLlmConfigured, CoachIaLlmError } from './llm';
import { loadTemplateAsBlocks } from './template-to-blocks';
import { newBlockUid } from '@/lib/dashboard/programming/studio-types';
import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import {
  composeDeadline,
  composeSession,
  loadExerciseCatalog,
  planWeekSkeleton,
  type CatalogExercise,
} from './compose-week';

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
  const usable = templates.filter((t) => t.segment_count > 0);

  // Distribución por defecto: 6 días entrenamiento + 1 descanso (domingo).
  const trainingDays = computeTrainingDayDistribution(req.days_per_week);

  // ---- Fast mode (default) -------------------------------------------------
  if (req.mode === 'fast' || !isCoachIaLlmConfigured()) {
    const filled = await buildWeekFromLibrary({
      training_days: trainingDays,
      templates: usable,
      focus: req.focus,
      level: req.level,
      client,
    });
    return {
      mode: req.mode,
      source: req.mode === 'slow' && !isCoachIaLlmConfigured() ? 'library_fallback' : 'library',
      name: req.name ?? defaultWeekName(req.focus),
      focus: req.focus,
      days: filled.days,
      matched_templates: filled.matched,
      rest_days: filled.rest_days,
      notes:
        req.mode === 'slow' && !isCoachIaLlmConfigured()
          ? 'LLM no configurado: semana compuesta desde plantillas del catálogo.'
          : undefined,
    };
  }

  // ---- Slow mode: LLM ordena el catálogo y pone foco día a día -------------
  // C31 — si la request trae athlete_id, cargamos su calendario de box para
  // que el LLM no apile carga del mismo tipo el día que el atleta hace clase
  // presencial con su coach.
  const boxClassSchedule = req.athlete_id != null
    ? await loadBoxClassScheduleForAthlete(client, req.athlete_id)
    : null;

  try {
    const planned = await composeWeekPlan({
      focus: req.focus,
      level: req.level ?? 'pro',
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
      name: req.name ?? defaultWeekName(req.focus),
      focus: req.focus,
      days: planned.days,
      matched_templates: planned.matched,
      rest_days: planned.rest_days,
      notes: planned.notes,
    };
  } catch (err) {
    const fallback = await buildWeekFromLibrary({
      training_days: trainingDays,
      templates: usable,
      focus: req.focus,
      level: req.level,
      client,
    });
    const notes =
      err instanceof CoachIaLlmError
        ? `Coach IA LLM falló (${err.code}); semana compuesta desde el catálogo.`
        : 'Coach IA LLM falló; semana compuesta desde el catálogo.';
    return {
      mode: 'slow',
      source: 'library_fallback',
      name: req.name ?? defaultWeekName(req.focus),
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

/**
 * The coach's TRAINING library — and only that.
 *
 * Calibration tests (5K control, Remo 2K, Batería 1RM, HYROX half-sim) live in the
 * same `templates` table, and dealing them into a week is what produced the
 * garbage: a coach whose library held nothing but his four tests got a week of
 * tests. A test MEASURES the athlete; it is not a session and can never be one, so
 * it is excluded here, at the source, for every caller.
 *
 * `coach_calibration_tests.template_id` is the canonical marker (mig 0112); the
 * legacy `meta_json ? 'calibration'` mirror is still written on every materialize,
 * so both are checked — a test must fail BOTH to count as training.
 */
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
      and not exists (
        select 1 from coach_calibration_tests cct
        where cct.template_id = t.id
      )
      and not (t.meta_json ? 'calibration')
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
  level?: z.infer<typeof programLevel> | undefined;
  client: Sql;
}

interface BuildResult {
  days: SuggestedWeekDay[];
  matched: SuggestWeekResponse['matched_templates'];
  rest_days: number[];
  /** Surfaced to the coach when the week came back thinner than planned. */
  notes?: string | undefined;
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
      if (targetLevel != null && t.target_level === targetLevel) score += 1;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ t }) => t);
}

function defaultWeekName(focus: string): string {
  const head = focus.split(/[.,;]/)[0]!.trim().slice(0, 60);
  return `Semana · ${head || 'Coach IA'}`;
}

// ---------------------------------------------------------------------------
// Slow mode = COMPOSITION. The model plans the week's skeleton, then one call per
// session WRITES that session from the exercise catalog with a full prescription
// on every item. It used to only re-order the coach's existing templates, which
// is why an empty library produced a week of calibration tests: a selector can
// only ever hand back what is already there.
// ---------------------------------------------------------------------------

interface ComposeWeekArgs {
  focus: string;
  level: 'beginner' | 'intermediate' | 'pro' | 'elite';
  templates: TemplateRow[];
  training_days: number[];
  client: Sql;
  /**
   * C31 — calendario del box del atleta (días que va a clases presenciales
   * con su coach). El LLM lo usa para evitar pisar la carga del box ese día.
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


/**
 * Compose the week: plan the skeleton, then write every session in PARALLEL.
 *
 * The coach's own templates win wherever the skeleton found one that fits (his
 * method is the product; ours is the fallback). Everything else is composed from
 * the exercise catalog with a full prescription per item.
 *
 * One session failing must not cost the coach his week, so the fan-out is
 * `allSettled` and a failed session degrades to an empty day. Only a total wipeout
 * throws, which hands the caller its library fallback.
 */
async function composeWeekPlan(args: ComposeWeekArgs): Promise<BuildResult> {
  const catalog = await loadExerciseCatalog(args.client);
  if (catalog.length === 0) {
    throw new CoachIaLlmError('empty', 'El catálogo de ejercicios está vacío.');
  }
  const byId = new Map(catalog.map((e) => [e.id, e]));

  const skeleton = await planWeekSkeleton({
    focus: args.focus,
    level: args.level,
    training_days: args.training_days,
    library: args.templates.map((t) => ({
      id: t.id,
      name: t.name,
      format: t.format,
      target_block: t.target_block,
      target_level: t.target_level,
    })),
    box_block: formatBoxScheduleForPrompt(args.box_class_schedule ?? null),
    coach_id: args.coach_id,
    athlete_id: args.athlete_id ?? null,
  });

  const byName = new Map(args.templates.map((t) => [t.name.trim().toLowerCase(), t]));

  interface Task {
    dow: number;
    index: number;
    theme: string;
    template?: TemplateRow;
    modalities: Modality[];
    intensity: string;
  }
  const tasks: Task[] = [];
  for (const d of skeleton.days) {
    if (d.kind === 'rest') continue;
    d.sessions.forEach((s, index) => {
      const tpl = s.library_template_name
        ? byName.get(s.library_template_name.trim().toLowerCase())
        : undefined;
      tasks.push({
        dow: d.day_of_week,
        index,
        theme: s.theme,
        ...(tpl ? { template: tpl } : {}),
        modalities: s.modalities,
        intensity: s.intensity,
      });
    });
  }

  // Fan out: every session composed at once. A single 7-day call is what hit the
  // token ceiling and came back truncated; per-session calls each have room for a
  // real dose, and running them together keeps this inside the route's budget.
  // The deadline is shared by every session, so retries stop collectively rather
  // than each session independently walking the whole week into a timeout.
  const deadline_ms = composeDeadline();
  const settled = await Promise.allSettled(
    tasks.map(async (t) => {
      if (t.template) {
        const blocks = cloneBlocksWithFreshUids(
          await loadTemplateAsBlocks(t.template.id, args.client),
        );
        return { task: t, blocks: stampModalityFromCatalog(blocks, byId) };
      }
      const composed = await composeSession({
        focus: args.focus,
        level: args.level,
        day_label: DOW_LABELS_ES[t.dow] ?? `Día ${t.dow}`,
        theme: t.theme,
        modalities: t.modalities,
        intensity: t.intensity,
        catalog,
        coach_id: args.coach_id,
        athlete_id: args.athlete_id ?? null,
        deadline_ms,
      });
      return { task: t, blocks: composed.blocks };
    }),
  );

  const ok = settled.filter(
    (r): r is PromiseFulfilledResult<{ task: Task; blocks: WeekDayPart[] }> =>
      r.status === 'fulfilled' && r.value.blocks.length > 0,
  );
  if (tasks.length > 0 && ok.length === 0) {
    throw new CoachIaLlmError('empty', 'Ninguna sesión se pudo componer.');
  }
  // A session that failed leaves its day empty. Say so: a coach who asked for six
  // days and silently got three has no way to tell a rest day from a failure.
  const failed = tasks.length - ok.length;
  const notes =
    failed > 0
      ? `${failed} de ${tasks.length} sesiones no se pudieron componer y quedaron vacías. Reintenta o complétalas a mano.`
      : undefined;

  // Assemble the seven days.
  const byDow = new Map<number, Array<{ task: Task; blocks: WeekDayPart[] }>>();
  for (const r of ok) {
    const list = byDow.get(r.value.task.dow) ?? [];
    list.push(r.value);
    byDow.set(r.value.task.dow, list);
  }

  const skeletonByDow = new Map(skeleton.days.map((d) => [d.day_of_week, d]));
  const matched: SuggestWeekResponse['matched_templates'] = [];
  const rest_days: number[] = [];
  const days: SuggestedWeekDay[] = [];

  for (let dow = 1; dow <= 7; dow += 1) {
    const sessions = (byDow.get(dow) ?? []).sort((a, b) => a.task.index - b.task.index);
    if (sessions.length === 0) {
      rest_days.push(dow);
      const restDay = weekDaySchema.parse({ day_of_week: dow, sessions: [] });
      days.push({ ...restDay, preview_label: 'Descanso' });
      continue;
    }

    // AM/PM lives only in the editor's session model, not in `WeekSession`, and
    // the review grid flattens a day's sessions into one. So on a double-session
    // day the split is carried in the block titles — the coach sees both, labelled.
    const isDouble = sessions.length > 1;
    const weekSessions = sessions.map(({ task, blocks }, i) => ({
      kind: 'workout' as const,
      ...(task.template ? { template_id: Number(task.template.id) } : {}),
      blocks: isDouble ? prefixBlockTitles(blocks, i === 0 ? 'AM' : 'PM') : blocks,
      focus: task.theme,
    }));

    sessions.forEach(({ task }, session_index) => {
      if (!task.template) return;
      matched.push({
        day_of_week: dow,
        session_index,
        template_id: task.template.id,
        template_name: task.template.name,
      });
    });

    const skel = skeletonByDow.get(dow);
    const day = weekDaySchema.parse({
      day_of_week: dow,
      sessions: weekSessions,
      ...(skel?.focus ? { focus: skel.focus } : {}),
    });
    days.push({ ...day, preview_label: sessions.map((s) => s.task.theme).join(' + ') });
  }

  return { days, matched, rest_days, notes };
}

/**
 * Stamp each item's modality from the catalog. Modality is a property of the
 * EXERCISE (mig 0053), so the catalog is its only truth — and stamping it here
 * means the completeness gate reads the same truth for a library item as for a
 * composed one, instead of trusting whatever the source happened to record.
 */
function stampModalityFromCatalog(
  blocks: WeekDayPart[],
  byId: Map<number, CatalogExercise>,
): WeekDayPart[] {
  return blocks.map((part) => ({
    ...part,
    items: part.items.map((it) => {
      const ex = byId.get(Number(it.exercise_id));
      if (!ex || !it.prescription_json) return it;
      return {
        ...it,
        prescription_json: { ...it.prescription_json, modality: ex.modality },
      };
    }),
  }));
}

/** Label a double session's blocks so the AM/PM split survives the flattening. */
function prefixBlockTitles(blocks: WeekDayPart[], prefix: string): WeekDayPart[] {
  return blocks.map((b) => ({ ...b, title: `${prefix} · ${b.title}` }));
}
