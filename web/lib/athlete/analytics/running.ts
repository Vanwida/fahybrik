// ANALYTICS · Section 1 — CARRERA (the biggest, fully REAL for athlete 70: 66
// run segments). Builds the running section for a given PERIOD:
//   • umbral / VDOT          — trained threshold (zone profile) + Daniels VDOT
//   • progresión 5k          — run_5k benchmark history (oldest→newest)
//   • volumen                — period km + sessions + weekly bars  (drill)
//   • mejores esfuerzos      — 1k / 3k / 5k PRs                    (drill each)
//   • por tipo               — avg executed pace per coach scheme  (drill each)
//   • por zona               — km distribution across pace zones   (drill each)
//   • tendencia de ritmo     — weekly volume-weighted pace
//   • comprometida vs pura   — run inside a multi-station block vs solo run
//
// Every aggregate carries a DrillRef whose `count` is the REAL number of source
// rows; the drill-down endpoint re-runs the same window and returns that list.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { SEG_IS_WORK_EFFORT, isWorkEffort } from '@/lib/execution/segment-work';
import { selectRunMark } from '@fahybrid/shared/domain/athlete/mark-projection';
import { RUN_MARK_SLUGS } from '@fahybrid/shared/domain/athlete/marks';
import { normalizeFormat } from '@fahybrid/shared/domain/prescription/format';
import {
  type AnalyticsCard,
  type AnalyticsSection,
  type CardSeriesPoint,
  type CardZone,
  type DrillRef,
  type ResolvedPeriod,
  card,
  isoWeekStart,
  kmStr,
  num,
  numOrNull,
  paceStr,
  deltaStr,
  seriesAxis,
} from './core';

// ── Constants ────────────────────────────────────────────────────────────────
const ONE_KM_MIN_METERS = 800;
const ONE_KM_MAX_METERS = 1200;
const THREE_KM_MIN_METERS = 2700;
const THREE_KM_MAX_METERS = 3300;
const PACE_TREND_WEEKS = 8;
const MIN_BAR = 0.15;

// Running-relevant scheme → ES "type" label (type = the coach's scheme, per the
// design footnote). Falls back to the canonical format key when unmapped, so an
// unforeseen scheme still groups honestly instead of vanishing.
const SCHEME_LABEL_ES: Record<string, string> = {
  intervals: 'Series · intervalos',
  steady: 'Continuo · tempo',
  for_time: 'Por tiempo',
  amrap: 'AMRAP',
  emom: 'EMOM',
  rounds: 'Rondas',
  hyrox_sim: 'Simulación HYROX',
  sets: 'Fuerza',
  superset: 'Fuerza',
};

// ── DB row shapes ────────────────────────────────────────────────────────────
interface RunSegRow {
  execution_id: string;
  day: string; // YYYY-MM-DD
  distance_meters: string | null;
  pace_s_per_km: string | null;
  avg_hr: number | null;
  cadence_spm: number | null; // integer steps/min (mig 0124); null when uncaptured
  scheme: string | null;
  is_compromised: boolean;
  // Los dos ejes de «esto cuenta como intento» (migs 0088 y 0146). Viajan crudos
  // hasta JS porque esta consulta alimenta a la vez el VOLUMEN (que los quiere
  // todos) y las medias de ritmo (que no) — ver el reparto en el builder.
  leg_role: string | null;
  is_structural: boolean;
}
export interface ZoneBand {
  code: string;
  label: string;
  color: string;
  fast_s: number | null;
  slow_s: number | null;
  sort_order: number;
}

// ── Zone classification ──────────────────────────────────────────────────────
// Bands carry absolute pace edges (fast_s smaller = faster). Walk slowest→fastest
// and pick the first band whose fast edge ≤ pace; faster than the fastest band's
// edge → that fastest band (open end). Gapless, so every pace lands in a zone.
export function classifyZone(paceS: number, bands: ZoneBand[]): ZoneBand | null {
  if (bands.length === 0) return null;
  const slowToFast = [...bands].sort((a, b) => (b.fast_s ?? 0) - (a.fast_s ?? 0));
  for (const z of slowToFast) {
    if (z.fast_s != null && paceS >= z.fast_s) return z;
  }
  return slowToFast[slowToFast.length - 1] ?? null;
}

