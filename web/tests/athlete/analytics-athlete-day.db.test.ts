/**
 * EN QUÉ DÍA CAE LO QUE HIZO EL ATLETA — las analíticas de carrera, contra la base real.
 *
 * La regla (docs/DECISIONS.md, 2026-09-23 «Qué día es en cada sitio»): lo que VIVE
 * el atleta se fecha en SU calendario (`athletes.timezone`). La base corre en UTC,
 * así que `date_trunc('day'|'week', ts)`, `to_char(ts, …)` y `ts::date` cortan por
 * el día UTC, igual que `toISOString().slice(0, 10)` en TypeScript. Cada caso usa un
 * atleta en Auckland (NZDT, UTC+13) con algo hecho a primera hora de SU día —que en
 * UTC todavía es el día anterior— y comprueba dónde cae. Con el corte UTC, cada
 * aserción de este fichero falla.
 *
 * Los instantes (marzo de 2031, Auckland = UTC+13):
 *   · MON_RUN  2031-03-09T19:00Z = lunes 10, 08:00 en Auckland (domingo 9 en UTC):
 *     1 km a 4:00.
 *   · WED_RUN  2031-03-11T19:00Z = miércoles 12, 08:00 (martes 11 en UTC): 3 km a 5:00.
 *   · NOW      2031-03-11T21:00Z = miércoles 12, 10:00 (martes 11 en UTC).
 *   Su semana empieza el lunes 10 a las 00:00 de Auckland (domingo 9, 11:00 UTC); la
 *   semana UTC, el lunes 10 a las 00:00 UTC — trece horas después del lunes 10 de él.
 *
 * Limpieza: cada fixture borra su atleta, y con él (en cascada) sus ejecuciones,
 * marcas, perfiles y lecturas.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { buildRunningAnalysis } from '@/lib/athlete/running-analysis';
import { buildAnalyticsSection, buildDrillDown, resolvePeriod } from '@/lib/athlete/analytics';
import type { AnalyticsCard } from '@/lib/athlete/analytics';
import { buildRunningProgress } from '@/lib/athlete/analytics/running-progress';
import { buildAthleteVo2Max } from '@/lib/athlete/vo2max';
import { buildRunningCapacidad } from '@/lib/athlete/running/capacidad';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const DB_TIMEOUT = 30_000;
const AUCKLAND = 'Pacific/Auckland';

/** Lunes 10, 08:00 en Auckland — domingo 9 en UTC. */
const MON_RUN = '2031-03-09T19:00:00Z';
/** Miércoles 12, 08:00 en Auckland — martes 11 en UTC. */
const WED_RUN = '2031-03-11T19:00:00Z';
/** Miércoles 12, 10:00 en Auckland — martes 11 en UTC. */
const NOW = new Date('2031-03-11T21:00:00Z');

const ZONES_6 = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'].map((code, i) => ({
  code,
  label: code,
  color: '#888888',
  sort_order: i,
  fast_s: 300 - i * 10,
  slow_s: i === 0 ? null : 309 - (i - 1) * 10,
}));

function cardById(cards: AnalyticsCard[], id: string): AnalyticsCard {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`card ${id} not found (have: ${cards.map((x) => x.id).join(', ')})`);
  return c;
}

