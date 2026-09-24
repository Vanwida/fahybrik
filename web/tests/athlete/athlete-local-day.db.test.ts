/**
 * QUÉ DÍA ES PARA EL ATLETA — las superficies de su app, contra la base real.
 *
 * La regla (docs/DECISIONS.md, 2026-09-23 «Qué día es en cada sitio»): lo que VIVE
 * el atleta va en SU calendario (`athletes.timezone`); `BOX_TIMEZONE` solo cuando
 * no hay huso guardado o el guardado no se entiende. Cada caso usa un atleta lejos
 * de Madrid, en un instante en que su día y el de Madrid NO coinciden, y comprueba
 * el día que devuelve la superficie. Con el día del box, cada uno de estos casos
 * falla.
 *
 * El reloj: las superficies que preguntan «hoy» leen `new Date()`. Se congela SOLO
 * `Date` (`toFake: ['Date']`): los temporizadores y el driver de Postgres siguen en
 * tiempo real.
 *
 * Limpieza: cada fixture borra exactamente lo suyo (atleta, coach, usuarios y lo
 * que cuelga de ellos); la pareja y su usuario se borran a mano.
 */
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { isValidTimezone } from '@fahybrid/shared/domain/coach/coach-timezone';
import { buildAthleteWeekPlan } from '@/lib/athlete/week-plan';
import { buildAthleteHistoryMonth, type AthleteHistoryMonth } from '@/lib/athlete/history';
import { buildAthleteVo2Max } from '@/lib/athlete/vo2max';
import { buildPredictionReview } from '@/lib/athlete/prediction-review';
import {
  createFreeWorkout,
  saveFreeWorkoutPlan,
  updateFreeWorkoutPlan,
} from '@/lib/athlete/create-free-workout';
import { buildPartnerSnapshot } from '@/lib/athlete/partner-snapshot';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

const DB_TIMEOUT = 30_000;

// Lunes 21-sep-2026 05:00 UTC = lunes 07:00 en Madrid (CEST) y DOMINGO 20 a las
// 22:00 en Los Ángeles (PDT).
const LA_SUNDAY_NIGHT = '2026-09-21T05:00:00Z';
// Domingo 20-sep-2026 13:30 UTC = domingo 15:30 en Madrid y LUNES 21 a la 01:30 en
// Auckland (NZST, UTC+12: el horario de verano de Nueva Zelanda empieza el 27-sep).
const AUCKLAND_MONDAY_EARLY = '2026-09-20T13:30:00Z';

/** Typed prescription builder — contextual typing narrows the literal unions. */
const p = (pres: Prescription): Prescription => pres;