function drill(kind: string, params: Record<string, string>, count: number, label: string): DrillRef {
  return { kind, params, count, label_es: label };
}

// ── Builder ──────────────────────────────────────────────────────────────────
export async function buildRunningSection(
  args: { athlete_id: number | bigint; period: ResolvedPeriod },
  client: Sql = defaultSql,
): Promise<AnalyticsSection> {
  const athleteId = Number(args.athlete_id);
  const { period } = args;
  const cards: AnalyticsCard[] = [];

  // ── Zone profile (run) — threshold + the resolved bands ────────────────────
  const zoneRows = await client<Array<{ threshold_s: string; zones_json: ZoneBand[] }>>`
    select threshold_s::text as threshold_s, zones_json
    from athlete_zone_profiles
    where athlete_id = ${athleteId} and modality = 'run'
    order by version desc
    limit 1
  `;
  const threshold_s = zoneRows[0] ? num(zoneRows[0].threshold_s) : null;
  const bands: ZoneBand[] = Array.isArray(zoneRows[0]?.zones_json) ? zoneRows[0]!.zones_json : [];

  // ── run_5k benchmarks (asc) — VDOT input + 5k trend + best 5k ──────────────
  const benchRows = await client<Array<{ value: string; recorded_on: string; id: string }>>`
    select value::text as value, to_char(recorded_at, 'YYYY-MM-DD') as recorded_on, id::text as id
    from athlete_benchmarks
    where athlete_id = ${athleteId} and exercise_slug = 'run_5k' and unit = 'seconds'
    order by recorded_at asc
  `;
  const fiveK = benchRows.map((r) => ({ id: r.id, date: r.recorded_on, seconds: Math.round(num(r.value)) })).filter((r) => r.seconds > 0);
  /** The newest 5 km — the "progresión 5k" card's current point. NOT the VDOT
   *  input: that is a different question with a different, stricter answer. */
  const latest5k = fiveK.length ? fiveK[fiveK.length - 1]! : null;

  // ── VDOT — from the ONE selector, not from "the newest 5 km row" ───────────
  // The 5 km series above is a distinct concept (test progress) and legitimately
  // shows every row. The VDOT is the athlete's running LEVEL, and it has to be
  // the same number the plan prescribes from, so it goes through `selectRunMark`
  // like every other surface: measured marks only, least-extrapolated wins.
  const runMarkRows = await client<Array<{ exercise_slug: string; value: string; age_days: number | null; source: string; run_context: string | null }>>`
    select
      exercise_slug,
      value::text as value,
      (current_date - recorded_at::date)::int as age_days,
      source,
      run_context
    from athlete_benchmarks
    where athlete_id = ${athleteId}
      and exercise_slug = any(${RUN_MARK_SLUGS}::text[])
    order by recorded_at desc
  `;
  const runMark = selectRunMark(
    runMarkRows.flatMap((r) => {
      const value = num(r.value);
      if (!Number.isFinite(value)) return [];
      return [{ slug: r.exercise_slug, value, age_days: r.age_days, source: r.source, run_context: r.run_context }];
    }),
  );

  // ── Period run segments (one round-trip) ───────────────────────────────────
  // A PROPÓSITO sin filtro de esfuerzo: esta consulta es la fuente de DOS
  // preguntas distintas y filtrar aquí contestaría mal una de ellas. Baja todo lo
  // corrido y el reparto se hace abajo, en JS, con el mismo predicado compartido.
  const segs = await client<RunSegRow[]>`
    select
      we.id::text as execution_id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
      se.distance_meters::text as distance_meters,
      coalesce(
        se.avg_pace_s_per_km::float,
        case when se.distance_meters > 0 and se.started_at is not null and se.ended_at is not null
          then extract(epoch from (se.ended_at - se.started_at))::float / (se.distance_meters::float / 1000.0)
          else null end
      )::text as pace_s_per_km,
      se.avg_hr,
      se.run_cadence_spm as cadence_spm,
      se.leg_role,
      coalesce(se.is_structural, false) as is_structural,
      ts.prescription_json->>'scheme' as scheme,
      exists (
        select 1 from segment_executions sib
        left join template_segments tsib on tsib.id = sib.template_segment_id
        left join exercises exib on exib.id = tsib.exercise_id
        where sib.execution_id = se.execution_id
          and coalesce(sib.modality, case when exib.category = 'cardio' and exib.slug ilike '%run%' then 'run' else 'x' end) <> 'run'
      ) as is_compromised
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    where we.athlete_id = ${athleteId}
      and coalesce(se.modality, case when ex.category = 'cardio' and ex.slug ilike '%run%' then 'run' else 'x' end) = 'run'
      and coalesce(we.ended_at, we.started_at) >= ${period.start_iso}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${period.end_iso}::timestamptz
    order by we.started_at asc, se.position asc
  `;

  const paced = segs
    .map((s) => ({
      execution_id: s.execution_id,
      day: s.day,
      dist: numOrNull(s.distance_meters) ?? 0,
      pace: numOrNull(s.pace_s_per_km),
      hr: s.avg_hr,
      cadence: s.cadence_spm != null ? Number(s.cadence_spm) : null,
      scheme: normalizeFormat(s.scheme ?? undefined) ?? null,
      compromised: s.is_compromised,
      work: isWorkEffort(s),
    }))
    .filter((s) => s.dist > 0);

  // EL REPARTO — la decisión de este fichero, en dos líneas.
  //
  // `paced`  = TODO lo corrido, recuperaciones incluidas → alimenta el VOLUMEN.
  //            Esos metros se corrieron: en un 5x1000 con trote de 400 las piernas
  //            hicieron 6,6 km, no 5. Descontarlos haría que el volumen BAJARA el
  //            día que la app empezó a grabar mejor — una regresión fantasma que el
  //            atleta leería como «entrené menos».
  // `effort` = solo los tramos de trabajo → alimenta TODO lo que es un ritmo (por
  //            tipo, por zona, tendencia, cadencia, comprometida). Una media que se
  //            traga el trote de vuelta no es el ritmo de nadie: ni el de las
  //            series ni el del trote, y empeora justo cuando el atleta aprieta.
  //
  // Los kilómetros no mienten al sumarse; el ritmo sí al promediarse. Por eso la
  // línea cae aquí y no en el WHERE.
  const effort = paced.filter((s) => s.work);

  // ── CARD: Ritmo umbral · VDOT ──────────────────────────────────────────────
  cards.push(
    card({
      id: 'threshold',
      title_es: 'Ritmo umbral · tu motor',
      availability: threshold_s ? 'real' : 'needs_logging',
      availability_note: threshold_s ? null : 'Haz un test de carrera para fijar tu umbral.',
      primary: {
        value: threshold_s ? paceStr(threshold_s) : null,
        unit: '/km · Z4',
        side: runMark ? { value: runMark.vdot.toFixed(1), label: 'VDOT' } : null,
      },
      meaning_es: runMark
        ? `¿A qué ritmo correr cada km? Umbral entrenado del plan; VDOT (Daniels) sobre tu ${runMark.spec.label.toLowerCase()}.`
        : '¿A qué ritmo correr cada km? Umbral entrenado del plan.',
    }),
  );

  // ── CARD: Progresión 5k ────────────────────────────────────────────────────
  const fiveKSeries: CardSeriesPoint[] = (() => {
    if (fiveK.length === 0) return [];
    const slowest = Math.max(...fiveK.map((f) => f.seconds));
    return fiveK.map((f, i) => ({
      id: f.id,
      height: slowest > 0 ? Math.max(MIN_BAR, Math.min(1, f.seconds / slowest)) : 0.5,
      display: paceStr(f.seconds),
      current: i === fiveK.length - 1,
      label: f.date,
    }));
  })();
  const fiveKDelta = fiveK.length >= 2 ? latest5k!.seconds - fiveK[0]!.seconds : null;
  cards.push(
    card({
      id: 'five_k_trend',
      title_es: 'Progresión · 5k',
      availability: fiveK.length ? 'real' : 'needs_logging',
      availability_note: fiveK.length ? null : 'Registra un test de 5k para ver tu progresión.',
      primary: latest5k
        ? { value: paceStr(latest5k.seconds), unit: null, side: fiveKDelta != null ? { value: deltaStr(fiveKDelta), label: 'vs 1º test' } : null }
        : null,
      series: fiveKSeries,
      series_kind: 'line',
      series_axis: seriesAxis(fiveKSeries),
      drill: fiveK.length ? drill('running.best_effort', { distance: '5000' }, fiveK.length, `${fiveK.length} tests · con fecha`) : null,
    }),
  );

  // ── CARD: Volumen (period) ─────────────────────────────────────────────────
  // Sobre `paced` (todo), no sobre `effort`: es LA tarjeta de volumen y cuenta los
  // metros que se corrieron. Su drill (running.volume) suma igual, para que abrir
  // la tarjeta nunca dé un total distinto del que la tarjeta enseña.
  const totalMeters = paced.reduce((a, s) => a + s.dist, 0);
  const sessionDays = new Set(paced.map((s) => s.execution_id));
  const weekBuckets = bucketWeeklyVolume(paced);
  const weeks = Math.max(1, Math.round(period.days / 7));
  cards.push(
    card({
      id: 'volume',
      title_es: `Volumen · ${period.label_es}`,
      availability: 'real',
      primary: {
        value: totalMeters > 0 ? (totalMeters / 1000).toFixed(0) : '0',
        unit: 'km',
        side: { value: String(sessionDays.size), label: 'sesiones' },
      },
      series: weekBuckets,
      series_kind: 'bars',
      rows: [
        { id: 'total', label: `Total ${period.label_es}`, value: kmStr(totalMeters), sub: null, accent: true, drill: null },
        { id: 'sessions', label: 'Sesiones', value: String(sessionDays.size), sub: null, accent: false, drill: null },
        { id: 'per_week', label: 'Media/sem', value: kmStr(totalMeters / weeks), sub: null, accent: false, drill: null },
      ],
      drill: sessionDays.size ? drill('running.volume', {}, sessionDays.size, `de ${sessionDays.size} carreras · fecha · ritmo · distancia`) : null,
    }),
  );

  // ── CARD: Mejores esfuerzos · PRs (all-time) ───────────────────────────────
  cards.push(await buildBestEfforts(client, athleteId, latest5k));

  // ── CARD: Por tipo de entreno ──────────────────────────────────────────────
  cards.push(buildByType(effort));

  // ── CARD: Zonas de ritmo (the bands) + Distribución por zona ───────────────
  if (bands.length) {
    cards.push(buildZoneBandsCard(bands, threshold_s));
    cards.push(buildZoneDistribution(effort, bands));
  }

  // ── CARD: Tendencia de ritmo ───────────────────────────────────────────────
  cards.push(buildPaceTrend(effort));

  // ── CARD: Tendencia de cadencia (gated a que haya cadencia registrada) ──────
  cards.push(buildCadenceTrend(effort));

  // ── CARD: Comprometida vs pura ─────────────────────────────────────────────
  cards.push(buildCompromised(effort));

  return {
    section: 'running',
    title_es: 'Carrera',
    availability: 'real',
    period,
    cards,
  };
}

