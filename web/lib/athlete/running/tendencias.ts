import 'server-only';

// TENDENCIAS — GET /api/athlete/running/tendencias (mapa v2, el "Reports" de
// Garmin de la pastilla Carrera). Buckets semanales en 4w/6m, mensuales en
// 1y/all — zero-filled (una semana sin carrera es un cero de verdad, mismo
// criterio que `running-volume.ts`), más `prev`: el mismo agregado sobre la
// ventana anterior del MISMO largo, para que el cliente pinte deltas sin un
// segundo viaje.
//
// UNA MÉTRICA SIN FUENTE ES `null` EN TODOS LOS BUCKETS, no en algunos: el
// VO₂máx viene de `buildAthleteVo2Max`, que mira 90 días fijos hacia atrás
// (shared/domain/athlete/vo2max.ts) — no está parametrizado por ventana, así
// que un bucket más allá de esos 90 días sale `null` honesto. Ensancharlo es
// tocar un motor que sirve a Perfil y a "¿Estoy mejorando?"; no es parte de
// esta tanda (cero migraciones, cero engines nuevos).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { loadRunSessionRows, type RunSessionRow } from './sessions';
import { buildAthleteVo2Max } from '@/lib/athlete/vo2max';

export const TENDENCIAS_WINDOWS = ['4w', '6m', '1y', 'all'] as const;
export type TendenciasWindow = (typeof TENDENCIAS_WINDOWS)[number];

const WINDOW_DAYS: Record<Exclude<TendenciasWindow, 'all'>, number> = { '4w': 28, '6m': 182, '1y': 365 };
const GRANULARITY: Record<TendenciasWindow, 'week' | 'month'> = { '4w': 'week', '6m': 'week', '1y': 'month', all: 'month' };
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Un bucket vive DENTRO de la ventana pedida: sus fechas son reales, así que
 *  una semana sin carrera es un cero de verdad — `km`/`seconds` NUNCA null,
 *  mismo criterio que `running-volume.ts`. Las métricas ponderadas (ritmo, FC,
 *  desnivel, cadencia) sí son null cuando ninguna sesión del bucket las trae. */
interface BucketAggregate {
  km: number;
  seconds: number;
  ritmo_medio_s_km: number | null;
  fc_media: number | null;
  desnivel_m: number | null;
  cadencia_spm: number | null;
}

/** `prev` es distinto: SU EXISTENCIA MISMA se pone en duda cuando no hay
 *  ninguna sesión en la ventana anterior — mostrar «+400 %» contra un cero que
 *  en realidad es «no sabemos» sería una comparación fabricada. Por eso
 *  `km`/`seconds` SÍ son null aquí cuando no hay ninguna sesión previa. */
interface PrevAggregate {
  km: number | null;
  seconds: number | null;
  ritmo_medio_s_km: number | null;
  fc_media: number | null;
  desnivel_m: number | null;
  vo2max: number | null;
  cadencia_spm: number | null;
}

export interface TendenciasBucket extends BucketAggregate {
  start: string;
  vo2max: number | null;
}

export interface TendenciasPayload {
  buckets: TendenciasBucket[];
  prev: PrevAggregate;
}

const EMPTY_PREV: PrevAggregate = {
  km: null,
  seconds: null,
  ritmo_medio_s_km: null,
  fc_media: null,
  desnivel_m: null,
  vo2max: null,
  cadencia_spm: null,
};

/** Suma/pondera un grupo de sesiones ya colapsadas a grano de ejecución.
 *  Ponderado por `work_km` (nunca por `km` total): un trote de vuelta no
 *  puede arrastrar el ritmo/FC/cadencia del bucket hacia abajo. */
function aggregateSessions(rows: readonly RunSessionRow[]): BucketAggregate {
  if (rows.length === 0) {
    return { km: 0, seconds: 0, ritmo_medio_s_km: null, fc_media: null, desnivel_m: null, cadencia_spm: null };
  }
  let km = 0;
  let seconds = 0;
  let elevation = 0;
  let hasElevation = false;
  let paceWeighted = 0;
  let hrWeighted = 0;
  let cadenceWeighted = 0;
  let workKmForPace = 0;
  let workKmForHr = 0;
  let workKmForCadence = 0;

  for (const r of rows) {
    km += r.km;
    seconds += r.seconds;
    if (r.elevation_gain_m != null) {
      elevation += r.elevation_gain_m;
      hasElevation = true;
    }
    if (r.pace_s_per_km != null && r.work_km > 0) {
      paceWeighted += r.pace_s_per_km * r.work_km;
      workKmForPace += r.work_km;
    }
    if (r.hr_avg != null && r.work_km > 0) {
      hrWeighted += r.hr_avg * r.work_km;
      workKmForHr += r.work_km;
    }
    if (r.cadence_spm != null && r.work_km > 0) {
      cadenceWeighted += r.cadence_spm * r.work_km;
      workKmForCadence += r.work_km;
    }
  }

  return {
    km: Math.round(km * 100) / 100,
    seconds: Math.round(seconds),
    ritmo_medio_s_km: workKmForPace > 0 ? paceWeighted / workKmForPace : null,
    fc_media: workKmForHr > 0 ? Math.round(hrWeighted / workKmForHr) : null,
    // hasElevation distingue "nunca se midió" (null) de "se midió y fue llano"
    // (0) — sumar sin mirar convertiría el primero en una mentira con forma de cero.
    desnivel_m: hasElevation ? Math.round(elevation) : null,
    cadencia_spm: workKmForCadence > 0 ? Math.round(cadenceWeighted / workKmForCadence) : null,
  };
}

