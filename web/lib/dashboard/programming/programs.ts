import 'server-only';

// Programas (PLAN §6 «Programar»): la lista y el editor de rejilla. Por debajo
// es lo de siempre — `program_month_templates` (el programa) → `program_month_weeks`
// (orden) → `program_week_templates.slots_json` (los días). Los identificadores
// técnicos no se renombran (DECISIONS 2026-09-23, decisión 3).
//
// Solo programas de BIBLIOTECA (`athlete_id is null`): un plan personal de un
// atleta se edita desde su ficha, no aquí.

import { groupRuleName } from '@fahybrid/shared/domain/coach/level-axis';
import { sql as defaultSql, type Sql } from '@/lib/db';
import {
  weekDaySchema,
  type WeekDay,
} from '@fahybrid/shared/schema/program-templates';
import { resolveProgressionSteps, type ProgressionSteps } from '@fahybrid/shared/domain/coach/progression-steps';
import { loadMonthTemplateWithWeeks } from '@/lib/dashboard/coach/program-months';
import { upsertWeekTemplate } from '@/lib/dashboard/coach/program-weeks';
import { resyncWeekTemplateAssignments } from '@/lib/dashboard/coach/instantiate-program';
import { invisibleExerciseIds } from '@/lib/exercises/coach-override';
import { loadCoachMaxMicrocicloWeeks } from '@/lib/coach/microcycle-limits';
import { checkAssignableLevel, listLevelOptions, type LevelOption } from '@/lib/coach/level-options';
import { mergeDayIntoDays } from '@/lib/dashboard/v2/editor-serialize';

export class ProgramError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ProgramError';
  }
}

// ── Lista ────────────────────────────────────────────────────────────────────

export interface ProgramRow {
  id: string;
  name: string;
  level: { id: string; name: string; label: string } | null;
  tags: string[];
  weeks: number;
  /** Entrenos con contenido en todo el programa. */
  sessions: number;
  /** Atletas con este programa en curso o por empezar. */
  used_by: number;
  groups: Array<{ id: string; name: string }>;
  updated_at: string;
  archived: boolean;
}