// ── Weekly volume bars (taller = more km) ────────────────────────────────────
function bucketWeeklyVolume(paced: Array<{ day: string; dist: number }>): CardSeriesPoint[] {
  const byWeek = new Map<string, number>();
  for (const s of paced) {
    const wk = isoWeekStart(s.day);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + s.dist);
  }
  const ordered = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(1, ...ordered.map(([, m]) => m));
  return ordered.map(([wk, m], i) => ({
    id: wk,
    height: Math.max(MIN_BAR, Math.min(1, m / max)),
    display: kmStr(m),
    current: i === ordered.length - 1,
    label: wk,
  }));
}

// ── Best efforts ─────────────────────────────────────────────────────────────
async function buildBestEfforts(
  client: Sql,
  athleteId: number,
  latest5k: { seconds: number; date: string } | null,
): Promise<AnalyticsCard> {
  // best 1k: fastest ~1km run segment, scaled to 1km.
  const best1kRows = await client<Array<{ pace: string | null; day: string | null }>>`
    with run_segs as (
      select
        se.distance_meters::float as dist,
        extract(epoch from (se.ended_at - se.started_at))::float as dur,
        se.avg_pace_s_per_km::float as explicit_pace,
        to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      left join template_segments ts on ts.id = se.template_segment_id
      left join exercises ex on ex.id = ts.exercise_id
      where we.athlete_id = ${athleteId}
        and coalesce(se.modality, case when ex.category = 'cardio' and ex.slug ilike '%run%' then 'run' else 'x' end) = 'run'
        -- Un PR es un intento, y el trote de vuelta de un 5x1000 cae dentro de la
        -- banda de ~1 km sin serlo. Mismo filtro que su drill, que sí los contaría
        -- uno a uno en la lista de esfuerzos.
        and ${SEG_IS_WORK_EFFORT(client)}
        and se.distance_meters between ${ONE_KM_MIN_METERS} and ${ONE_KM_MAX_METERS}
    )
    select coalesce(explicit_pace, case when dur > 0 then dur / (dist / 1000.0) else null end)::text as pace, day
    from run_segs
    where coalesce(explicit_pace, case when dur > 0 then dur / (dist / 1000.0) else null end) is not null
    order by coalesce(explicit_pace, case when dur > 0 then dur / (dist / 1000.0) else null end) asc
    limit 1
  `;
  // best 3k: fastest run EXECUTION whose total run distance is ~3km.
  const best3kRows = await client<Array<{ secs: string | null; day: string | null }>>`
    with by_exec as (
      select we.id,
        to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day,
        sum(se.distance_meters)::float as dist,
        sum(extract(epoch from (se.ended_at - se.started_at)))::float as dur
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      left join template_segments ts on ts.id = se.template_segment_id
      left join exercises ex on ex.id = ts.exercise_id
      where we.athlete_id = ${athleteId}
        and coalesce(se.modality, case when ex.category = 'cardio' and ex.slug ilike '%run%' then 'run' else 'x' end) = 'run'
        -- El caso peligroso de todo esto. Aquí se SUMA la distancia de la ejecución
        -- para ver si cae en la banda de 3 km: los metros del trote sacarían un
        -- 4x1000 de la banda, y su tiempo se sumaría al del intento. O sea, o
        -- desaparece un mejor 3 km que sí existió, o aparece uno más lento que
        -- nadie corrió. Y el mismo sumatorio decide la banda de 5 km en el detector
        -- de récords (lib/sync/running-prs.ts), que filtra igual.
        and ${SEG_IS_WORK_EFFORT(client)}
      group by we.id, day
    )
    select dur::text as secs, day from by_exec
    where dist between ${THREE_KM_MIN_METERS} and ${THREE_KM_MAX_METERS} and dur > 0
    order by dur asc limit 1
  `;

  const best1kPace = numOrNull(best1kRows[0]?.pace);
  const best3kSecs = numOrNull(best3kRows[0]?.secs);

  return card({
    id: 'best_efforts',
    title_es: 'Mejores esfuerzos · PRs',
    availability: best1kPace || best3kSecs || latest5k ? 'real' : 'needs_logging',
    rows: [
      {
        id: 'best_1k',
        label: 'Mejor 1 km',
        value: best1kPace ? `${paceStr(best1kPace)} /km` : null,
        sub: best1kRows[0]?.day ?? null,
        accent: true,
        drill: best1kPace ? drill('running.best_effort', { distance: '1000' }, 1, 'su sesión') : null,
      },
      {
        id: 'best_3k',
        label: 'Mejor 3 km',
        value: best3kSecs ? paceStr(best3kSecs) : null,
        sub: best3kRows[0]?.day ?? null,
        accent: false,
        drill: best3kSecs ? drill('running.best_effort', { distance: '3000' }, 1, 'su sesión') : null,
      },
      {
        id: 'best_5k',
        label: 'Mejor 5 km',
        value: latest5k ? paceStr(latest5k.seconds) : null,
        sub: latest5k?.date ?? null,
        accent: false,
        drill: latest5k ? drill('running.best_effort', { distance: '5000' }, 1, 'su test') : null,
      },
    ],
  });
}

