// @fahybrid/shared/domain/coach/adherence — LA adherencia del coach: de lo que ya
// tocaba hacer, cuánto se hizo. Una fórmula, todas las superficies (roster, Hoy,
// ficha, plan, motor de señales). DECISIONS 2026-09-23: «no pintar un número de
// adherencia que cuente sesiones futuras».
//
// EL MODELO (qué es «debida»)
// ---------------------------
// Una sesión del plan es DEBIDA si su día ya pasó, o si es HOY y ya está hecha.
// Lo que queda por delante — incluido lo de hoy que aún no ha hecho — no cuenta:
// un miércoles con lunes y martes hechos y el resto de la semana por delante es
// un 100 %, no un 40 % «cayendo» (informe C, R1).
//
// No es debida, aunque su día haya pasado:
//   - un entreno libre del atleta (`origin = 'self'`): suma, nunca diluye;
//   - un día dentro de una pausa o un descanso por lesión (`excluded`): congelado
//     (mismo criterio que web/lib/coach/adherence-pause-filter.ts, #13/#16);
//   - una sesión NO hecha de una semana OCULTA al atleta (`visible = false`,
//     semana en borrador): no puede hacer lo que no ve (DECISIONS 2026-08-18).
//     Si la hizo igualmente, cuenta como debida y hecha.
//
// HECHA = `completed` o `partial` (cortada a medias sigue siendo hecha), o con
// una ejecución registrada (el grabador crea la ejecución y cambia el estado en
// la misma transacción; la ejecución es la verdad).
//
// `pct = null` cuando no había nada debido: «sin datos», nunca un 0 inventado.
// La ventana SIEMPRE se enseña con el número («Adh. 14 d»).

import type { Sql } from 'postgres';
import { BOX_TIMEZONE, addDays, isoDateString, parseIsoDate } from '../dates';

/** Estados de `workout_assignments.status` (enum `assignment_status`). */
export type AdherenceAssignmentStatus = 'scheduled' | 'completed' | 'missed' | 'skipped' | 'partial';

export interface AdherenceSession {
  /** YYYY-MM-DD del día programado. */
  scheduled_for: string;
  status: AdherenceAssignmentStatus;
  /** Hay una ejecución registrada para la sesión. */
  executed?: boolean;
  /** `self` = entreno libre del atleta: nunca cuenta. Por defecto `coach`. */
  origin?: 'coach' | 'self';
  /** Día en pausa o descanso por lesión: nunca es debida. */
  excluded?: boolean;
  /** false = la semana está oculta al atleta (borrador). Por defecto visible. */
  visible?: boolean;
}

export interface AdherenceResult {
  /** Entero 0–100, o null si no había nada debido. */
  pct: number | null;
  due: number;
  done: number;
  window_days: number;
  /** Debidas sin hacer (= due − done). */
  missed: number;
  /** YYYY-MM-DD de la debida sin hacer más reciente, o null. */
  last_missed_on: string | null;
}

const DONE_STATUSES: ReadonlySet<AdherenceAssignmentStatus> = new Set(['completed', 'partial']);

/** ¿Está hecha? Estado terminal de hecho, o una ejecución registrada. */
export function isSessionDone(s: Pick<AdherenceSession, 'status' | 'executed'>): boolean {
  return DONE_STATUSES.has(s.status) || s.executed === true;
}

/**
 * La adherencia de una ventana que termina en `as_of` (incluido): los
 * `window_days` días `[as_of − (window_days − 1), as_of]`. `as_of` es el día del
 * ATLETA (su huso), YYYY-MM-DD.
 */
export function computeAdherence(
  sessions: ReadonlyArray<AdherenceSession>,
  as_of: string,
  window_days: number,
): AdherenceResult {
  const from = isoDateString(addDays(parseIsoDate(as_of), -(Math.max(1, window_days) - 1)));
  let due = 0;
  let done = 0;
  let last_missed_on: string | null = null;

  for (const s of sessions) {
    if (s.scheduled_for < from || s.scheduled_for > as_of) continue;
    if (s.origin === 'self' || s.excluded === true) continue;

    const isDone = isSessionDone(s);
    // Hoy solo es debida si ya está hecha; el futuro nunca.
    if (s.scheduled_for === as_of && !isDone) continue;
    // Oculta y sin hacer: no podía verla.
    if (s.visible === false && !isDone) continue;

    due += 1;
    if (isDone) {
      done += 1;
    } else if (last_missed_on == null || s.scheduled_for > last_missed_on) {
      last_missed_on = s.scheduled_for;
    }
  }

  return {
    pct: due > 0 ? Math.round((done / due) * 100) : null,
    due,
    done,
    window_days,
    missed: due - done,
    last_missed_on,
  };
}

// ── Carga por lotes (una consulta para N atletas) ────────────────────────────

