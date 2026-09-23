import 'server-only';

// loadRoster — la tabla de Atletas (plan §4.4). SET-BASED: un número constante de
// consultas (7) sea cual sea el roster, en paralelo. Sustituye al camino viejo
// (`fetchAthletesForCoach`), que con 100 atletas costaba ≈640 consultas por
// página por el bucle de estado de programación y la resolución de secuencia por
// atleta (informe B §2.5).
//
//   1. hechos de plan y ciclo de vida       (plan-facts.ts)
//   2. extras de la fila: último entreno, próximo, carrera, grupo, «hecho» del hilo
//   3. historia de readiness                (readiness-history.ts)
//   4. sesiones del plan para la adherencia (shared/domain/coach/adherence.ts)
//   5. señales vivas + silenciadas          (signals-read.ts)
//   6. hilos por responder, con hecho/pospuesto (awaiting-reply.ts, la regla de Mensajes)
//   7. bandas de readiness del coach        (signal-thresholds.ts)
//
// Todo en el vocabulario del panel: estado con su motivo (un solo modelo, §4.1),
// adherencia SOLO de lo debido y con su ventana, readiness 0–100 con su base.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  compareSignals,
  type AthleteStatus,
  type AthleteStatusKey,
} from '@fahybrid/shared/domain/coach/athlete-state';
import {
  computeAdherence,
  loadAdherenceSessionsBatch,
} from '@fahybrid/shared/domain/coach/adherence';
import { readinessBandOf, type ReadinessBand } from '@fahybrid/shared/domain/coach/signal-thresholds';
import { groupRuleName } from '@fahybrid/shared/domain/coach/level-axis';
import type { AthleteWeekChipKind } from '@fahybrid/shared/domain/coach/athlete-week-chip';
import { buildAthleteStatus } from '@/lib/coach/athlete-state';
import { loadAthleteSignals } from '@/lib/coach/attention/signals-read';
import { loadReplyStates } from '@/lib/coach/attention/awaiting-reply';
import { loadReadinessHistory } from '@/lib/coach/attention/readiness-history';
import {
  latestReading,
  readinessBaseline,
  readinessTrend,
} from '@/lib/coach/attention/readiness-baseline';
import { resolveCoachThresholds } from '@/lib/coach/signal-thresholds';
import { coachCalendar, loadPlanFacts, type AthletePlanFacts } from './plan-facts';

/** Ventana de la adherencia del roster («Adh. 14 d»). */
export const ROSTER_ADHERENCE_WINDOW_DAYS = 14;

export interface RosterRow {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  email: string | null;
  level: { id: string; label: string } | null;
  group: { id: string; name: string } | null;
  lifecycle: 'activo' | 'pausado' | 'baja' | 'nuevo';
  status: AthleteStatus;
  /** Semana en curso. Una semana vacía con programa (hueco) cuenta como `sin_plan`. */
  week_visibility: 'visible' | 'oculta' | 'sin_plan' | 'terminado';
  readiness: {
    value: number;
    baseline: number | null;
    trend_14d: (number | null)[];
    observed_at: string;
    /** extra — banda con las bandas del COACH (bien · cautela · bajo). */
    band: ReadinessBand;
  } | null;
  adherence_14d: { pct: number | null; due: number; done: number } | null;
  last_session_at: string | null;
  next_session: { date: string; title: string } | null;
  race: { name: string; date: string; days: number } | null;
  program: { id: string; name: string; week: number; weeks: number } | null;
  unread: number;
  /** Por responder: la regla de Mensajes (último mensaje del atleta, ni hecho ni pospuesto). */
  awaiting_reply: boolean;
}

interface ExtrasRow {
  athlete_id: string;
  last_session_at: Date | null;
  next_date: string | null;
  next_title: string | null;
  race_name: string | null;
  race_date: string | null;
  race_days: number | null;
  group_id: string | null;
  group_name: string | null;
  group_level: string | null;
  group_days: number | null;
  axis_label: string | null;
}

async function loadRosterExtras(
  client: Sql,
  coach_id: number,
  today: string,
): Promise<Map<string, ExtrasRow>> {
  const rows = await client<ExtrasRow[]>`
    select
      a.id::text                    as athlete_id,
      la.at                         as last_session_at,
      ns.date                       as next_date,
      ns.title                      as next_title,
      tr.name                       as race_name,
      tr.date                       as race_date,
      tr.days                       as race_days,
      grp.id                        as group_id,
      grp.name                      as group_name,
      grp.level_name                as group_level,
      grp.days_per_week             as group_days,
      co.level_axis_label           as axis_label
    from athletes a
    left join coaches co on co.id = a.coach_id
    left join lateral (
      select max(coalesce(we.ended_at, we.started_at, we.created_at)) as at
      from workout_executions we
      where we.athlete_id = a.id
    ) la on true
    left join lateral (
      select to_char(w.scheduled_for, 'YYYY-MM-DD') as date, t.name as title
      from workout_assignments w
      join templates t on t.id = w.template_id
      where w.athlete_id = a.id
        and w.origin = 'coach'
        and w.status = 'scheduled'
        and w.scheduled_for >= ${today}::date
      order by w.scheduled_for, w.planned_sequence nulls last, w.id
      limit 1
    ) ns on true
    left join lateral (
      -- La carrera objetivo más próxima (misma regla que getTargetRace).
      select r.name, to_char(r.race_date, 'YYYY-MM-DD') as date,
             (r.race_date - ${today}::date)::int as days
      from races r
      where r.athlete_id = a.id
        and r.priority = 'target'
        and r.status in ('planned', 'registered')
        and r.race_date >= ${today}::date
      order by r.race_date, r.id
      limit 1
    ) tr on true
    left join lateral (
      -- El grupo = su cadena activa (program_sequences). El nombre, si el coach
      -- le puso uno (mig 0215); to_jsonb tolera un entorno sin la columna.
      select ps.id::text as id,
             to_jsonb(ps) ->> 'name' as name,
             al.name as level_name,
             ps.days_per_week
      from athlete_sequence_progress sp
      join program_sequences ps on ps.id = sp.sequence_id
      left join athlete_levels al on al.id = ps.level_id
      where sp.athlete_id = a.id and sp.status = 'active'
      order by sp.started_at desc
      limit 1
    ) grp on true
    where a.coach_id = ${coach_id}
  `;
  return new Map(rows.map((r) => [r.athlete_id, r]));
}