// ── By type ──────────────────────────────────────────────────────────────────
// Recibe `effort`, no `paced`: la fila dice «Series · intervalos — 4:05 /km» y esa
// media es de las series. Con los trotes dentro, el tipo que MÁS contraste tiene es
// el que peor ritmo enseñaría, que es exactamente al revés de lo que pasa.
// Los km del `sub` son el denominador de esa media, así que cuentan igual que ella.
function buildByType(
  effort: Array<{ scheme: string | null; execution_id: string; dist: number; pace: number | null }>,
): AnalyticsCard {
  const typed = effort.filter((s) => s.scheme);
  const byScheme = new Map<string, { meters: number; weighted: number; execs: Set<string> }>();
  for (const s of typed) {
    if (s.pace == null) continue;
    const e = byScheme.get(s.scheme!) ?? { meters: 0, weighted: 0, execs: new Set<string>() };
    e.meters += s.dist;
    e.weighted += s.pace * s.dist;
    e.execs.add(s.execution_id);
    byScheme.set(s.scheme!, e);
  }
  const rows = [...byScheme.entries()]
    .map(([scheme, e]) => ({ scheme, avgPace: e.meters > 0 ? e.weighted / e.meters : null, meters: e.meters, sessions: e.execs.size }))
    .sort((a, b) => b.meters - a.meters)
    .map((r) => ({
      id: r.scheme,
      label: SCHEME_LABEL_ES[r.scheme] ?? r.scheme,
      value: r.avgPace ? `${paceStr(r.avgPace)} /km` : null,
      sub: `${r.sessions} ses · ${kmStr(r.meters)}`,
      accent: false,
      drill: drill('running.type', { type: r.scheme }, r.sessions, `${r.sessions} sesiones`),
    }));

  return card({
    id: 'by_type',
    title_es: 'Carrera por tipo · medias reales',
    availability: rows.length ? 'real' : 'needs_logging',
    availability_note: rows.length ? 'Solo sesiones con tipo asignado por el coach.' : 'Aún no hay carreras con tipo asignado.',
    rows,
    meaning_es: 'Tipo = scheme del coach; media = ritmo ejecutado. Cada fila abre sus sesiones.',
  });
}