/** Los arranques de bucket (lunes o día 1), zero-fill garantizado por
 *  `generate_series` — el mismo mecanismo que ya usa `running-volume.ts`. */
async function loadBucketStarts(
  client: Sql,
  athlete_id: number,
  granularity: 'week' | 'month',
  since: Date,
  until: Date,
): Promise<string[]> {
  const interval = granularity === 'week' ? '7 days' : '1 month';
  const rows = await client<Array<{ start: string }>>`
    with athlete_tz as (
      select coalesce((select a.timezone from athletes a where a.id = ${athlete_id}), ${BOX_TIMEZONE}) as tz
    ),
    bounds as (
      select
        date_trunc(${granularity}, ${since.toISOString()}::timestamptz at time zone (select tz from athlete_tz)) as first_b,
        date_trunc(${granularity}, ${until.toISOString()}::timestamptz at time zone (select tz from athlete_tz)) as last_b
    )
    select to_char(
      generate_series((select first_b from bounds), (select last_b from bounds), ${interval}::interval),
      'YYYY-MM-DD'
    ) as start
  `;
  return rows.map((r) => r.start);
}

/** La primera sesión de carrera del atleta — el suelo de la ventana `all`. */
async function loadFirstRunDay(client: Sql, athlete_id: number): Promise<Date | null> {
  const rows = await client<Array<{ first_at: Date | null }>>`
    select min(coalesce(we.ended_at, we.started_at)) as first_at
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${athlete_id} and se.modality = 'run'
  `;
  return rows[0]?.first_at ?? null;
}

/** El VO₂máx medio de cada bucket, de la MISMA serie que "¿Estoy mejorando?"
 *  — nunca un segundo cálculo. Un bucket sin lecturas en su rango sale null. */
function vo2ByBucket(
  series: readonly { iso_date: string; value: number }[],
  starts: readonly string[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i]!;
    const to = starts[i + 1] ?? '9999-12-31';
    const points = series.filter((p) => p.iso_date >= from && p.iso_date < to);
    if (points.length > 0) {
      out.set(from, Math.round((points.reduce((a, p) => a + p.value, 0) / points.length) * 10) / 10);
    }
  }
  return out;
}

export async function buildRunningTendencias(args: {
  athlete_id: number;
  window: TendenciasWindow;
  now?: Date;
  client?: Sql;
}): Promise<TendenciasPayload> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const granularity = GRANULARITY[args.window];

  const since =
    args.window === 'all'
      ? await loadFirstRunDay(client, args.athlete_id)
      : new Date(now.getTime() - WINDOW_DAYS[args.window] * MS_PER_DAY);

  if (since == null) {
    // Nunca ha corrido: cero buckets, cero comparación posible.
    return { buckets: [], prev: EMPTY_PREV };
  }

  const [starts, sessions, vo2] = await Promise.all([
    loadBucketStarts(client, args.athlete_id, granularity, since, now),
    loadRunSessionRows(client, args.athlete_id, since, now),
    buildAthleteVo2Max({ athlete_id: args.athlete_id, client }),
  ]);

  const bucketKeyOf = (s: RunSessionRow) => (granularity === 'week' ? s.week_monday : s.month_start);
  const byBucket = new Map<string, RunSessionRow[]>();
  for (const s of sessions) {
    const key = bucketKeyOf(s);
    const list = byBucket.get(key);
    if (list) list.push(s);
    else byBucket.set(key, [s]);
  }
  const vo2Map = vo2ByBucket(vo2.series, starts);

  const buckets: TendenciasBucket[] = starts.map((start) => ({
    start,
    ...aggregateSessions(byBucket.get(start) ?? []),
    vo2max: vo2Map.get(start) ?? null,
  }));

  // `prev`: la ventana anterior del MISMO largo. `all` no tiene "antes de
  // siempre" — se declara vacía en vez de comparar contra un hueco. Una
  // ventana anterior REAL pero sin ni una sesión se declara igual de vacía:
  // un "+400 %" contra un cero que en realidad es "no corría todavía" sería
  // una comparación fabricada, no una mejora.
  let prev: PrevAggregate = EMPTY_PREV;
  if (args.window !== 'all') {
    const days = WINDOW_DAYS[args.window];
    const prevUntil = new Date(since.getTime() - 1);
    const prevSince = new Date(since.getTime() - days * MS_PER_DAY);
    const prevSessions = await loadRunSessionRows(client, args.athlete_id, prevSince, prevUntil);
    if (prevSessions.length > 0) {
      const prevVo2 = await buildAthleteVo2Max({ athlete_id: args.athlete_id, on_date: since, client });
      const prevVo2Points = prevVo2.series.filter(
        (p) => p.iso_date >= prevSince.toISOString().slice(0, 10) && p.iso_date < since.toISOString().slice(0, 10),
      );
      prev = {
        ...aggregateSessions(prevSessions),
        vo2max:
          prevVo2Points.length > 0
            ? Math.round((prevVo2Points.reduce((a, p) => a + p.value, 0) / prevVo2Points.length) * 10) / 10
            : null,
      };
    }
  }

  return { buckets, prev };
}