/** «Nivel N3 · 5 días» (con el eje del coach) cuando el grupo no tiene nombre propio. */
function groupName(e: ExtrasRow): string {
  if (e.group_name && e.group_name.trim()) return e.group_name.trim();
  return (
    groupRuleName({ axis_label: e.axis_label, level_name: e.group_level, days_per_week: e.group_days }) ?? 'Grupo'
  );
}

const WEEK_VISIBILITY: Record<AthleteWeekChipKind, RosterRow['week_visibility']> = {
  visible: 'visible',
  no_lo_ve: 'oculta',
  semana_vacia: 'sin_plan',
  bloque_terminado: 'terminado',
  sin_plan: 'sin_plan',
};

function lifecycleOf(f: AthletePlanFacts): RosterRow['lifecycle'] {
  if (f.lifecycle !== 'activo') return f.lifecycle;
  return f.intake_pending || f.not_onboarded ? 'nuevo' : 'activo';
}

/** Orden por defecto «necesita algo»: peor estado primero. */
const STATUS_ORDER: Record<AthleteStatusKey, number> = {
  accion: 0,
  vigilar: 1,
  sin_plan: 2,
  nuevo: 3,
  al_dia: 4,
  pausado: 5,
};

export function compareRosterRows(a: RosterRow, b: RosterRow): number {
  const byKey = STATUS_ORDER[a.status.key] - STATUS_ORDER[b.status.key];
  if (byKey !== 0) return byKey;
  const sa = a.status.signals[0];
  const sb = b.status.signals[0];
  if (sa && sb) {
    const bySignal = compareSignals(sa, sb);
    if (bySignal !== 0) return bySignal;
  }
  return a.name.localeCompare(b.name, 'es');
}

export async function loadRoster(params: {
  coach_id: bigint | number;
  now?: Date;
  client?: Sql;
}): Promise<RosterRow[]> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const coach_id = Number(params.coach_id);
  const cal = coachCalendar(now);

  // El alcance de las cargas por atleta es «los atletas del coach»: se resuelve
  // dentro de cada consulta (coach_id), así que todas salen a la vez.
  const [facts, extras, readiness, signals, awaiting, bands, sessions] = await Promise.all([
    loadPlanFacts({ coach_id, now, client }),
    loadRosterExtras(client, coach_id, cal.today),
    loadReadinessHistory({ coach_id, now, client }),
    loadAthleteSignals({ coach_id, now, client }),
    loadReplyStates({ coach_id, now, client }),
    resolveCoachThresholds(coach_id, client),
    loadAdherenceSessionsBatch({
      client,
      coach_id,
      window_days: ROSTER_ADHERENCE_WINDOW_DAYS,
      now,
    }),
  ]);

  const rows = facts.map((f): RosterRow => {
    const e = extras.get(f.athlete_id);
    const h = readiness.get(f.athlete_id);
    const latest = h ? latestReading(h.series) : null;
    const plan = sessions.sessions.get(f.athlete_id) ?? [];
    const adh =
      plan.length > 0
        ? computeAdherence(
            plan,
            sessions.as_of.get(f.athlete_id) ?? cal.today,
            ROSTER_ADHERENCE_WINDOW_DAYS,
          )
        : null;
    const aw = awaiting.get(f.athlete_id);

    return {
      athlete_id: f.athlete_id,
      name: f.name,
      avatar_url: f.avatar_url,
      email: f.email,
      level: f.level ? { id: f.level.id, label: f.level.label } : null,
      group: e?.group_id ? { id: e.group_id, name: groupName(e) } : null,
      lifecycle: lifecycleOf(f),
      status: buildAthleteStatus(f, signals.get(f.athlete_id), now, aw?.open ?? false),
      week_visibility: WEEK_VISIBILITY[f.week_chip.kind],
      readiness:
        latest && h
          ? {
              value: latest.score,
              baseline: readinessBaseline(h.series, latest.on).baseline,
              trend_14d: readinessTrend(h.series, h.today),
              observed_at: latest.on,
              band: readinessBandOf(latest.score, bands),
            }
          : null,
      adherence_14d: adh ? { pct: adh.pct, due: adh.due, done: adh.done } : null,
      last_session_at: e?.last_session_at ? e.last_session_at.toISOString() : null,
      next_session: e?.next_date && e.next_title ? { date: e.next_date, title: e.next_title } : null,
      race:
        e?.race_name && e.race_date && e.race_days != null
          ? { name: e.race_name, date: e.race_date, days: e.race_days }
          : null,
      program: f.current_program
        ? {
            id: f.current_program.id,
            name: f.current_program.name,
            week: f.current_program.week,
            weeks: f.current_program.weeks,
          }
        : null,
      unread: aw?.unread ?? 0,
      awaiting_reply: aw?.open ?? false,
    };
  });

  return rows.sort(compareRosterRows);
}