// ── Zone bands card (the athlete's pace zones) ───────────────────────────────
function buildZoneBandsCard(bands: ZoneBand[], threshold_s: number | null): AnalyticsCard {
  const zones: CardZone[] = [...bands]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((z) => ({
      code: z.code,
      label: z.label,
      color: z.color,
      value: zoneRangeLabel(z),
      pct: null,
      drill: null,
    }));
  return card({
    id: 'pace_zones',
    title_es: 'Tus zonas de ritmo',
    availability: 'real',
    zones,
    availability_note: threshold_s ? 'Zonas de ritmo (no FC) sobre tu umbral.' : null,
  });
}

function zoneRangeLabel(z: ZoneBand): string | null {
  const fast = paceStr(z.fast_s ?? undefined);
  const slow = z.slow_s != null ? paceStr(z.slow_s) : null;
  if (z.slow_s == null && z.fast_s != null) return `>${fast}`;
  if (fast && slow) return `${slow}–${fast}`;
  return fast ?? slow;
}

// ── Zone distribution (km per zone over the period) ──────────────────────────
// Recibe `effort`: aquí cada tramo se clasifica POR SU RITMO, así que un trote de
// vuelta aterrizaría entero en Z1/Z2 y diría que el atleta hace suave justo el día
// que hizo series. El total de esta tarjeta no cuadra con el de Volumen a
// propósito — una reparte esfuerzo por zona, la otra cuenta kilómetros.
function buildZoneDistribution(
  effort: Array<{ dist: number; pace: number | null }>,
  bands: ZoneBand[],
): AnalyticsCard {
  const meters = new Map<string, number>();
  let total = 0;
  for (const s of effort) {
    if (s.pace == null) continue;
    const z = classifyZone(s.pace, bands);
    if (!z) continue;
    meters.set(z.code, (meters.get(z.code) ?? 0) + s.dist);
    total += s.dist;
  }
  const zones: CardZone[] = [...bands]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((z) => {
      const m = meters.get(z.code) ?? 0;
      return {
        code: z.code,
        label: z.label,
        color: z.color,
        value: kmStr(m),
        pct: total > 0 ? Math.round((m / total) * 100) : 0,
        drill: m > 0 ? drill('running.zone', { zone: z.code }, 0, z.label) : null,
      };
    });
  return card({
    id: 'zone_distribution',
    title_es: 'Distribución por zona',
    availability: total > 0 ? 'real' : 'needs_logging',
    zones,
    drill: total > 0 ? drill('running.zone', {}, effort.length, 'reparto por zona') : null,
  });
}

