import 'server-only';

// Marcas (#Marcas) — the server side of the athlete's self-service benchmarks.
//
// Three reads/writes over ONE store (athlete_benchmarks + the 0139 provenance
// columns), all validated against the closed catalog in shared/domain/athlete/marks:
//
//   · loadMarksOverview      — the library screen: history + PR per mark, the race
//                              twin for the station marks, and per-context bests for
//                              running (a treadmill 5K never beats a street one).
//   · recordMarkAttempt      — "Probarme" finished: the app measured a value.
//   · registerRaceMark       — the Sunday 10K, typed or picked from a synced activity.
//   · loadRegisterCandidates — recent synced runs whose distance matches the race.
//
// A self-test NEVER recalibrates the plan. The coach hears "marca nueva" through the
// same funnel as everything else (in-app row + web push, which his PWA now receives).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { notifyCoach } from '@/lib/notifications/dispatch';
import { loadMarkBoxViews, type MarkBoxView } from '@/lib/athlete/marks-box';
import {
  MARKS,
  isPersonalBest,
  markBySlug,
  markIsDeletableByAthlete,
  registrableMarks,
  validateMarkValue,
  type MarkSpec,
  type RunContext,
} from '@fahybrid/shared/domain/athlete/marks';

// ── The library read ─────────────────────────────────────────────────────────────

export interface MarkResultView {
  /** La fila de `athlete_benchmarks`. La app la necesita para poder retirarla. */
  id: string;
  value: number;
  /** ISO instant. */
  recorded_at: string;
  source: string;
  run_context: string | null;
  event_name: string | null;
}

export interface MarkView {
  slug: string;
  label: string;
  group: 'run' | 'ergo' | 'race';
  measured_by: 'run' | 'erg' | 'registered';
  unit: string;
  lower_is_better: boolean;
  approx_label: string;
  erg: 'row' | 'ski' | null;
  target_distance_m: number | null;
  fixed_duration_s: number | null;
  /** Best comparable value ever (run marks: best across contexts, each shown below). */
  best: MarkResultView | null;
  latest: MarkResultView | null;
  /** Run marks only: the best per context, so the UI can show both side by side. */
  best_outdoor: MarkResultView | null;
  best_treadmill: MarkResultView | null;
  /** Newest→oldest, capped — enough for a sparkline and a list. */
  history: MarkResultView[];
  /** The race twin (station marks only): the same distance inside their last race. */
  race_twin: { seconds: number; race_name: string; race_date: string } | null;
  /** Where this mark sits inside the coach's roster (mockup marcas-ranking):
   *  percentile + anonymous histogram + median gap. null = no comparable pool. */
  box: MarkBoxView | null;
}

const HISTORY_CAP = 24;

export async function loadMarksOverview(
  athlete_id: bigint,
  client: Sql = defaultSql,
): Promise<{ marks: MarkView[] }> {
  const slugs = MARKS.map((m) => m.slug);
  const [rows, twins, boxViews] = await Promise.all([
    client<
      {
        id: string;
        exercise_slug: string;
        value: number;
        recorded_at: Date;
        source: string;
        run_context: string | null;
        event_name: string | null;
      }[]
    >`
      select id::text as id, exercise_slug, value::float8 as value, recorded_at, source, run_context, event_name
      from athlete_benchmarks
      where athlete_id = ${athlete_id as unknown as number}
        and exercise_slug = any(${slugs}::text[])
      order by recorded_at desc
    `,
    loadRaceTwins(athlete_id, client),
    // Best-effort: the box standing must never take the library down.
    loadMarkBoxViews({ athlete_id, client }).catch(() => new Map<string, MarkBoxView>()),
  ]);

  const bySlug = new Map<string, MarkResultView[]>();
  for (const r of rows) {
    const list = bySlug.get(r.exercise_slug) ?? [];
    if (list.length < HISTORY_CAP) {
      list.push({
        id: r.id,
        value: r.value,
        recorded_at: r.recorded_at.toISOString(),
        source: r.source,
        run_context: r.run_context,
        event_name: r.event_name,
      });
    }
    bySlug.set(r.exercise_slug, list);
  }

  const marks = MARKS.map((spec) => {
    const history = bySlug.get(spec.slug) ?? [];
    return {
      slug: spec.slug,
      label: spec.label,
      group: spec.group,
      measured_by: spec.measured_by,
      unit: spec.unit,
      lower_is_better: spec.lower_is_better,
      approx_label: spec.approx_label,
      erg: spec.erg ?? null,
      target_distance_m: spec.target_distance_m ?? null,
      fixed_duration_s: spec.fixed_duration_s ?? null,
      best: pickBest(spec, history),
      latest: history[0] ?? null,
      best_outdoor: spec.group === 'run' ? pickBest(spec, history, 'outdoor') : null,
      best_treadmill: spec.group === 'run' ? pickBest(spec, history, 'treadmill') : null,
      history,
      race_twin: spec.race_station_index != null ? (twins.get(spec.race_station_index) ?? null) : null,
      box: boxViews.get(spec.slug) ?? null,
    };
  });

  return { marks };
}

