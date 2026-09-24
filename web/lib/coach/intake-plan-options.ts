import 'server-only';

// Las opciones de plan de la pantalla del alta, con lo que recibiría el atleta en
// cada una YA calculado (la misma previa que «asignar a varios», sin escribir
// nada): su plan actual si ya tiene uno (entró en su grupo al invitarle), cada
// grupo del coach con el programa y la semana en que entraría el lunes, y los
// programas de la biblioteca. La pantalla solo elige y lo cuenta en una línea.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { autoPublishDate } from '@fahybrid/shared/domain/coach/week-publishing';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import type { IntakePlanSummary } from './intake-plan-line';
import { loadCoachTimezone } from '@/lib/coach/coach-timezone';

/** Lunes que se ofrecen para empezar un programa (el que viene y los siguientes). */
export const INTAKE_START_MONDAYS = 4;
/** Cordura: con más grupos, la previa se pide al elegir (no se calculan todos). */
const MAX_GROUP_PREVIEWS = 12;

export interface IntakeGroupOption {
  id: string;
  name: string;
  /** Lo que recibiría entrando el lunes que viene; `null` si no se puede. */
  preview: IntakePlanSummary | null;
  /** Por qué no se puede entrar (grupo sin programas, ya está dentro…). */
  blocked: string | null;
}

export interface IntakePlanOptions {
  today: string;
  auto_publish_days: number;
  /** Lunes posibles para empezar (el primero, el que viene). */
  mondays: string[];
  /** Lo que ya tiene (con `kind: 'keep'`), o `null` si no tiene plan. */
  current: IntakePlanSummary | null;
  /** El grupo en el que ya está (aunque su plan aún no exista). */
  current_group: { id: string; name: string } | null;
  groups: IntakeGroupOption[];
  programs: Array<{ id: string; name: string; weeks: number }>;
}

export async function loadIntakePlanOptions(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<IntakePlanOptions> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const ath = params.athlete_id;
  const { boxToday, getAutoPublishSetting } = await import('./week-publishing');
  const today = boxToday(new Date(), await loadCoachTimezone(coachId, client));
  const thisMonday = mondayOfWeek(parseIsoDate(today));
  const mondays = Array.from({ length: INTAKE_START_MONDAYS }, (_, i) => isoDateString(addDays(thisMonday, 7 * (i + 1))));
  const n = (await getAutoPublishSetting(coachId, client)).effective_days;

  const [plan, group, hidden, groups, programs] = await Promise.all([
    client<Array<{ name: string; start: string; end: string }>>`
      select pmt.name, to_char(ama.start_date, 'YYYY-MM-DD') as start, to_char(ama.end_date, 'YYYY-MM-DD') as end
      from athlete_month_assignments ama
      join program_month_templates pmt on pmt.id = ama.month_template_id
      join athletes a on a.id = ama.athlete_id and a.coach_id = ${coachId}
      where ama.athlete_id = ${ath} and ama.end_date >= ${today}::date
      order by ama.start_date asc
      limit 1
    `,
    client<Array<{ id: string; name: string | null }>>`
      select ps.id::text, ps.name
      from athlete_sequence_progress asp
      join program_sequences ps on ps.id = asp.sequence_id and ps.coach_id = ${coachId}
      where asp.athlete_id = ${ath} and asp.status = 'active'
      limit 1
    `,
    // La primera semana suya con entrenos que aún no ve (desde esta).
    client<Array<{ week_start: string; manual: boolean }>>`
      select to_char(wp.week_start, 'YYYY-MM-DD') as week_start, wp.delivery_mode = 'manual' as manual
      from weekly_plans wp
      where wp.athlete_id = ${ath} and wp.status = 'draft' and wp.week_start >= ${isoDateString(thisMonday)}::date
        and exists (
          select 1 from workout_assignments wa
          where wa.athlete_id = wp.athlete_id and wa.origin = 'coach'
            and wa.scheduled_for between wp.week_start and wp.week_start + 6
        )
      order by wp.week_start asc
      limit 1
    `,
    client<Array<{ id: string; name: string | null; items: number }>>`
      select ps.id::text, ps.name,
             (select count(*)::int from program_sequence_items i where i.sequence_id = ps.id) as items
      from program_sequences ps
      where ps.coach_id = ${coachId}
      order by ps.name nulls last, ps.id
    `,
    client<Array<{ id: string; name: string; weeks: number }>>`
      select p.id::text, p.name,
             (select count(*)::int from program_month_weeks w where w.month_template_id = p.id) as weeks
      from program_month_templates p
      where p.coach_id = ${coachId} and p.athlete_id is null
      order by p.name, p.id
    `,
  ]);

  const p = plan[0];
  const current: IntakePlanSummary | null = p
    ? {
        kind: 'keep',
        group_name: group[0]?.name ?? null,
        program_name: p.name,
        week: p.start > today ? 1 : Math.floor((Date.parse(today) - Date.parse(p.start)) / (7 * 86_400_000)) + 1,
        weeks: Math.round((Date.parse(p.end) - Date.parse(p.start)) / (7 * 86_400_000)) || null,
        start_date: hidden[0]?.week_start ?? null,
        visible_on: hidden[0] ? (hidden[0].manual ? null : autoPublishDate(hidden[0].week_start, n)) : null,
      }
    : null;

  const { runGroupJoin } = await import('./assign-many');
  const groupOptions: IntakeGroupOption[] = [];
  for (const [i, g] of groups.entries()) {
    const name = g.name ?? 'Grupo sin nombre';
    if (g.items === 0) {
      groupOptions.push({ id: g.id, name, preview: null, blocked: 'Este grupo aún no tiene programas' });
      continue;
    }
    if (group[0]?.id === g.id) {
      groupOptions.push({ id: g.id, name, preview: null, blocked: 'Ya está en este grupo' });
      continue;
    }
    if (i >= MAX_GROUP_PREVIEWS) {
      groupOptions.push({ id: g.id, name, preview: null, blocked: null });
      continue;
    }
    try {
      const res = await runGroupJoin({
        coach_id: coachId,
        group_id: Number(g.id),
        athlete_ids: [ath],
        start_date: mondays[0],
        on_conflict: 'replace',
        delivery: 'auto',
        dry_run: true,
        client,
      });
      const row = res.preview.athletes.find((a) => a.id === String(ath));
      if (!row || row.action === 'blocked' || row.action === 'skip') {
        groupOptions.push({ id: g.id, name, preview: null, blocked: row?.blocked?.message ?? 'No puede entrar' });
        continue;
      }
      const start = row.start_date ?? mondays[0]!;
      groupOptions.push({
        id: g.id,
        name,
        blocked: null,
        preview: {
          kind: 'group',
          group_name: name,
          program_name: row.program?.name ?? res.preview.program?.name ?? null,
          week: row.start_week ?? null,
          weeks: null,
          start_date: start,
          visible_on: autoPublishDate(start, n),
        },
      });
    } catch (err) {
      groupOptions.push({ id: g.id, name, preview: null, blocked: err instanceof Error ? err.message : 'No puede entrar' });
    }
  }

  return {
    today,
    auto_publish_days: n,
    mondays,
    current,
    current_group: group[0] ? { id: group[0].id, name: group[0].name ?? 'Grupo sin nombre' } : null,
    groups: groupOptions,
    programs: programs.filter((x) => x.weeks > 0),
  };
}