// ── Pace trend (weekly volume-weighted pace) ─────────────────────────────────
// Recibe `effort`. El copy de la tarjeta dice «bajando = motor mejorando», y con
// los trotes dentro subiría en la semana de más calidad: la frase sería falsa.
function buildPaceTrend(effort: Array<{ day: string; dist: number; pace: number | null }>): AnalyticsCard {
  const byWeek = new Map<string, { meters: number; timeSecs: number }>();
  for (const s of effort) {
    if (s.pace == null) continue;
    const wk = isoWeekStart(s.day);
    const e = byWeek.get(wk) ?? { meters: 0, timeSecs: 0 };
    e.meters += s.dist;
    e.timeSecs += s.pace * (s.dist / 1000);
    byWeek.set(wk, e);
  }
  const ordered = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([, e]) => e.meters > 0)
    .slice(-PACE_TREND_WEEKS)
    .map(([wk, e]) => ({ wk, pace: e.timeSecs / (e.meters / 1000) }));
  const slowest = Math.max(1, ...ordered.map((o) => o.pace));
  const series: CardSeriesPoint[] = ordered.map((o, i) => ({
    id: o.wk,
    height: Math.max(MIN_BAR, Math.min(1, o.pace / slowest)),
    display: paceStr(o.pace),
    current: i === ordered.length - 1,
    label: o.wk,
  }));
  return card({
    id: 'pace_trend',
    title_es: 'Tendencia de ritmo',
    availability: series.length ? 'real' : 'needs_logging',
    series,
    series_kind: 'line',
    series_axis: seriesAxis(series),
    meaning_es: 'Ritmo medio ponderado por semana. Bajando = motor mejorando.',
  });
}

