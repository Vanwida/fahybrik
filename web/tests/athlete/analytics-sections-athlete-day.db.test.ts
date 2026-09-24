/**
 * EN QUÉ DÍA CAE LO QUE HIZO EL ATLETA — el resto de sus analíticas (ergo, HYROX,
 * fuerza, recuperación, la tendencia biométrica de Inicio, el historial y las
 * tendencias de Carrera, las lecturas), contra la base real.
 *
 * Misma regla y mismos instantes que analytics-athlete-day.db.test.ts (DECISIONS
 * «Qué día es en cada sitio»; Auckland en marzo de 2031 = UTC+13):
 *   · MON 2031-03-09T19:00Z = lunes 10, 08:00 en Auckland (domingo 9 en UTC);
 *   · WED 2031-03-11T19:00Z = miércoles 12, 08:00 (martes 11 en UTC);
 *   · NOW 2031-03-11T21:00Z = miércoles 12, 10:00 (martes 11 en UTC).
 * Cada tarjeta y su detalle fechan esas sesiones el 10 y el 12 — y una semana suya
 * (la del lunes 10) es UNA barra, no dos. Con el corte UTC, cada aserción que
 * lleva una fecha falla.
 *
 * Limpieza: cada fixture borra su atleta, y con él (en cascada) sus ejecuciones,
 * marcas, máximos y lecturas; plantillas y ejercicios, los suyos.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { buildAnalyticsSection, buildDrillDown, resolvePeriod } from '@/lib/athlete/analytics';
import type { AnalyticsCard } from '@/lib/athlete/analytics';
import { buildAthleteBiometricTrend } from '@/lib/athlete/biometric-trend';
import { buildRunningHistorial } from '@/lib/athlete/running/historial';
import { buildRunningTendencias } from '@/lib/athlete/running/tendencias';
import { buildAnaliticasAtleta } from '@/lib/athlete/analytics/lecturas';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeExercise,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

const DB_TIMEOUT = 30_000;
const AUCKLAND = 'Pacific/Auckland';

/** Lunes 10, 08:00 en Auckland — domingo 9 en UTC. */
const MON = '2031-03-09T19:00:00Z';
/** Miércoles 12, 08:00 en Auckland — martes 11 en UTC. */
const WED = '2031-03-11T19:00:00Z';
/** Miércoles 12, 10:00 en Auckland — martes 11 en UTC. */
const NOW = new Date('2031-03-11T21:00:00Z');
const PERIOD = resolvePeriod({ key: 'month', now: NOW });

function cardById(cards: AnalyticsCard[], id: string): AnalyticsCard {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`card ${id} not found (have: ${cards.map((x) => x.id).join(', ')})`);
  return c;
}

function plusMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

