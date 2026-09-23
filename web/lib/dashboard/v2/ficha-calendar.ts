import 'server-only';

// El calendario de la ficha (pestaña Plan): los entrenos del coach en un rango de
// semanas, cada uno con su modalidad, su estado (hecho / debido sin hacer), los
// minutos que escribe su prescripción, y el estado Visible / Oculta de cada
// semana (la ÚNICA puerta, `weekly_plans`, vía week-publishing).
//
// Consultas: el hueco del plan (para el zoom «Plan completo»), los entrenos del
// rango, sus segmentos (una consulta para todos) y los estados de semana.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  legacyItemToPrescription,
  sessionDuration,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { sessionModalityFromExercises } from '@/lib/dashboard/v2/editor-axes';
import { decodeCoachAssignmentNotes } from '@/lib/dashboard/coach/day-sessions';
import { listAthleteWeeks } from '@/lib/coach/week-publishing';
import type { CalSession, CalZoom, FichaCalendar } from './atleta-detalle-types';
import { buildCalendarWeeks, calendarRange, mondayOfIso, sessionModality } from './ficha-calendar-model';

interface SessionRow {
  id: string;
  date: string;
  template_id: string;
  title: string | null;
  notes: string | null;
  status: CalSession['status'];
  format: string | null;
  executed: boolean;
  excluded: boolean;
  rpe: number | null;
  modalities: string[] | null;
}

interface SegmentRow {
  template_id: string;
  params_json: Record<string, unknown> | null;
  prescription_json: Prescription | null;
  notes: string | null;
}

/** El «hoy» del atleta en su huso y el primer/último entreno del coach (desde 8 semanas atrás). */
async function loadSpan(client: Sql, coach_id: number, athlete_id: number) {
  const rows = await client<Array<{ today: string; first: string | null; last: string | null }>>`
    with a as (
      select id, (now() at time zone coalesce(timezone, ${BOX_TIMEZONE}))::date as today
      from athletes where id = ${athlete_id} and coach_id = ${coach_id}
    )
    select to_char(a.today, 'YYYY-MM-DD') as today,
           to_char(min(wa.scheduled_for), 'YYYY-MM-DD') as first,
           to_char(max(wa.scheduled_for), 'YYYY-MM-DD') as last
    from a
    left join workout_assignments wa
      on wa.athlete_id = a.id and wa.origin = 'coach' and wa.scheduled_for >= a.today - 56
    group by a.today
  `;
  return rows[0] ?? null;
}

export async function loadFichaCalendar(params: {
  coach_id: number | bigint;
  athlete_id: number;
  zoom: CalZoom;
  client?: Sql;
}): Promise<FichaCalendar | null> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const span = await loadSpan(client, coachId, params.athlete_id);
  if (!span) return null;
  const today = span.today;
  const { from, to } = calendarRange(
    params.zoom,
    today,
    span.first && span.last ? { first: span.first, last: span.last } : null,
  );

  const [rows, weekStates] = await Promise.all([
    client<SessionRow[]>`
      select
        wa.id::text                                    as id,
        to_char(wa.scheduled_for, 'YYYY-MM-DD')        as date,
        wa.template_id::text                           as template_id,
        t.name                                         as title,
        wa.notes                                       as notes,
        wa.status::text                                as status,
        t.format::text                                 as format,
        ex.id is not null                              as executed,
        (
          wa.injury_adaptation = 'rest'
          or exists (
            select 1 from athlete_pauses ap
            where ap.athlete_id = wa.athlete_id and wa.scheduled_for >= ap.start_date
              and wa.scheduled_for <= coalesce(ap.end_date, wa.scheduled_for)
          )
        )                                              as excluded,
        ex.rpe                                         as rpe,
        segmods.modalities                             as modalities
      from workout_assignments wa
      join templates t on t.id = wa.template_id
      left join lateral (
        select we.id, we.perceived_exertion as rpe
        from workout_executions we where we.assignment_id = wa.id
        order by we.id desc limit 1
      ) ex on true
      left join lateral (
        select array_agg(distinct coalesce(ts.prescription_json->>'modality', e.modality::text)) as modalities
        from template_segments ts
        join exercises e on e.id = ts.exercise_id
        where ts.template_id = wa.template_id
      ) segmods on true
      where wa.athlete_id = ${params.athlete_id}
        and wa.origin = 'coach'
        and wa.scheduled_for between ${from}::date and ${to}::date
      order by wa.scheduled_for, wa.planned_sequence nulls last, wa.id
    `,
    listAthleteWeeks({ coach_id: coachId, athlete_id: params.athlete_id, from, to: mondayOfIso(to), client }),
  ]);

  const templateIds = [...new Set(rows.map((r) => Number(r.template_id)))];
  const segments =
    templateIds.length > 0
      ? await client<SegmentRow[]>`
          select ts.template_id::text as template_id, ts.params_json, ts.prescription_json, ts.notes
          from template_segments ts
          where ts.template_id = any(${templateIds}::bigint[])
          order by ts.template_id, ts.block_position, ts.position
        `
      : [];
  const segsByTemplate = new Map<string, SegmentRow[]>();
  for (const s of segments) {
    const list = segsByTemplate.get(s.template_id) ?? [];
    list.push(s);
    segsByTemplate.set(s.template_id, list);
  }

  const visibleByWeek = new Map(weekStates.map((w) => [w.week_start, w.visible]));

  const sessions: CalSession[] = rows.map((r) => {
    const segs = segsByTemplate.get(r.template_id) ?? [];
    const duration =
      segs.length > 0
        ? sessionDuration(
            segs.map((s) => ({
              prescription:
                s.prescription_json ??
                legacyItemToPrescription({ params_json: s.params_json, notes: s.notes }),
              role: 'principal' as const,
            })),
          )
        : null;
    const done = r.status === 'completed' || r.status === 'partial' || r.executed;
    const visible = visibleByWeek.get(mondayOfIso(r.date)) ?? true;
    const { modality, label } = sessionModality(sessionModalityFromExercises(r.modalities ?? []), r.format);
    return {
      id: r.id,
      date: r.date,
      title: decodeCoachAssignmentNotes(r.notes).display_title ?? r.title ?? 'Entreno',
      modality,
      modality_label: label,
      status: r.status,
      done,
      missed: !done && !r.excluded && r.date < today && visible,
      excluded: r.excluded,
      planned_min: duration ? (duration.known ? duration.minutes : duration.timed_minutes || null) : null,
      planned_open: duration ? !duration.known || duration.basis === 'floor' : false,
      has_content: segs.length > 0,
      editable: r.status === 'scheduled' && !done,
      rpe: r.rpe,
    };
  });

  return {
    zoom: params.zoom,
    from,
    to,
    today,
    weeks: buildCalendarWeeks({
      sessions,
      weekStates: new Map(weekStates.map((w) => [w.week_start, w])),
      from,
      to,
      today,
    }),
  };
}