function pickBest(
  spec: MarkSpec,
  history: readonly MarkResultView[],
  context?: RunContext,
): MarkResultView | null {
  const pool =
    context === undefined ? history : history.filter((h) => (h.run_context ?? null) === context);
  if (pool.length === 0) return null;
  return pool.reduce((best, h) =>
    spec.lower_is_better ? (h.value < best.value ? h : best) : h.value > best.value ? h : best,
  );
}

/**
 * The athlete's latest race that carries station splits → seconds per canonical
 * station slot. Powers "en el box 3:54 · en carrera 4:10". Absent splits (no import
 * yet, race without them) degrade to an empty map — the UI simply hides the twin.
 */
async function loadRaceTwins(
  athlete_id: bigint,
  client: Sql,
): Promise<Map<number, { seconds: number; race_name: string; race_date: string }>> {
  const rows = await client<
    { name: string; race_date: string; splits: { index: number; seconds: number }[] | null }[]
  >`
    select name, race_date::text as race_date, station_splits_json as splits
    from races
    where athlete_id = ${athlete_id as unknown as number}
      and station_splits_json is not null
    order by race_date desc
    limit 1
  `;
  const race = rows[0];
  const out = new Map<number, { seconds: number; race_name: string; race_date: string }>();
  if (!race?.splits) return out;
  for (const split of race.splits) {
    if (typeof split?.index === 'number' && typeof split?.seconds === 'number' && split.seconds > 0) {
      out.set(split.index, { seconds: split.seconds, race_name: race.name, race_date: race.race_date });
    }
  }
  return out;
}

// ── The two writes ───────────────────────────────────────────────────────────────

export type MarkWriteError =
  | 'unknown_mark'
  | 'not_self_testable'
  | 'not_registrable'
  | 'invalid_value'
  | 'invalid_date';

export interface MarkWriteResult {
  is_pr: boolean;
  /** The previous comparable best, so the result screen can say "5 s menos". */
  previous_best: number | null;
}

/**
 * "Probarme" finished — the APP measured `value` (GPS, belt or PM5; never typed).
 * Records with source='athlete_test' and tells the coach. Does NOT recalibrate.
 */