/** Una sesión tal y como la devuelve la consulta del lote. */
export interface AdherenceSessionRow extends AdherenceSession {
  athlete_id: string;
}

export interface AdherenceSessionsBatch {
  /** El «hoy» de cada atleta (su huso), YYYY-MM-DD. */
  as_of: Map<string, string>;
  /** Sus sesiones del plan dentro de la ventana, en orden de día. */
  sessions: Map<string, AdherenceSession[]>;
}

/**
 * UNA consulta: el día de cada atleta en su huso y sus sesiones de los últimos
 * `window_days` días (hasta hoy incluido) con todo lo que decide si son debidas —
 * estado, ejecución, origen, pausa/descanso por lesión y visibilidad de su
 * semana. Úsala cuando necesites varias ventanas sobre los mismos datos
 * (`computeAdherence` con ventanas ≤ `window_days`).
 */
export async function loadAdherenceSessionsBatch(params: {
  client: Sql;
  /** Los atletas a cargar… */
  athlete_ids?: ReadonlyArray<number | bigint | string>;
  /** …o todos los de un coach (sin ida y vuelta previa para los ids). */
  coach_id?: number | bigint;
  window_days: number;
  now?: Date;
}): Promise<AdherenceSessionsBatch> {
  const ids = params.athlete_ids ? [...new Set(params.athlete_ids.map((x) => Number(x)))] : null;
  const coachId = params.coach_id != null ? Number(params.coach_id) : null;
  const as_of = new Map<string, string>();
  const sessions = new Map<string, AdherenceSession[]>();
  if ((ids == null || ids.length === 0) && coachId == null) return { as_of, sessions };

  const nowIso = (params.now ?? new Date()).toISOString();
  const back = Math.max(1, params.window_days) - 1;

  const rows = await params.client<
    Array<{
      athlete_id: string;
      as_of: string;
      scheduled_for: string | null;
      status: AdherenceAssignmentStatus | null;
      origin: 'coach' | 'self' | null;
      executed: boolean | null;
      excluded: boolean | null;
      visible: boolean | null;
    }>
  >`
    with ath as (
      select a.id,
             (${nowIso}::timestamptz at time zone coalesce(a.timezone, ${BOX_TIMEZONE}))::date as as_of
      from athletes a
      where (${ids}::bigint[] is null or a.id = any(${ids}::bigint[]))
        and (${coachId}::bigint is null or a.coach_id = ${coachId}::bigint)
    )
    select
      ath.id::text                               as athlete_id,
      to_char(ath.as_of, 'YYYY-MM-DD')           as as_of,
      to_char(wa.scheduled_for, 'YYYY-MM-DD')    as scheduled_for,
      wa.status::text                            as status,
      wa.origin::text                            as origin,
      exists (
        select 1 from workout_executions we where we.assignment_id = wa.id
      )                                          as executed,
      (
        wa.injury_adaptation = 'rest'
        or exists (
          select 1 from athlete_pauses ap
          where ap.athlete_id = wa.athlete_id
            and wa.scheduled_for >= ap.start_date
            and wa.scheduled_for <= coalesce(ap.end_date, ath.as_of)
        )
      )                                          as excluded,
      coalesce(wp.status::text <> 'draft', true) as visible
    from ath
    left join workout_assignments wa
      on wa.athlete_id = ath.id
     and wa.scheduled_for between ath.as_of - ${back}::int and ath.as_of
    left join weekly_plans wp
      on wp.athlete_id = wa.athlete_id
     and wp.week_start = date_trunc('week', wa.scheduled_for)::date
    order by ath.id, wa.scheduled_for
  `;

  for (const r of rows) {
    as_of.set(r.athlete_id, r.as_of);
    if (!sessions.has(r.athlete_id)) sessions.set(r.athlete_id, []);
    if (r.scheduled_for == null || r.status == null) continue;
    sessions.get(r.athlete_id)!.push({
      scheduled_for: r.scheduled_for,
      status: r.status,
      origin: r.origin ?? 'coach',
      executed: r.executed === true,
      excluded: r.excluded === true,
      visible: r.visible !== false,
    });
  }
  return { as_of, sessions };
}

/**
 * La adherencia de N atletas en UNA consulta. Devuelve una entrada por atleta
 * pedido (con `pct = null` si no tenía nada debido).
 */
export async function loadAdherenceBatch(params: {
  client: Sql;
  athlete_ids?: ReadonlyArray<number | bigint | string>;
  coach_id?: number | bigint;
  window_days: number;
  now?: Date;
}): Promise<Map<string, AdherenceResult>> {
  const batch = await loadAdherenceSessionsBatch(params);
  const out = new Map<string, AdherenceResult>();
  for (const [athleteId, asOf] of batch.as_of) {
    out.set(
      athleteId,
      computeAdherence(batch.sessions.get(athleteId) ?? [], asOf, params.window_days),
    );
  }
  return out;
}
