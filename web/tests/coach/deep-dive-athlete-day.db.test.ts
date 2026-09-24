/**
 * LA CARGA Y LA FICHA DEL COACH EN EL DÍA DEL ATLETA — contra base de datos REAL.
 *
 * La regla (docs/DECISIONS.md, 2026-09-23 «Qué día es en cada sitio»): lo que VIVE
 * el atleta — su carga, su racha, sus sesiones, sus lecturas — se fecha en SU
 * calendario (`athletes.timezone`). La base corre en UTC, así que `ts::date`,
 * `date_trunc('day', ts)` y `toISOString().slice(0, 10)` cortan por el día UTC.
 *
 * Los instantes (marzo de 2031; Madrid = UTC+1, Auckland = UTC+13, Los Ángeles =
 * UTC−7 desde el 9 de marzo):
 *   · LATE        2031-03-09T23:30Z = lunes 10, 00:30 en Madrid (domingo 9 en UTC).
 *   · MORNING     2031-03-10T07:00Z = lunes 10, 08:00 en Madrid.
 *   · NOW_MADRID  2031-03-10T08:00Z = lunes 10, 09:00 en Madrid.
 *   · NOW_AKL     2031-03-09T23:30Z = lunes 10, 12:30 en Auckland (domingo 9 en UTC).
 * Con el corte UTC, cada aserción de este fichero falla.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { getDailyTssSeries } from '@fahybrid/shared/domain/training-load';
import { buildAthleteDeepDive } from '@/lib/coach/athlete-deep-dive';
import { buildAthletePerformance } from '@/lib/dashboard/coach/deep-dive-performance';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeExercise,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

const DB_TIMEOUT = 30_000;
const MADRID = 'Europe/Madrid';
const AUCKLAND = 'Pacific/Auckland';

const LATE = '2031-03-09T23:30:00Z';
const MORNING = '2031-03-10T07:00:00Z';
const NOW_MADRID = new Date('2031-03-10T08:00:00Z');
const NOW_AKL = new Date('2031-03-09T23:30:00Z');

describeWithDb('carga y ficha del coach en el día del atleta (DB real)', () => {
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

  /** Una sesión sin RPE de `seconds` segundos que TERMINA en `endedAt` (el instante que la fecha). */
  async function session(fx: Fixture, endedAt: string, seconds = 1800): Promise<number> {
    const started = new Date(Date.parse(endedAt) - seconds * 1000).toISOString();
    const rows = await sql<Array<{ id: string }>>`
      insert into workout_executions (athlete_id, started_at, ended_at, total_duration_seconds, source)
      values (${fx.athleteId}, ${started}::timestamptz, ${endedAt}::timestamptz, ${seconds}, 'manual')
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  function coachDeepDive(fx: Fixture, now: Date) {
    return buildAthleteDeepDive({
      coach_id: fx.coachId,
      athlete_id: String(fx.athleteId),
      now,
      client: sql,
    });
  }

  // ── getDailyTssSeries ──────────────────────────────────────────────────────

  test(
    'serie de carga: la sesión de las 00:30 de Madrid es del lunes 10, y la serie acaba en ese lunes',
    async () => {
      const fx = await athleteIn(MADRID);
      await session(fx, LATE);

      const series = await getDailyTssSeries({
        athlete_id: fx.athleteId,
        end_date: NOW_MADRID,
        days: 7,
        client: sql,
      });
      const last = series.at(-1)!;
      expect(last.date).toBe('2031-03-10');
      // Sin RPE ni evidencia: su tiempo es desconocido, pero es DE ESE DÍA.
      expect(last.unknown_seconds).toBe(1800);
      expect(series.find((d) => d.date === '2031-03-09')?.unknown_seconds).toBe(0);
    },
    DB_TIMEOUT,
  );

  test(
    'serie de carga: acaba en el hoy del atleta (Auckland ya vive el lunes 10) y su sesión de primera hora entra',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      // Lunes 10, 08:00 en Auckland — domingo 9 en UTC.
      await session(fx, '2031-03-09T19:00:00Z');

      const series = await getDailyTssSeries({
        athlete_id: fx.athleteId,
        end_date: NOW_AKL,
        days: 3,
        client: sql,
      });
      expect(series.map((d) => d.date)).toEqual(['2031-03-08', '2031-03-09', '2031-03-10']);
      expect(series[2]!.unknown_seconds).toBe(1800);
      expect(series[1]!.unknown_seconds).toBe(0);
    },
    DB_TIMEOUT,
  );

  test(
    'serie de carga, al oeste de UTC: la sesión del domingo 9 por la noche en Los Ángeles es del 9, y su hoy aún es el 9',
    async () => {
      const fx = await athleteIn('America/Los_Angeles');
      // Domingo 9, 20:00 en Los Ángeles — lunes 10 en UTC.
      await session(fx, '2031-03-10T03:00:00Z');

      const series = await getDailyTssSeries({
        athlete_id: fx.athleteId,
        end_date: new Date('2031-03-10T04:00:00Z'),
        days: 2,
        client: sql,
        tz: 'America/Los_Angeles',
      });
      expect(series.map((d) => d.date)).toEqual(['2031-03-08', '2031-03-09']);
      expect(series[1]!.unknown_seconds).toBe(1800);
    },
    DB_TIMEOUT,
  );

  // ── Ficha del coach (deep dive) ────────────────────────────────────────────

  test(
    'ficha: las dos sesiones del lunes 10 de Madrid caen en «hoy», las dos por la mañana, y cuentan como doble',
    async () => {
      const fx = await athleteIn(MADRID);
      await session(fx, LATE);
      await session(fx, MORNING);

      const dd = await coachDeepDive(fx, NOW_MADRID);

      const today = dd.recent_days[0]!;
      expect(today.iso_date).toBe('2031-03-10');
      expect(today.label).toBe('hoy');
      expect(today.sessions.map((s) => s.slot)).toEqual(['AM', 'AM']);
      expect(dd.recent_days[1]!.sessions).toHaveLength(0);
      // Dos sesiones en SU mismo día: día doble (con el corte UTC, una y una).
      expect(dd.modality.twice_daily_days_label).not.toBeNull();
      // La curva de carga marca el hueco de las dos sesiones sin RPE en el lunes.
      const lastLoad = dd.trends.ctl_atl_tsb.at(-1)!;
      expect(lastLoad.iso_date).toBe('2031-03-10');
      expect(lastLoad.unknown_sessions).toBe(2);
    },
    DB_TIMEOUT,
  );

  test(
    'ficha: racha, serie de cumplimiento y VFC llegan hasta el lunes 10 del atleta en Auckland (UTC aún es domingo)',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      const templateId = await makeTemplate({ fx, name: 'Rodaje' });
      await makeAssignment({ fx, templateId, scheduledForIso: '2031-03-09', status: 'completed' });
      await makeAssignment({ fx, templateId, scheduledForIso: '2031-03-10', status: 'completed' });
      // VFC del lunes 10 a las 09:00 de Auckland (domingo 9 en UTC).
      await sql`
        insert into biometric_streams (athlete_id, source, metric_type, recorded_at, value_numeric, unit)
        values (${fx.athleteId}, 'healthkit', 'hrv', '2031-03-09T20:00:00Z'::timestamptz, 61, 'ms')
      `;

      const dd = await coachDeepDive(fx, NOW_AKL);

      // Su hoy (lunes 10) cuenta: dos días seguidos cumplidos.
      expect(dd.compliance.streak_days).toBe(2);
      expect(dd.trends.compliance.at(-1)).toEqual({ iso_date: '2031-03-10', state: 'completed' });
      expect(dd.trends.hrv.at(-1)).toEqual({ iso_date: '2031-03-10', value: 61 });
      expect(dd.trends.ctl_atl_tsb.at(-1)!.iso_date).toBe('2031-03-10');
    },
    DB_TIMEOUT,
  );

  test(
    'ficha: «última vez» de un ejercicio hecho a las 00:30 de Madrid es «hoy», no «ayer»',
    async () => {
      const fx = await athleteIn(MADRID);
      const exerciseId = await makeExercise({ fx, name: 'Carrera', category: 'cardio', modality: 'run' });
      const templateId = await makeTemplate({ fx, name: 'Series', format: 'intervals' });
      const [seg] = await sql<Array<{ id: string }>>`
        insert into template_segments (template_id, position, block_position, exercise_id, params_json)
        values (${templateId}, 0, 0, ${exerciseId}, ${sql.json({ distance_meters: 1000 })})
        returning id::text
      `;
      const executionId = await session(fx, LATE, 300);
      await sql`
        insert into segment_executions (
          execution_id, template_segment_id, position, started_at, ended_at, modality, distance_meters, source
        ) values (
          ${executionId}, ${Number(seg!.id)}, 0, '2031-03-09T23:25:00Z'::timestamptz,
          '2031-03-09T23:29:00Z'::timestamptz, 'run', 1000, 'manual'
        )
      `;

      const dd = await coachDeepDive(fx, NOW_MADRID);
      const running = dd.performance.groups.find((g) => g.key === 'running')!;
      expect(running.rows.map((r) => r.last_done_label)).toEqual(['hoy']);

      // La pestaña Rendimiento fecha el intento en el mismo lunes 10.
      const perf = await buildAthletePerformance({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        now: NOW_MADRID,
        client: sql,
      });
      expect(perf.exercises).toHaveLength(1);
      expect(perf.exercises[0]!.attempts.map((a) => a.iso_date)).toEqual(['2031-03-10']);
    },
    DB_TIMEOUT,
  );

  test(
    'rendimiento: la tendencia de disposición acaba en el hoy del atleta (Auckland, lunes 10)',
    async () => {
      const fx = await athleteIn(AUCKLAND);
      await session(fx, '2031-03-09T19:00:00Z');

      const perf = await buildAthletePerformance({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        now: NOW_AKL,
        client: sql,
      });
      expect(perf.race_readiness_history.at(-1)?.iso_date).toBe('2031-03-10');
    },
    DB_TIMEOUT,
  );
});