export async function recordMarkAttempt(params: {
  athlete_id: bigint;
  slug: string;
  value: number;
  run_context?: RunContext | null;
  client?: Sql;
}): Promise<{ ok: true; data: MarkWriteResult } | { ok: false; error: MarkWriteError }> {
  const client = params.client ?? defaultSql;
  const checked = validateMarkValue(params.slug, params.value);
  if (!checked.ok) {
    return { ok: false, error: checked.error === 'unknown_mark' ? 'unknown_mark' : 'invalid_value' };
  }
  const spec = checked.spec;
  if (spec.measured_by === 'registered') return { ok: false, error: 'not_self_testable' };

  const context: RunContext | null = spec.group === 'run' ? (params.run_context ?? 'outdoor') : null;
  const prior = await loadComparableHistory(client, params.athlete_id, spec, context);
  const is_pr = isPersonalBest(spec, params.value, prior, context);
  const previous_best = prior.length
    ? prior.reduce((b, h) => (spec.lower_is_better ? Math.min(b, h.value) : Math.max(b, h.value)), prior[0]!.value)
    : null;

  await client`
    insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, notes, source, run_context)
    values (
      ${params.athlete_id as unknown as number}, ${spec.slug}, ${params.value}, ${spec.unit},
      'athlete_test', 'athlete_test', ${context}
    )
  `;

  // Best-effort: in-app row + web push through the funnel his PWA already receives.
  await notifyCoach({
    sql: client,
    athlete_id: params.athlete_id,
    type: 'milestone',
    payload: {
      kind: 'athlete_mark',
      slug: spec.slug,
      value: params.value,
      is_pr,
      run_context: context,
    },
    push: {
      title: is_pr ? 'Marca nueva · PR' : 'Marca nueva',
      body: `${spec.label} · ${formatMarkValue(spec, params.value)}`,
    },
  }).catch(() => undefined);

  return { ok: true, data: { is_pr, previous_best } };
}

/**
 * Register a race distance done outside the app (the Sunday 10K). `date` is the day
 * it happened — recorded_at carries it so the history stays chronological.
 */
export async function registerRaceMark(params: {
  athlete_id: bigint;
  slug: string;
  value: number;
  /** ISO YYYY-MM-DD of the race day. Never in the future. */
  date: string;
  event_name?: string | null;
  client?: Sql;
}): Promise<{ ok: true; data: MarkWriteResult } | { ok: false; error: MarkWriteError }> {
  const client = params.client ?? defaultSql;
  const checked = validateMarkValue(params.slug, params.value);
  if (!checked.ok) {
    return { ok: false, error: checked.error === 'unknown_mark' ? 'unknown_mark' : 'invalid_value' };
  }
  const spec = checked.spec;
  if (spec.measured_by !== 'registered') return { ok: false, error: 'not_registrable' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date) || params.date > new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: 'invalid_date' };
  }

  const prior = await loadComparableHistory(client, params.athlete_id, spec, null);
  const is_pr = isPersonalBest(spec, params.value, prior, null);
  const previous_best = prior.length
    ? prior.reduce((b, h) => (spec.lower_is_better ? Math.min(b, h.value) : Math.max(b, h.value)), prior[0]!.value)
    : null;

  const name = params.event_name?.trim() || null;
  await client`
    insert into athlete_benchmarks (
      athlete_id, exercise_slug, value, unit, notes, source, event_name, recorded_at
    ) values (
      ${params.athlete_id as unknown as number}, ${spec.slug}, ${params.value}, ${spec.unit},
      'registered', 'registered', ${name}, ${params.date}::date
    )
  `;

  await notifyCoach({
    sql: client,
    athlete_id: params.athlete_id,
    type: 'milestone',
    payload: { kind: 'athlete_mark', slug: spec.slug, value: params.value, is_pr, registered: true },
    push: {
      title: 'Carrera registrada',
      body: `${spec.label} · ${formatMarkValue(spec, params.value)}${name ? ` · ${name}` : ''}`,
    },
  }).catch(() => undefined);

  return { ok: true, data: { is_pr, previous_best } };
}

async function loadComparableHistory(
  client: Sql,
  athlete_id: bigint,
  spec: MarkSpec,
  context: RunContext | null,
): Promise<{ value: number; run_context: string | null }[]> {
  const rows = await client<{ value: number; run_context: string | null }[]>`
    select value::float8 as value, run_context
    from athlete_benchmarks
    where athlete_id = ${athlete_id as unknown as number} and exercise_slug = ${spec.slug}
  `;
  // Run marks compare within their context; everything else compares globally.
  return spec.group === 'run' ? rows.filter((r) => (r.run_context ?? null) === context) : rows;
}