describeWithDb('las analíticas de carrera fechan en el día del atleta (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  afterAll(async () => {
    await closeTestSql();
  });

  async function athleteIn(tz: string): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    await sql`update athletes set timezone = ${tz} where id = ${fx.athleteId}`;
    return fx;
  }

  /** Una sesión de carrera: tramos de trabajo seguidos desde `startedAt`. */
  async function run(
    fx: Fixture,
    startedAt: string,
    legs: Array<{ meters: number; seconds: number }>,
  ): Promise<{ executionId: number; segmentIds: number[] }> {
    const iso = (ms: number) => new Date(ms).toISOString();
    const start = Date.parse(startedAt);
    const total = legs.reduce((a, l) => a + l.seconds, 0);
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (athlete_id, started_at, ended_at, total_duration_seconds, source)
      values (${fx.athleteId}, ${startedAt}::timestamptz, ${iso(start + total * 1000)}::timestamptz, ${total}, 'manual')
      returning id::text
    `;
    const executionId = Number(exec[0]!.id);
    const segmentIds: number[] = [];
    let t = start;
    for (const [position, leg] of legs.entries()) {
      const seg = await sql<Array<{ id: string }>>`
        insert into segment_executions (
          execution_id, position, started_at, ended_at, modality, distance_meters, avg_pace_s_per_km, source
        ) values (
          ${executionId}, ${position}, ${iso(t)}::timestamptz, ${iso(t + leg.seconds * 1000)}::timestamptz,
          'run', ${leg.meters}, ${leg.seconds / (leg.meters / 1000)}, 'manual'
        )
        returning id::text
      `;
      segmentIds.push(Number(seg[0]!.id));
      t += leg.seconds * 1000;
    }
    return { executionId, segmentIds };
  }

  async function mark(
    fx: Fixture,
    slug: string,
    value: number,
    unit: 'seconds' | 'meters',
    recordedAt: string,
  ): Promise<void> {
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, source, run_context, recorded_at)
      values (${fx.athleteId}, ${slug}, ${value}, ${unit}, 'athlete_test', 'outdoor', ${recordedAt}::timestamptz)
    `;
  }

  /** La semana de lunes 10 de Auckland: un 1 km el lunes a primera hora, un 3 km el
   *  miércoles, y un test de 5 km el lunes. */
  async function weekOfMonday10(fx: Fixture): Promise<void> {
    await run(fx, MON_RUN, [{ meters: 1000, seconds: 240 }]);
    await run(fx, WED_RUN, [{ meters: 3000, seconds: 900 }]);
    await mark(fx, 'run_5k', 1200, 'seconds', '2031-03-09T19:30:00Z');
  }

  // ── 1 · running-analysis (Inicio · el análisis de carrera) ─────────────────

  test(
    'análisis de carrera: «esta semana» empieza en SU lunes, la progresión agrupa por SU semana y el test de 5 km lleva su día',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      await weekOfMonday10(fx);

      const result = await buildRunningAnalysis({ athlete_id: fx.athleteId, now: NOW }, sql);

      // Su lunes empezó antes que el lunes UTC: el km del lunes a las 8:00 es de
      // esta semana (con la semana UTC, el domingo anterior: 3.0 km).
      expect(result.weekly_volume_km).toBe('4.0 km');
      expect(result.volume_7d_km).toBe('4.0 km');
      // Los dos rodajes son de la misma semana suya: una barra (en UTC, dos).
      expect(result.progression).toHaveLength(1);
      // El test lo hizo el lunes 10 (en UTC, el domingo 9).
      expect(result.five_k_trend.map((p) => p.date)).toEqual(['2031-03-10']);
    },
    DB_TIMEOUT,
  );

  test(
    'análisis de carrera, al oeste de UTC: el rodaje del domingo por la noche en Los Ángeles es de la semana pasada',
    async () => {
      const fx = await athleteIn('America/Los_Angeles');
      // Domingo 16, 20:00 en Los Ángeles (PDT, UTC−7) — ya lunes 17 en UTC.
      await run(fx, '2031-03-17T03:00:00Z', [{ meters: 5000, seconds: 1500 }]);
      // Lunes 17, 06:00 en Los Ángeles.
      await run(fx, '2031-03-17T13:00:00Z', [{ meters: 2000, seconds: 600 }]);

      // Lunes 17, 13:00 en Los Ángeles: su semana empezó a las 00:00 de su lunes
      // (07:00 UTC), no a la medianoche UTC.
      const result = await buildRunningAnalysis(
        { athlete_id: fx.athleteId, now: new Date('2031-03-17T20:00:00Z') },
        sql,
      );

      expect(result.weekly_volume_km).toBe('2.0 km');
      // El domingo y el lunes son de semanas suyas distintas: dos barras (en UTC, una).
      expect(result.progression).toHaveLength(2);
    },
    DB_TIMEOUT,
  );

  // ── 2 · analytics/running (la pestaña Analíticas · Carrera) y su detalle ───

  test(
    'analíticas · carrera: cada sesión, cada test y cada semana en su día, y el detalle dice lo mismo que la tarjeta',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      await weekOfMonday10(fx);
      const period = resolvePeriod({ key: 'month', now: NOW });

      const section = await buildAnalyticsSection({ athlete_id: fx.athleteId, section: 'running', period }, sql);

      // Volumen: una barra, la de su semana del lunes 10 (en UTC: 3 y 10 de marzo).
      expect(cardById(section.cards, 'volume').series.map((p) => p.id)).toEqual(['2031-03-10']);
      // Tendencia de ritmo: la misma semana, un punto.
      expect(cardById(section.cards, 'pace_trend').series).toHaveLength(1);
      // Progresión 5k: el test es del lunes 10.
      expect(cardById(section.cards, 'five_k_trend').series.map((p) => p.label)).toEqual(['2031-03-10']);
      // Mejores esfuerzos: el mejor km el lunes 10, el mejor 3 km el miércoles 12.
      const best = cardById(section.cards, 'best_efforts');
      expect(best.rows.find((r) => r.id === 'best_1k')?.sub).toBe('2031-03-10');
      expect(best.rows.find((r) => r.id === 'best_3k')?.sub).toBe('2031-03-12');
      expect(best.rows.find((r) => r.id === 'best_5k')?.sub).toBe('2031-03-10');

      const drill = (kind: string, params: Record<string, string> = {}) =>
        buildDrillDown({ athlete_id: fx.athleteId, kind, params, period }, sql);
      expect((await drill('running.volume'))!.sessions.map((s) => s.date)).toEqual(['2031-03-12', '2031-03-10']);
      expect((await drill('running.best_effort', { distance: '1000' }))!.sessions.map((s) => s.date)).toEqual([
        '2031-03-10',
      ]);
      expect((await drill('running.best_effort', { distance: '3000' }))!.sessions.map((s) => s.date)).toEqual([
        '2031-03-12',
      ]);
      expect((await drill('running.best_effort', { distance: '5000' }))!.sessions.map((s) => s.date)).toEqual([
        '2031-03-10',
      ]);
    },
    DB_TIMEOUT,
  );

  // ── 3 · running-progress («¿Estoy mejorando?») ─────────────────────────────

  test(
    '¿estoy mejorando?: la ventana de zonas empieza en SU lunes y su primera sesión lleva su día',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      // Miércoles 5, 10:00 en Auckland (martes 4 en UTC) — la semana del lunes 3.
      const earlier = await run(fx, '2031-03-04T21:00:00Z', [{ meters: 2000, seconds: 600 }]);
      // Miércoles 12, 08:00 en Auckland — la semana del lunes 10.
      const later = await run(fx, WED_RUN, [{ meters: 2000, seconds: 600 }]);
      const zoneSeconds = (segmentId: number, z2: number, z4: number) => sql`
        insert into segment_zone_seconds (
          segment_execution_id, z2_s, z4_s, hr_origin, computed_with_anchor, computed_with_lthr_bpm
        ) values (${segmentId}, ${z2}, ${z4}, 'samples', 'lthr_measured', 170)
      `;
      await zoneSeconds(earlier.segmentIds[0]!, 600, 0);
      await zoneSeconds(later.segmentIds[0]!, 0, 300);

      // Lunes 17, 08:00 en Auckland (domingo 16 en UTC). Con una semana de ventana,
      // `since` cae el lunes 10 a las 08:00 de él, que en UTC es domingo 9: el lunes
      // UTC de ese domingo es el 3, y la ventana contaba la semana de antes.
      const progress = await buildRunningProgress({
        athlete_id: fx.athleteId,
        now: new Date('2031-03-16T19:00:00Z'),
        weeks: 1,
        client: sql,
      });

      expect(progress.history.zonas_s).toEqual({ z1: 0, z2: 0, z3: 0, z4: 300, z5: 0 });
      // Su primera sesión fue el miércoles 5 (en UTC, el martes 4).
      expect(progress.historia.desde).toBe('2031-03-05');
    },
    DB_TIMEOUT,
  );

  // ── 4 · vo2max ─────────────────────────────────────────────────────────────

  test(
    'VO₂máx: cada lectura cae en su día, la ventana empieza en SU medianoche y el Cooper lleva su fecha',
    async () => {
      const watch = await athleteIn(AUCKLAND);
      const reading = (at: string, v: number) => sql`
        insert into biometric_streams (athlete_id, source, metric_type, recorded_at, value_numeric, unit)
        values (${watch.athleteId}, 'healthkit', 'vo2max', ${at}::timestamptz, ${v}, 'ml/kg/min')
      `;
      // El primer día de su ventana de 90 días es el 13 de diciembre: esta lectura es
      // de ese día a las 8:00 de él (12 de diciembre en UTC, antes de la medianoche
      // UTC del 13, que era donde empezaba la ventana).
      await reading('2030-12-12T19:00:00Z', 45);
      await reading('2031-03-08T19:00:00Z', 49); // domingo 9, 08:00
      await reading(MON_RUN, 50); // lunes 10, 08:00 (domingo 9 en UTC)…
      await reading('2031-03-10T02:00:00Z', 52); // …y lunes 10, 15:00: el mismo día suyo
      await reading('2031-03-10T19:00:00Z', 53); // martes 11, 08:00
      await reading(WED_RUN, 54); // miércoles 12, 08:00

      const fromWatch = await buildAthleteVo2Max({ athlete_id: watch.athleteId, on_date: NOW, client: sql });
      expect(fromWatch.series).toEqual([
        { iso_date: '2030-12-13', value: 45 },
        { iso_date: '2031-03-09', value: 49 },
        { iso_date: '2031-03-10', value: 51 },
        { iso_date: '2031-03-11', value: 53 },
        { iso_date: '2031-03-12', value: 54 },
      ]);
      expect(fromWatch.headline).toEqual({ value: 54, source: 'watch', measured_on: '2031-03-12' });

      // Sin reloj, manda el Cooper: lo hizo el lunes 10 a las 8:00 (domingo 9 en UTC).
      const cooper = await athleteIn(AUCKLAND);
      await mark(cooper, 'cooper_12min', 2800, 'meters', MON_RUN);
      const fromCooper = await buildAthleteVo2Max({ athlete_id: cooper.athleteId, on_date: NOW, client: sql });
      expect(fromCooper.headline?.source).toBe('cooper');
      expect(fromCooper.headline?.measured_on).toBe('2031-03-10');
      expect(fromCooper.vdot?.recorded_on).toBe('2031-03-10');
    },
    DB_TIMEOUT,
  );

  // ── 5 · capacidad (Carrera · Capacidad) ────────────────────────────────────

  test(
    'capacidad: el umbral y las marcas cuentan su edad con el reloj del builder, y cada récord lleva su día',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      await sql`
        insert into athlete_zone_profiles (
          athlete_id, modality, threshold_s, pace_unit, zones_json, version, recorded_at, source, needs_review
        ) values (
          ${fx.athleteId}, 'run', 270, 'per_km', ${sql.json(ZONES_6)}, 1, ${MON_RUN}::timestamptz, 'coach_test', false
        )
      `;
      await mark(fx, 'run_1k', 230, 'seconds', MON_RUN);
      // Un 5 km de hace 38 días suyos (domingo 2 de febrero, 08:00) y otro más rápido
      // el lunes 10: el viejo es la línea de base del predictor (≥ 28 días).
      await mark(fx, 'run_5k', 1260, 'seconds', '2031-02-01T19:00:00Z');
      await mark(fx, 'run_5k', 1200, 'seconds', '2031-03-09T19:30:00Z');

      const result = await buildRunningCapacidad({ athlete_id: fx.athleteId, now: NOW, client: sql });

      // Del lunes 10 al miércoles 12 de su calendario: 2 días (con el reloj de la
      // base, una edad negativa: la base vive en 2026).
      expect(result.umbral?.hace_dias).toBe(2);
      const run1k = result.records.find((r) => r.slug === 'run_1k' && r.contexto === 'street');
      expect(run1k).toMatchObject({ fecha: '2031-03-10', reciente: true });
      const run5k = result.records.find((r) => r.slug === 'run_5k' && r.contexto === 'street');
      expect(run5k).toMatchObject({ valor: 1200, fecha: '2031-03-10' });
      // Hay línea de base: el 5 km de hoy contra el de hace 38 días, más rápido.
      expect(result.predictor).not.toBeNull();
      expect(result.predictor![0]!.delta_s).not.toBeNull();
      expect(result.predictor![0]!.delta_s!).toBeLessThan(0);
    },
    DB_TIMEOUT,
  );
});