describeWithDb('el resto de analíticas del atleta fechan en su día (DB real)', () => {
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

  /** Una ejecución de `minutes` minutos desde `startedAt`, con un solo tramo. */
  async function execution(
    fx: Fixture,
    startedAt: string,
    minutes: number,
    segment: Record<string, string | number | null>,
    extra: { assignmentId?: number; scoreTimeS?: number } = {},
  ): Promise<{ executionId: number; segmentId: number }> {
    const endedAt = plusMinutes(startedAt, minutes);
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source, score_time_s
      ) values (
        ${extra.assignmentId ?? null}, ${fx.athleteId}, ${startedAt}::timestamptz, ${endedAt}::timestamptz,
        ${minutes * 60}, 'manual', ${extra.scoreTimeS ?? null}
      )
      returning id::text
    `;
    const executionId = Number(exec[0]!.id);
    const seg = await sql<Array<{ id: string }>>`
      insert into segment_executions ${sql({
        execution_id: executionId,
        position: 0,
        started_at: startedAt,
        ended_at: endedAt,
        source: 'manual',
        ...segment,
      })}
      returning id::text
    `;
    return { executionId, segmentId: Number(seg[0]!.id) };
  }

  async function biometric(fx: Fixture, metric: string, at: string, value: number, unit: string): Promise<void> {
    await sql`
      insert into biometric_streams (athlete_id, source, metric_type, recorded_at, value_numeric, unit)
      values (${fx.athleteId}, 'healthkit', ${metric}, ${at}::timestamptz, ${value}, ${unit})
    `;
  }

  async function zoneSeconds(segmentId: number, z2: number, z4: number): Promise<void> {
    await sql`
      insert into segment_zone_seconds (
        segment_execution_id, z2_s, z4_s, hr_origin, computed_with_anchor, computed_with_lthr_bpm
      ) values (${segmentId}, ${z2}, ${z4}, 'samples', 'lthr_measured', 170)
    `;
  }

  // ── ergo ────────────────────────────────────────────────────────────────────

  test(
    'ergo: la tendencia, el volumen semanal y los tres detalles fechan cada remo en su día',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      const row = (pace500: number, power: number, calories: number) => ({
        modality: 'row',
        distance_meters: 2000,
        avg_pace_s_per_500m: pace500,
        avg_power_w: power,
        stroke_rate_spm: 28,
        calories,
      });
      await execution(fx, MON, 8, row(110, 250, 100));
      await execution(fx, WED, 8, row(108, 260, 110));

      const section = await buildAnalyticsSection(
        { athlete_id: fx.athleteId, section: 'ergo', period: PERIOD, erg: 'row' },
        sql,
      );
      expect(cardById(section.cards, 'ergo_trend').series.map((p) => p.label)).toEqual(['2031-03-10', '2031-03-12']);
      expect(cardById(section.cards, 'ergo_volume').series.map((p) => p.id)).toEqual(['2031-03-10']);

      for (const kind of ['ergo.split', 'ergo.power', 'ergo.calories']) {
        const drill = await buildDrillDown(
          { athlete_id: fx.athleteId, kind, params: { modality: 'row' }, period: PERIOD },
          sql,
        );
        // El del miércoles gana en los tres (más rápido, más vatios, más calorías).
        expect(drill!.sessions.map((s) => s.date)).toEqual(['2031-03-12', '2031-03-10']);
      }
    },
    DB_TIMEOUT,
  );

  // ── HYROX ───────────────────────────────────────────────────────────────────

  test(
    'HYROX: una simulación puntuada lleva su día en la tarjeta y en su detalle',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      const tpl = await makeTemplate({ fx, name: 'Simulación HYROX', format: 'hyrox_sim' });
      const assignmentId = await makeAssignment({
        fx,
        templateId: tpl,
        scheduledForIso: '2031-03-10',
        status: 'completed',
      });
      const { executionId } = await execution(fx, MON, 60, { modality: 'run' }, { assignmentId, scoreTimeS: 3600 });

      const section = await buildAnalyticsSection(
        { athlete_id: fx.athleteId, section: 'hyrox', period: PERIOD },
        sql,
      );
      const row = cardById(section.cards, 'sim_scores').rows.find((r) => r.id === String(executionId));
      expect(row?.sub).toBe('Simulación HYROX · 10 mar');

      const drill = await buildDrillDown(
        { athlete_id: fx.athleteId, kind: 'hyrox.scores', params: {}, period: PERIOD },
        sql,
      );
      expect(drill!.sessions.map((s) => s.date)).toEqual(['2031-03-10']);
    },
    DB_TIMEOUT,
  );

  // ── fuerza ──────────────────────────────────────────────────────────────────

  test(
    'fuerza: los tests de 1RM y las sesiones con series, en su día y en su semana, en la tarjeta y en el detalle',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      const squat = await makeExercise({ fx, name: 'Back Squat' });
      await sql`
        insert into athlete_strength_maxes (athlete_id, exercise_slug, one_rm_kg, source, version, recorded_at)
        values
          (${fx.athleteId}, 'back_squat_1rm', 100, 'athlete_test', 1, ${MON}::timestamptz),
          (${fx.athleteId}, 'back_squat_1rm', 105, 'athlete_test', 2, ${WED}::timestamptz)
      `;
      for (const at of [MON, WED]) {
        const { segmentId } = await execution(fx, at, 30, { modality: 'strength', exercise_id: squat });
        await sql`
          insert into set_executions (
            segment_execution_id, set_index, reps_prescribed, reps_actual, load_prescribed_kg, load_actual_kg,
            status, confirmed
          ) values (${segmentId}, 1, 5, 5, 100, 100, 'done', true)
        `;
      }

      const section = await buildAnalyticsSection(
        { athlete_id: fx.athleteId, section: 'strength', period: PERIOD },
        sql,
      );
      expect(cardById(section.cards, 'one_rm_hero').series.map((p) => p.label)).toEqual([
        '2031-03-10',
        '2031-03-12',
      ]);
      expect(cardById(section.cards, 'strength_volume').series.map((p) => p.id)).toEqual(['2031-03-10']);

      const drill = (kind: string, params: Record<string, string> = {}) =>
        buildDrillDown({ athlete_id: fx.athleteId, kind, params, period: PERIOD }, sql);
      expect((await drill('strength.lift', { slug: 'back_squat_1rm' }))!.sessions.map((s) => s.date)).toEqual([
        '2031-03-12',
        '2031-03-10',
      ]);
      expect((await drill('strength.volume'))!.sessions.map((s) => s.date)).toEqual(['2031-03-12', '2031-03-10']);
      expect(
        (await drill('strength.exercise', { exercise_id: String(squat) }))!.sessions.map((s) => s.date),
      ).toEqual(['2031-03-12', '2031-03-10']);
    },
    DB_TIMEOUT,
  );

  // ── recuperación ───────────────────────────────────────────────────────────

  test(
    'recuperación: cada lectura de HRV en su día (tarjeta y detalle), y las zonas de FC desde SU lunes',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      // 08:00 del 9, 10, 11 y 12 en Auckland: en UTC, del 8 al 11.
      const hrvAt = ['2031-03-08T19:00:00Z', MON, '2031-03-10T19:00:00Z', WED];
      for (const [i, at] of hrvAt.entries()) await biometric(fx, 'hrv', at, 60 + i * 2, 'ms');

      // El periodo (30 días) empieza el lunes 10 de febrero a las 10:00 de Auckland
      // — domingo 9 en UTC, cuyo lunes UTC es el 3. Una sesión del miércoles 5 de
      // febrero (fuera, en su calendario) y otra del miércoles 12 de marzo (dentro).
      const outside = await execution(fx, '2031-02-04T21:00:00Z', 20, { modality: 'run', distance_meters: 4000 });
      const inside = await execution(fx, WED, 20, { modality: 'run', distance_meters: 4000 });
      await zoneSeconds(outside.segmentId, 600, 0);
      await zoneSeconds(inside.segmentId, 0, 300);

      const section = await buildAnalyticsSection(
        { athlete_id: fx.athleteId, section: 'recovery', period: PERIOD },
        sql,
      );
      expect(cardById(section.cards, 'hrv').series.map((p) => p.id)).toEqual([
        '2031-03-09',
        '2031-03-10',
        '2031-03-11',
        '2031-03-12',
      ]);
      const zones = cardById(section.cards, 'hr_zones').zones;
      expect(zones.find((z) => z.code === 'Z4')?.pct).toBe(100);
      expect(zones.find((z) => z.code === 'Z2')?.pct).toBe(0);

      const drill = await buildDrillDown(
        { athlete_id: fx.athleteId, kind: 'recovery.metric', params: { metric: 'hrv' }, period: PERIOD },
        sql,
      );
      expect(drill!.sessions.map((s) => s.date)).toEqual(['2031-03-12', '2031-03-11', '2031-03-10', '2031-03-09']);
    },
    DB_TIMEOUT,
  );

  // ── la tendencia biométrica de Inicio ──────────────────────────────────────

  test(
    'tendencia biométrica: los 90 días empiezan en SU medianoche y cada lectura cae en su día',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      // El 13 de diciembre es el primer día de su ventana; a las 8:00 de él aún es
      // el 12 en UTC, antes de la medianoche UTC del 13.
      const hrvAt = ['2030-12-12T19:00:00Z', '2031-03-08T19:00:00Z', MON, '2031-03-10T19:00:00Z', WED];
      for (const [i, at] of hrvAt.entries()) await biometric(fx, 'hrv', at, 60 + i * 2, 'ms');

      const trend = await buildAthleteBiometricTrend({ athlete_id: fx.athleteId, on_date: NOW, client: sql });
      const hrv = trend.metrics.find((m) => m.key === 'hrv');
      expect(hrv?.points.map((p) => p.iso_date)).toEqual([
        '2030-12-13',
        '2031-03-09',
        '2031-03-10',
        '2031-03-11',
        '2031-03-12',
      ]);
    },
    DB_TIMEOUT,
  );

  // ── Carrera · historial ────────────────────────────────────────────────────

  test(
    'historial de carrera: una marca y la sesión en que la hizo son del mismo día suyo, y la fila sale como récord',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      await execution(fx, MON, 4, { modality: 'run', distance_meters: 1000, avg_pace_s_per_km: 240 });
      await sql`
        insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, source, run_context, recorded_at)
        values (${fx.athleteId}, 'run_1k', 240, 'seconds', 'athlete_test', 'outdoor', ${plusMinutes(MON, 10)}::timestamptz)
      `;

      const historial = await buildRunningHistorial({
        athlete_id: fx.athleteId,
        window: 'all',
        tipo: 'all',
        now: NOW,
        client: sql,
      });
      const rows = historial.weeks.flatMap((w) => w.rows);
      expect(rows.map((r) => ({ fecha: r.fecha, record: r.record }))).toEqual([{ fecha: '2031-03-10', record: true }]);
    },
    DB_TIMEOUT,
  );

  // ── Carrera · tendencias ───────────────────────────────────────────────────

  test(
    'tendencias de carrera: el VO₂máx de la ventana anterior se corta en SUS días, los mismos de su serie',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      // 4 semanas hasta NOW: la ventana empieza el miércoles 12 de febrero a las
      // 10:00 de Auckland (martes 11 en UTC); la anterior, el miércoles 15 de enero.
      await execution(fx, '2031-01-20T03:00:00Z', 10, { modality: 'run', distance_meters: 2000 });
      // Lecturas a las 15:00 de Auckland (02:00 UTC, mismo día en los dos): tres de
      // 50 bien dentro, y una de 60 el martes 11 de febrero — su último día de la
      // ventana anterior, y en UTC el día en que empieza la actual.
      for (const day of ['2031-01-20', '2031-01-27', '2031-02-03']) {
        await biometric(fx, 'vo2max', `${day}T02:00:00Z`, 50, 'ml/kg/min');
      }
      await biometric(fx, 'vo2max', '2031-02-11T02:00:00Z', 60, 'ml/kg/min');

      const result = await buildRunningTendencias({ athlete_id: fx.athleteId, window: '4w', now: NOW, client: sql });
      expect(result.prev.km).toBeCloseTo(2, 5);
      expect(result.prev.vo2max).toBe(52.5);
    },
    DB_TIMEOUT,
  );

  // ── lecturas («Mis analíticas») ────────────────────────────────────────────

  test(
    'lecturas: «desde que empezaste» es el día suyo de su primera sesión, y la ventana son sus días',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      await execution(fx, MON, 30, { modality: 'run', distance_meters: 6000 });

      const result = await buildAnaliticasAtleta({ athlete_id: fx.athleteId, now: NOW, client: sql });
      expect(result.historia.desde).toBe('2031-03-10');
      // `dias` días de su calendario que acaban en su hoy (`hasta`).
      expect(result.ventana.desde).toBe(
        isoDateString(addDays(parseIsoDate(result.ventana.hasta), -(result.ventana.dias - 1))),
      );
    },
    DB_TIMEOUT,
  );
});