describeWithDb('el «hoy» de la app del atleta es el de su calendario (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    vi.useRealTimers();
    while (cleanups.length) await cleanups.pop()!();
  });

  afterAll(async () => {
    await closeTestSql();
  });

  /** Congela `Date` en `instant` mientras corre `fn`; nada más cambia de hora. */
  async function frozenAt<T>(instant: string, fn: () => Promise<T>): Promise<T> {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(instant) });
    try {
      return await fn();
    } finally {
      vi.useRealTimers();
    }
  }

  /** Coach + atleta con `athletes.timezone` = `tz` (null = sin huso guardado). */
  async function athleteIn(tz: string | null): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    await sql`update athletes set timezone = ${tz} where id = ${fx.athleteId}`;
    return fx;
  }

  /** Un segundo atleta del mismo coach, con su huso. Se borra a mano (con su pareja). */
  async function secondAthlete(fx: Fixture, tz: string | null): Promise<number> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await sql<{ id: string }[]>`
      insert into users (email, role) values (${'tz-partner-' + suffix + '@test.local'}, 'athlete')
      returning id::text
    `;
    const userId = Number(user[0]!.id);
    const athlete = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name, timezone)
      values (${userId}, ${fx.coachId}, 'Pareja Lejos', ${tz})
      returning id::text
    `;
    const athleteId = Number(athlete[0]!.id);
    cleanups.push(async () => {
      await sql`delete from doubles_pairs where athlete_a_id = ${athleteId} or athlete_b_id = ${athleteId}`;
      await sql`delete from workout_assignments where athlete_id = ${athleteId}`;
      await sql`delete from athletes where id = ${athleteId}`;
      await sql`delete from users where id = ${userId}`;
    });
    return athleteId;
  }

  async function assign(
    athleteId: number,
    templateId: number,
    iso: string,
    status: 'scheduled' | 'completed',
  ): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${athleteId}, ${iso}::date, ${templateId}, 1, ${status}::assignment_status)
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  async function insertExecution(
    athleteId: number,
    assignmentId: number,
    startedAt: string,
    durationS: number | null = null,
  ): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds)
      values (${assignmentId}, ${athleteId}, ${startedAt}::timestamptz, ${startedAt}::timestamptz, ${durationS})
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  /** Days with sessions → their assignment ids (rest days left out). */
  function sessionDays(month: AthleteHistoryMonth): Record<string, string[]> {
    return Object.fromEntries(
      month.days
        .filter((d) => d.sessions.length > 0)
        .map((d) => [d.date, d.sessions.map((s) => s.assignment_id)]),
    );
  }

  async function scheduledForOf(assignmentId: string): Promise<string> {
    const rows = await sql<{ d: string }[]>`
      select to_char(scheduled_for, 'YYYY-MM-DD') as d from workout_assignments where id = ${Number(assignmentId)}
    `;
    return rows[0]!.d;
  }

  // ── 1 · week-plan ───────────────────────────────────────────────────────────

  test(
    'semana: el «hoy» y el lunes son los del atleta (Los Ángeles y Auckland)',
    async () => {
      const la = await athleteIn('America/Los_Angeles');
      const tpl = await makeTemplate({ fx: la, name: 'Rodaje del domingo' });
      const sunday = await makeAssignment({ fx: la, templateId: tpl, scheduledForIso: '2026-09-20' });

      const laWeek = await frozenAt(LA_SUNDAY_NIGHT, () => buildAthleteWeekPlan(la.athleteId, 0));
      // En Madrid ya es lunes 21; en Los Ángeles sigue siendo el domingo 20 de SU semana.
      expect(laWeek.today_iso).toBe('2026-09-20');
      expect(laWeek.week_start).toBe('2026-09-14');
      expect(laWeek.week_end).toBe('2026-09-20');
      const laToday = laWeek.days.find((d) => d.iso_date === laWeek.today_iso)!;
      expect(laToday.sessions.map((s) => s.assignment_id)).toEqual([String(sunday)]);

      const akl = await athleteIn('Pacific/Auckland');
      const aklWeek = await frozenAt(AUCKLAND_MONDAY_EARLY, () => buildAthleteWeekPlan(akl.athleteId, 0));
      // En Madrid aún es domingo 20; en Auckland ya empezó el lunes 21, y su semana.
      expect(aklWeek.today_iso).toBe('2026-09-21');
      expect(aklWeek.week_start).toBe('2026-09-21');
      expect(aklWeek.week_end).toBe('2026-09-27');
    },
    DB_TIMEOUT,
  );

  test(
    'semana: sin huso, o con uno que no se entiende, cae al día del box sin romperse',
    async () => {
      for (const tz of [null, 'Mars/Olympus']) {
        const fx = await athleteIn(tz);
        const week = await frozenAt(LA_SUNDAY_NIGHT, () => buildAthleteWeekPlan(fx.athleteId, 0));
        expect(week.today_iso).toBe('2026-09-21'); // el lunes de Madrid
        expect(week.week_start).toBe('2026-09-21');
      }
    },
    DB_TIMEOUT,
  );

  // ── 2 · history ─────────────────────────────────────────────────────────────

  test(
    'historial: la sesión se pinta en el día del atleta y el mes se corta en su calendario',
    async () => {
      const la = await athleteIn('America/Los_Angeles');
      const laTpl = await makeTemplate({ fx: la, name: 'Series' });
      const laDone = await makeAssignment({
        fx: la,
        templateId: laTpl,
        scheduledForIso: '2026-04-30',
        status: 'completed',
      });
      // 03:30 UTC del 1-may = 20:30 del jueves 30-abr en Los Ángeles (05:30 del 1-may en Madrid).
      await insertExecution(la.athleteId, laDone, '2026-05-01T03:30:00Z');

      const laApril = await buildAthleteHistoryMonth(la.athleteId, '2026-04', sql);
      expect(sessionDays(laApril)).toEqual({ '2026-04-30': [String(laDone)] });
      const laMay = await buildAthleteHistoryMonth(la.athleteId, '2026-05', sql);
      expect(sessionDays(laMay)).toEqual({});

      const akl = await athleteIn('Pacific/Auckland');
      const aklTpl = await makeTemplate({ fx: akl, name: 'Fuerza' });
      const aklDone = await makeAssignment({
        fx: akl,
        templateId: aklTpl,
        scheduledForIso: '2026-06-01',
        status: 'completed',
      });
      // 13:00 UTC del 31-may = 01:00 del lunes 1-jun en Auckland (15:00 del 31-may en Madrid).
      await insertExecution(akl.athleteId, aklDone, '2026-05-31T13:00:00Z');

      const aklMay = await buildAthleteHistoryMonth(akl.athleteId, '2026-05', sql);
      expect(sessionDays(aklMay)).toEqual({});
      const aklJune = await buildAthleteHistoryMonth(akl.athleteId, '2026-06', sql);
      expect(sessionDays(aklJune)).toEqual({ '2026-06-01': [String(aklDone)] });
    },
    DB_TIMEOUT,
  );

  test(
    'historial: un huso que Intl o Postgres no conocen no tumba el mes; cae al día del box',
    async () => {
      // Las premisas del caso difícil: Intl acepta 'US/Pacific-New' (enlace
      // heredado) y Postgres no (tzdata lo quitó en 2020b). Validar solo en TS no
      // basta: sin la comprobación en SQL, `at time zone` lanzaría.
      expect(isValidTimezone('US/Pacific-New')).toBe(true);
      await expect(sql`select now() at time zone 'US/Pacific-New'`).rejects.toThrow();

      for (const tz of ['Mars/Olympus', 'US/Pacific-New']) {
        const fx = await athleteIn(tz);
        const tpl = await makeTemplate({ fx, name: 'Series' });
        const done = await makeAssignment({
          fx,
          templateId: tpl,
          scheduledForIso: '2026-05-01',
          status: 'completed',
        });
        // 03:30 UTC del 1-may = 05:30 del 1-may en Madrid.
        await insertExecution(fx.athleteId, done, '2026-05-01T03:30:00Z');

        const may = await buildAthleteHistoryMonth(fx.athleteId, '2026-05', sql);
        expect(sessionDays(may)).toEqual({ '2026-05-01': [String(done)] });
      }
    },
    DB_TIMEOUT,
  );

  // ── 3 · vo2max ──────────────────────────────────────────────────────────────

  test(
    'VO₂máx: la ventana de 90 días acaba en el día del atleta (Auckland), con y sin on_date',
    async () => {
      const akl = await athleteIn('Pacific/Auckland');
      const reading = (at: string, v: number) => sql`
        insert into biometric_streams (athlete_id, source, metric_type, recorded_at, value_numeric, unit)
        values (${akl.athleteId}, 'healthkit', 'vo2max', ${at}::timestamptz, ${v}, 'ml/kg/min')
      `;
      // Con el lunes 21 de Auckland la ventana empieza el 24-jun; con el domingo 20
      // de Madrid empezaba el 23-jun y se colaba esta lectura.
      // Las lecturas van a las 02:00 UTC (14:00 en Auckland) para que su día sea el
      // mismo en UTC y en su calendario: este test mira dónde ACABA la ventana. A
      // las 12:00 UTC caían en la medianoche de Auckland, que ya es el día
      // siguiente — en qué día cae una lectura lo prueba
      // tests/athlete/analytics-athlete-day.db.test.ts.
      await reading('2026-06-23T02:00:00Z', 40);
      const recent = ['2026-09-10', '2026-09-12', '2026-09-14', '2026-09-16'];
      for (const d of recent) await reading(`${d}T02:00:00Z`, 50);

      const now = await frozenAt(AUCKLAND_MONDAY_EARLY, () =>
        buildAthleteVo2Max({ athlete_id: akl.athleteId, client: sql }),
      );
      expect(now.series.map((pt) => pt.iso_date)).toEqual(recent);

      const onDate = await buildAthleteVo2Max({
        athlete_id: akl.athleteId,
        on_date: new Date(AUCKLAND_MONDAY_EARLY),
        client: sql,
      });
      expect(onDate.series.map((pt) => pt.iso_date)).toEqual(recent);
    },
    DB_TIMEOUT,
  );

  // ── 4 · prediction-review ───────────────────────────────────────────────────

  test(
    'predicho vs real: la sesión es del día del atleta, y cuenta la instantánea de ANTES',
    async () => {
      const la = await athleteIn('America/Los_Angeles');
      const tpl = await makeTemplate({ fx: la, name: 'Simulación HYROX', format: 'hyrox_sim' });
      const done = await makeAssignment({
        fx: la,
        templateId: tpl,
        scheduledForIso: '2026-09-20',
        status: 'completed',
      });
      // 03:00 UTC del 21-sep = 20:00 del domingo 20 en Los Ángeles (05:00 del lunes 21 en Madrid).
      const exec = await insertExecution(la.athleteId, done, '2026-09-21T03:00:00Z', 3900);
      await sql`
        insert into segment_executions (execution_id, position, started_at, ended_at, modality)
        values (${exec}, 0, '2026-09-21T03:00:00Z'::timestamptz, '2026-09-21T03:30:00Z'::timestamptz, 'run')
      `;
      // Dos instantáneas: la del sábado 19 (antes de la sesión) y la del domingo 20
      // (el MISMO día, en su calendario; en el de Madrid sería «el día antes»).
      for (const [day, total] of [
        ['2026-09-19', 4000],
        ['2026-09-20', 3500],
      ] as const) {
        await sql`
          insert into race_predictions (athlete_id, predicted_total_s, segments_json, model_version, pred_date)
          values (${la.athleteId}, ${total}, ${sql.json([{ slug: 'run', predicted_s: 1900 }])}, 'tz-test', ${day}::date)
        `;
      }

      const review = await buildPredictionReview({ athlete_id: la.athleteId, execution_id: exec }, sql);
      expect(review.availability).toBe('ok');
      expect(review.race_date).toBe('2026-09-20');
      expect(review.predicted_total_s).toBe(4000);
    },
    DB_TIMEOUT,
  );

  // ── 5 · create-free-workout ─────────────────────────────────────────────────

  test(
    'entreno libre: se archiva en el día del atleta, con hora de inicio y, sin ella, en su hoy',
    async () => {
      const la = await athleteIn('America/Los_Angeles');

      // Hecho a las 20:00 del domingo 20 en Los Ángeles (03:00 UTC del lunes 21).
      const done = await createFreeWorkout({
        athleteId: la.athleteId,
        coachId: la.coachId,
        title: 'AMRAP · 12:00',
        scheme: 'amrap',
        metrics: { started_at: '2026-09-21T03:00:00Z', perceived_exertion: 8, total_duration_seconds: 720 },
        kind: 'clock',
        prescription: p({ scheme: 'amrap', modality: 'functional', total_s: 720 }),
        sql,
      });
      expect(await scheduledForOf(done.assignment_id)).toBe('2026-09-20');

      // Guardado sin fecha el domingo a las 22:00 de Los Ángeles: su hoy, no el lunes de Madrid.
      const planned = await frozenAt(LA_SUNDAY_NIGHT, () =>
        saveFreeWorkoutPlan({
          athleteId: la.athleteId,
          coachId: la.coachId,
          title: 'EMOM 10',
          scheme: 'emom',
          kind: 'clock',
          prescription: p({ scheme: 'emom', modality: 'functional', rounds: 10, work_s: 45, rest_s: 15 }),
          sql,
        }),
      );
      expect(await scheduledForOf(planned.assignment_id)).toBe('2026-09-20');

      // Editado sin fecha el lunes a las 22:00 de Los Ángeles (martes 07:00 en Madrid).
      await frozenAt('2026-09-22T05:00:00Z', () =>
        updateFreeWorkoutPlan({
          assignmentId: Number(planned.assignment_id),
          athleteId: la.athleteId,
          coachId: la.coachId,
          title: 'EMOM 12',
          scheme: 'emom',
          kind: 'clock',
          prescription: p({ scheme: 'emom', modality: 'functional', rounds: 12, work_s: 45, rest_s: 15 }),
          sql,
        }),
      );
      expect(await scheduledForOf(planned.assignment_id)).toBe('2026-09-21');
    },
    DB_TIMEOUT,
  );

  // ── 6 · partner-snapshot ────────────────────────────────────────────────────

  test(
    '«Tu pareja»: hoy y esta semana son los del plan de la PAREJA, en su huso',
    async () => {
      const viewer = await athleteIn(null); // mira desde el día del box: lunes 21
      const partnerId = await secondAthlete(viewer, 'America/Los_Angeles');
      const [a, b] = [viewer.athleteId, partnerId].sort((x, y) => x - y);
      await sql`
        insert into doubles_pairs (coach_id, athlete_a_id, athlete_b_id, status)
        values (${viewer.coachId}, ${a!}, ${b!}, 'active')
      `;
      const tpl = await makeTemplate({ fx: viewer, name: 'Sesión de la pareja' });
      const saturday = await assign(partnerId, tpl, '2026-09-19', 'completed');
      const sunday = await assign(partnerId, tpl, '2026-09-20', 'scheduled');
      await assign(partnerId, tpl, '2026-09-21', 'scheduled');

      const snap = await frozenAt(LA_SUNDAY_NIGHT, () => buildPartnerSnapshot(viewer.athleteId, sql));
      expect(snap).not.toBeNull();
      // Su domingo 20: ni el lunes 21 del box ni el de quien mira.
      expect(snap!.today?.assignment_id).toBe(sunday);
      // Su semana del 14 al 20: el sábado hecho y el domingo por hacer.
      expect(snap!.week).toEqual({ completed: 1, total: 2 });
      expect(snap!.recent.map((r) => r.assignment_id)).toEqual([saturday]);
    },
    DB_TIMEOUT,
  );
});