function formatMarkValue(spec: MarkSpec, value: number): string {
  if (spec.unit === 'meters') return `${Math.round(value)} m`;
  const total = Math.max(0, Math.round(value));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ── Register candidates (the watch already ran it) ───────────────────────────────

export interface RegisterCandidate {
  execution_id: string;
  /** ISO instant the run started. */
  started_at: string;
  distance_m: number;
  duration_s: number;
  source: string | null;
}

/** Distance tolerance: race certificates vary and GPS drifts — ±4% is honest. */
const DISTANCE_TOLERANCE = 0.04;
const CANDIDATE_WINDOW_DAYS = 21;

/**
 * Recent synced executions whose total distance matches the race distance — the
 * "usar esta actividad" card. Empty when nothing matches; manual entry covers it.
 */
export async function loadRegisterCandidates(
  athlete_id: bigint,
  slug: string,
  client: Sql = defaultSql,
): Promise<RegisterCandidate[]> {
  const spec = markBySlug(slug);
  if (!spec || spec.measured_by !== 'registered' || !spec.target_distance_m) return [];
  const min = Math.round(spec.target_distance_m * (1 - DISTANCE_TOLERANCE));
  const max = Math.round(spec.target_distance_m * (1 + DISTANCE_TOLERANCE));

  const rows = await client<
    { execution_id: string; started_at: Date; distance_m: number; duration_s: number | null; source: string | null }[]
  >`
    select
      we.id::text                          as execution_id,
      we.started_at                        as started_at,
      sum(es.distance_meters)::float8      as distance_m,
      we.total_duration_seconds            as duration_s,
      we.source::text                      as source
    from workout_executions we
    join execution_segments es on es.execution_id = we.id
    where we.athlete_id = ${athlete_id as unknown as number}
      and we.started_at >= now() - make_interval(days => ${CANDIDATE_WINDOW_DAYS})
    group by we.id, we.started_at, we.total_duration_seconds, we.source
    having sum(es.distance_meters) between ${min} and ${max}
    order by we.started_at desc
    limit 5
  `;

  return rows
    .filter((r) => r.started_at != null && r.duration_s != null && r.duration_s > 0)
    .map((r) => ({
      execution_id: r.execution_id,
      started_at: r.started_at.toISOString(),
      distance_m: Math.round(r.distance_m),
      duration_s: r.duration_s!,
      source: r.source,
    }));
}

// ── Retirar una marca ────────────────────────────────────────────────────────

/** Por qué no se pudo borrar. `not_found` cubre también la marca de otro atleta:
 *  el endpoint nunca revela si el id existe. */
export type MarkDeleteError = 'not_found' | 'not_yours_to_delete';

/**
 * El atleta retira una marca de su biblioteca.
 *
 * Existe por lo declarado en el onboarding: ese número es SUYO y tiene que poder
 * quitarlo. Pero la regla es más amplia que el onboarding — todo lo que produjo
 * él (se probó, registró una carrera, lo declaró al entrar) lo puede retirar; el
 * test del coach no, que es el registro con el que el coach programa.
 *
 * La propiedad se comprueba en el WHERE (athlete_id de la sesión), así que una id
 * ajena no borra nada y sale por `not_found` sin filtrar su existencia. El borrado
 * es de UNA fila del historial: retirar el 10K declarado no toca el 10K que
 * corrió en marzo, y el mejor se recalcula solo en la siguiente lectura.
 */
export async function deleteAthleteMark(
  params: { athlete_id: bigint | number; id: bigint },
  client: Sql = defaultSql,
): Promise<{ ok: true } | { ok: false; error: MarkDeleteError }> {
  const rows = await client<{ source: string }[]>`
    select source
    from athlete_benchmarks
    where id = ${params.id as unknown as number}
      and athlete_id = ${Number(params.athlete_id)}
    limit 1
  `;
  const row = rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  if (!markIsDeletableByAthlete(row.source)) {
    return { ok: false, error: 'not_yours_to_delete' };
  }

  await client`
    delete from athlete_benchmarks
    where id = ${params.id as unknown as number}
      and athlete_id = ${Number(params.athlete_id)}
  `;
  return { ok: true };
}

/** Re-export for the routes so they never import the shared module twice. */
export { registrableMarks };