export async function listPrograms(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<ProgramRow[]> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const rows = await client<
    Array<{
      id: string;
      name: string;
      level_id: string | null;
      level_name: string | null;
      level_label: string | null;
      tags: string[];
      weeks: number;
      sessions: number;
      used_by: number;
      groups: Array<{ id: string; name: string | null; level: string | null; days: number | null }> | null;
      updated_at: string;
      archived: boolean;
      axis_label: string | null;
    }>
  >`
    with progs as (
      select m.id, m.name, m.level_id, m.tags, m.archived_at, m.updated_at
      from program_month_templates m
      where m.coach_id = ${coachId} and m.athlete_id is null
    ),
    wk as (
      select mw.month_template_id as id,
             count(*)::int as weeks,
             greatest(max(w.updated_at), max(p.updated_at)) as last_edit,
             coalesce(sum((
               select count(*) from jsonb_array_elements(coalesce(w.slots_json->'days', '[]'::jsonb)) d,
                      jsonb_array_elements(coalesce(d->'sessions', '[]'::jsonb)) s
               where s->>'kind' = 'workout' and jsonb_array_length(coalesce(s->'blocks', '[]'::jsonb)) > 0
             )), 0)::int as sessions
      from program_month_weeks mw
      join progs p on p.id = mw.month_template_id
      join program_week_templates w on w.id = mw.week_template_id
      group by mw.month_template_id
    ),
    used as (
      select a.month_template_id as id, count(distinct a.athlete_id)::int as n
      from athlete_month_assignments a
      join progs p on p.id = a.month_template_id
      join athletes ath on ath.id = a.athlete_id and ath.coach_id = ${coachId}
      where a.end_date >= current_date
      group by a.month_template_id
    ),
    grp as (
      select i.month_template_id as id,
             jsonb_agg(distinct jsonb_build_object('id', s.id::text, 'name', s.name, 'level', al.name, 'days', s.days_per_week)) as groups
      from program_sequence_items i
      join program_sequences s on s.id = i.sequence_id and s.coach_id = ${coachId}
      left join athlete_levels al on al.id = s.level_id
      join progs p on p.id = i.month_template_id
      group by i.month_template_id
    )
    select p.id::text, p.name,
           p.level_id::text as level_id, al.name as level_name, al.label as level_label,
           p.tags,
           coalesce(wk.weeks, 0) as weeks,
           coalesce(wk.sessions, 0) as sessions,
           coalesce(used.n, 0) as used_by,
           grp.groups,
           coalesce(wk.last_edit, p.updated_at)::text as updated_at,
           (p.archived_at is not null) as archived,
           (select c.level_axis_label from coaches c where c.id = ${coachId}) as axis_label
    from progs p
    left join athlete_levels al on al.id = p.level_id
    left join wk on wk.id = p.id
    left join used on used.id = p.id
    left join grp on grp.id = p.id
    order by coalesce(wk.last_edit, p.updated_at) desc, p.id desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    level: r.level_id ? { id: r.level_id, name: r.level_name ?? '', label: r.level_label ?? r.level_name ?? '' } : null,
    tags: r.tags ?? [],
    weeks: r.weeks,
    sessions: r.sessions,
    used_by: r.used_by,
    groups: (r.groups ?? []).map((g) => ({
      id: g.id,
      name:
        g.name?.trim() ||
        groupRuleName({ axis_label: r.axis_label, level_name: g.level, days_per_week: g.days }) ||
        'Grupo sin nombre',
    })),
    updated_at: r.updated_at,
    archived: r.archived,
  }));
}

export async function setProgramArchived(params: {
  coach_id: number | bigint;
  program_id: number;
  archived: boolean;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  const rows = await client`
    update program_month_templates
    set archived_at = ${params.archived ? client`now()` : null}, updated_at = now()
    where id = ${params.program_id} and coach_id = ${Number(params.coach_id)} and athlete_id is null
    returning id
  `;
  if (rows.length === 0) throw new ProgramError('not_found', 'Ese programa no existe.', 404);
}

export async function updateProgramMeta(params: {
  coach_id: number | bigint;
  program_id: number;
  patch: { name?: string; level_id?: number | null; tags?: string[] };
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const { patch } = params;
  if (patch.level_id != null) {
    const current = await client<Array<{ level_id: string | null }>>`
      select level_id::text from program_month_templates
      where id = ${params.program_id} and coach_id = ${coachId} and athlete_id is null
    `;
    const check = await checkAssignableLevel(client, coachId, patch.level_id, [current[0]?.level_id]);
    if (!check.ok) throw new ProgramError('invalid_level', check.message, 400);
  }
  const rows = await client`
    update program_month_templates set
      name = ${patch.name ?? client`name`},
      level_id = ${patch.level_id === undefined ? client`level_id` : patch.level_id},
      tags = ${patch.tags === undefined ? client`tags` : patch.tags},
      updated_at = now()
    where id = ${params.program_id} and coach_id = ${coachId} and athlete_id is null
    returning id
  `;
  if (rows.length === 0) throw new ProgramError('not_found', 'Ese programa no existe.', 404);
}

// ── Editor de rejilla ────────────────────────────────────────────────────────

export interface ProgramGridWeek {
  id: string;
  index: number;
  focus: string | null;
  days: WeekDay[];
}

export interface ProgramGrid {
  program: ProgramRow;
  weeks: ProgramGridWeek[];
  steps: ProgressionSteps;
  max_weeks: number;
  levels: LevelOption[];
}

export async function loadProgramGrid(params: {
  coach_id: number | bigint;
  program_id: number;
  client?: Sql;
}): Promise<ProgramGrid | null> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const full = await loadMonthTemplateWithWeeks({ coach_id: coachId, month_id: params.program_id, client });
  if (!full || full.month.athlete_id != null) return null;

  const [list, coachRows, maxWeeks] = await Promise.all([
    listPrograms({ coach_id: coachId, client }),
    client<Array<{ progression_load_step_pct: string | null; progression_sets_step: number | null; deload_volume_pct: number | null }>>`
      select progression_load_step_pct::text, progression_sets_step, deload_volume_pct
      from coaches where id = ${coachId}
    `,
    loadCoachMaxMicrocicloWeeks({ coach_id: coachId, client }),
  ]);
  const program = list.find((p) => p.id === String(params.program_id));
  if (!program) return null;
  // Activos, más el del programa aunque esté retirado: el selector no lo pierde.
  const levels = await listLevelOptions(coachId, { keep: [program.level?.id], client });
  const c = coachRows[0] ?? { progression_load_step_pct: null, progression_sets_step: null, deload_volume_pct: null };

  return {
    program,
    weeks: full.weeks
      .slice()
      .sort((a, b) => a.week_index - b.week_index)
      .map((w, i) => ({ id: w.id, index: i, focus: w.focus, days: w.slots_json.days })),
    steps: resolveProgressionSteps(c),
    max_weeks: maxWeeks,
    levels,
  };
}

export interface CellInput {
  week_id: string;
  day_of_week: number;
  day?: unknown;
}

/**
 * Un entreno con líneas escritas en la celda es ESE contenido. El materializador
 * clona `template_id` si lo hay e ignora los bloques en línea
 * (instantiate-program: «1) template_id → lo clonamos»), así que un entreno
 * editado en la rejilla que conservara un `template_id` viejo le llegaría al
 * atleta sin la edición. Solo se suelta cuando hay líneas: un entreno que vive
 * únicamente en su plantilla (sin bloques en línea) se queda como estaba.
 */
function inlineWins(day: WeekDay): WeekDay {
  return {
    ...day,
    sessions: day.sessions.map((s) =>
      s.template_id != null && (s.blocks ?? []).some((b) => (b.items ?? []).length > 0) ? { ...s, template_id: null } : s,
    ),
  };
}

function exerciseIdsOf(days: WeekDay[]): number[] {
  return days.flatMap((d) => d.sessions.flatMap((s) => (s.blocks ?? []).flatMap((b) => b.items.map((it) => Number(it.exercise_id)))));
}

/**
 * Guarda un lote de celdas (un pegado, un «Progresar», una edición, un deshacer)
 * en UNA transacción: todas o ninguna. Cada día se valida con el mismo esquema
 * que el resto de escritores de `slots_json`; los ejercicios nuevos tienen que
 * ser visibles para el coach. Después, cada semana tocada se re-sincroniza con
 * los atletas que la tienen (0158, best-effort: el guardado ya es firme).
 */
export async function writeCells(params: {
  coach_id: number | bigint;
  program_id: number;
  cells: CellInput[];
  client?: Sql;
}): Promise<{ weeks: string[]; synced: number }> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);

  const parsed = params.cells.map((c) => {
    const r = weekDaySchema.safeParse(c.day);
    if (!r.success) throw new ProgramError('invalid_day', `Un día no es válido: ${r.error.issues[0]?.message ?? 'formato'}`, 400);
    if (r.data.day_of_week !== c.day_of_week) throw new ProgramError('invalid_day', 'El día no coincide con su columna.', 400);
    return { week_id: String(c.week_id), day: inlineWins(r.data as WeekDay) };
  });

  const touched = await client.begin(async (tx) => {
    const t = tx as unknown as Sql;
    const weeks = await t<Array<{ id: string; name: string; focus: string | null; coach_notes: string | null; slots_json: unknown }>>`
      select w.id::text, w.name, w.focus, w.coach_notes, w.slots_json
      from program_month_weeks mw
      join program_month_templates m on m.id = mw.month_template_id
      join program_week_templates w on w.id = mw.week_template_id
      where mw.month_template_id = ${params.program_id}
        and m.coach_id = ${coachId} and w.coach_id = ${coachId}
      for update of w
    `;
    if (weeks.length === 0) throw new ProgramError('not_found', 'Ese programa no existe.', 404);
    const byId = new Map(weeks.map((w) => [w.id, w]));
    for (const c of parsed) {
      if (!byId.has(c.week_id)) throw new ProgramError('not_found', 'Esa semana no es de este programa.', 404);
    }

    const current = weeks.flatMap((w) => ((w.slots_json as { days?: WeekDay[] } | null)?.days ?? []) as WeekDay[]);
    const known = new Set(exerciseIdsOf(current));
    const fresh = exerciseIdsOf(parsed.map((c) => c.day)).filter((id) => !known.has(id));
    if (fresh.length > 0 && (await invisibleExerciseIds(t, coachId, fresh)).length > 0) {
      throw new ProgramError('invalid_exercise', 'Hay un ejercicio que no está en tu catálogo.', 400);
    }

    const grouped = new Map<string, WeekDay[]>();
    for (const c of parsed) grouped.set(c.week_id, [...(grouped.get(c.week_id) ?? []), c.day]);
    for (const [weekId, days] of grouped) {
      const w = byId.get(weekId)!;
      let next = (((w.slots_json as { days?: WeekDay[] } | null)?.days ?? []) as WeekDay[]).slice();
      for (const d of days) next = mergeDayIntoDays(next, d);
      await upsertWeekTemplate({
        coach_id: coachId,
        id: Number(weekId),
        payload: { name: w.name, focus: w.focus, coach_notes: w.coach_notes, slots_json: { days: next } },
        client: t,
      });
    }
    await t`update program_month_templates set updated_at = now() where id = ${params.program_id}`;
    return [...grouped.keys()];
  });

  let synced = 0;
  for (const weekId of touched) {
    try {
      const r = await resyncWeekTemplateAssignments({ coach_id: coachId, week_template_id: Number(weekId), client });
      synced += r.microcycles_checked;
    } catch {
      // best-effort: el guardado de la plantilla ya es firme (ver la ruta del día).
    }
  }
  return { weeks: touched, synced };
}

export async function loadProgressionSteps(coach_id: number | bigint, client: Sql = defaultSql): Promise<ProgressionSteps> {
  const rows = await client<Array<{ progression_load_step_pct: string | null; progression_sets_step: number | null; deload_volume_pct: number | null }>>`
    select progression_load_step_pct::text, progression_sets_step, deload_volume_pct from coaches where id = ${Number(coach_id)}
  `;
  return resolveProgressionSteps(rows[0] ?? { progression_load_step_pct: null, progression_sets_step: null, deload_volume_pct: null });
}

export async function saveProgressionSteps(params: {
  coach_id: number | bigint;
  patch: { load_step_pct?: number | null; sets_step?: number | null; deload_volume_pct?: number | null };
  client?: Sql;
}): Promise<ProgressionSteps> {
  const client = params.client ?? defaultSql;
  const p = params.patch;
  await client`
    update coaches set
      progression_load_step_pct = ${p.load_step_pct === undefined ? client`progression_load_step_pct` : p.load_step_pct},
      progression_sets_step = ${p.sets_step === undefined ? client`progression_sets_step` : p.sets_step},
      deload_volume_pct = ${p.deload_volume_pct === undefined ? client`deload_volume_pct` : p.deload_volume_pct}
    where id = ${Number(params.coach_id)}
  `;
  return loadProgressionSteps(params.coach_id, client);
}