// ── Cadence trend (weekly distance-weighted average cadence) ─────────────────
// Steps/min, averaged per ISO week and weighted by distance (a longer leg should
// dominate the week's number — the same weighting the pace trend uses). Only run
// segments that actually carry a cadence contribute; a week with none is dropped.
// Taller bar = higher cadence. Gated to 'needs_logging' until any run has cadence,
// so it never shows a fabricated number on an athlete who's never logged one.
// Recibe `effort`: la cadencia de un trote de vuelta es baja por definición, y
// mezclarla dice «zancada menos económica» cuando lo único que pasó es que hubo
// recuperaciones. Es la misma media ponderada que el ritmo, y va sobre lo mismo.
function buildCadenceTrend(
  effort: Array<{ day: string; dist: number; cadence: number | null }>,
): AnalyticsCard {
  const byWeek = new Map<string, { meters: number; weighted: number }>();
  for (const s of effort) {
    if (s.cadence == null || s.dist <= 0) continue;
    const wk = isoWeekStart(s.day);
    const e = byWeek.get(wk) ?? { meters: 0, weighted: 0 };
    e.meters += s.dist;
    e.weighted += s.cadence * s.dist;
    byWeek.set(wk, e);
  }
  const ordered = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([, e]) => e.meters > 0)
    .slice(-PACE_TREND_WEEKS)
    .map(([wk, e]) => ({ wk, cadence: e.weighted / e.meters }));
  const highest = Math.max(1, ...ordered.map((o) => o.cadence));
  const series: CardSeriesPoint[] = ordered.map((o, i) => ({
    id: o.wk,
    height: Math.max(MIN_BAR, Math.min(1, o.cadence / highest)),
    display: `${Math.round(o.cadence)} spm`,
    current: i === ordered.length - 1,
    label: o.wk,
  }));
  const latest = ordered.length ? ordered[ordered.length - 1]!.cadence : null;
  return card({
    id: 'cadence_trend',
    title_es: 'Tendencia de cadencia',
    availability: series.length ? 'real' : 'needs_logging',
    availability_note: series.length
      ? null
      : 'Llega en cuanto registres carreras con cadencia (reloj o captura).',
    primary: latest != null ? { value: `${Math.round(latest)}`, unit: 'spm', side: null } : null,
    series,
    series_kind: 'line',
    series_axis: seriesAxis(series),
    meaning_es: 'Cadencia media por semana (pasos/min). Subir suele indicar una zancada más económica.',
  });
}

// ── Compromised vs pure ──────────────────────────────────────────────────────
// Recibe `effort`. La tarjeta compara DOS ritmos y se juega la lectura en una
// diferencia de segundos; un trote colado en cualquiera de los dos lados la
// inventa. Ojo: la recuperación NO es lo que marca `compromised` — ese flag mira
// si la ejecución tiene tramos de otra modalidad, y una recuperación es 'run'.
function buildCompromised(
  effort: Array<{ compromised: boolean; dist: number; pace: number | null }>,
): AnalyticsCard {
  const agg = (list: typeof effort) => {
    let meters = 0;
    let weighted = 0;
    for (const s of list) {
      if (s.pace == null) continue;
      meters += s.dist;
      weighted += s.pace * s.dist;
    }
    return meters > 0 ? weighted / meters : null;
  };
  const purePace = agg(effort.filter((s) => !s.compromised));
  const compPace = agg(effort.filter((s) => s.compromised));
  const delta = purePace != null && compPace != null ? compPace - purePace : null;
  const hasCompromised = compPace != null;

  return card({
    id: 'compromised',
    title_es: 'Comprometida vs pura',
    availability: hasCompromised ? 'real' : 'gate',
    availability_note: hasCompromised ? null : 'Comprometida llega con tu próxima carrera/simulación en multi-estación.',
    rows: [
      { id: 'pure', label: 'Carrera pura', value: purePace ? `${paceStr(purePace)} /km` : null, sub: 'run en solitario', accent: false, drill: null },
      { id: 'compromised', label: 'Comprometida', value: compPace ? `${paceStr(compPace)} /km` : null, sub: 'run dentro de bloque multi-estación', accent: true, drill: null },
      { id: 'gap', label: 'Diferencia', value: delta != null ? `${deltaStr(delta)} /km` : null, sub: 'sostener <10% = más rápido en meta', accent: false, drill: null },
    ],
    meaning_es: 'Tu ritmo dentro de un bloque con estaciones vs en solitario. Solo lo ve quien conoce el formato HYROX.',
  });
}
