// UN LIBRE Y UNO DEL COACH CUENTAN Y SE VEN IGUAL (Alex, 28-sep).
//
// Siembra la MISMA sesión dos veces — una del plan del coach y un entreno libre
// del atleta (`origin = 'self'`) — con sus tramos enlazados a su línea como los
// deja el backfill de la otra sesión (`template_segment_id`, `exercise_id`), y
// comprueba que cada lector la trata igual:
//   · el detalle de sesión del coach (y del atleta): todo tramo casa con su línea
//     (ninguno «sin asociar»), las series llegan serie a serie y el veredicto de
//     carrera es el mismo;
//   · el historial del atleta: las dos filas, con la misma forma;
//   · el reparto semanal del deep dive: las dos sesiones cuentan;
//   · analíticas de fuerza: las dos entran en la historia del levantamiento.
// Lo único que cambia a propósito: la adherencia (el libre no es plan).

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, type Fixture } from '../utils/db-fixtures';
import { makeRunExecution, makeRunExercise, makeRunZoneProfile, makeTemplateSegment, type RunLap } from '../utils/run-fixtures';
import { loadCoachSessionDetail } from '@/lib/coach/session-detail';
import { buildAthleteHistoryMonth } from '@/lib/athlete/history';
import { buildAthleteDeepDive } from '@/lib/coach/athlete-deep-dive';
import { buildStrengthSection } from '@/lib/athlete/analytics/strength';
import { resolvePeriod } from '@/lib/athlete/analytics';

const NOW = new Date('2026-08-12T12:00:00Z');

describeWithDb('un libre y uno del coach se leen igual (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const ids: Record<'coach' | 'self', { assignment: number; execution: number }> = {
    coach: { assignment: 0, execution: 0 },
    self: { assignment: 0, execution: 0 },
  };

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = 'Europe/Madrid' where id = ${fx.athleteId}`;
    await makeRunZoneProfile(fx);
    const run = await makeRunExercise(fx);
    const squat = await makeExercise({ fx, name: 'Sentadilla', category: 'strength', modality: 'strength' });

    async function session(origin: 'coach' | 'self', day: string) {
      // La plantilla: del coach, o la instancia del atleta (la forma del libre).
      const tpl = await sql<{ id: string }[]>`
        insert into templates (coach_id, name, format, version, instance_athlete_id)
        values (${fx.coachId}, 'Series y fuerza', 'intervals'::template_format, 1,
                ${origin === 'self' ? fx.athleteId : null})
        returning id::text
      `;
      const templateId = Number(tpl[0]!.id);
      const runLine = await makeTemplateSegment({
        fx,
        templateId,
        exerciseId: run,
        position: 0,
        prescription: {
          scheme: 'intervals',
          modality: 'run',
          structure: [
            {
              role: 'main',
              elements: [
                {
                  times: 2,
                  elements: [
                    { kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace_zone', zone: 4 } },
                    { kind: 'recovery', measure: { type: 'duration', s: 90 }, target: null, recovery_mode: 'trote' },
                  ],
                },
              ],
            },
          ],
        },
      });
      const squatLine = await makeTemplateSegment({
        fx,
        templateId,
        exerciseId: squat,
        position: 1,
        prescription: {
          scheme: 'sets',
          modality: 'strength',
          sets: [
            { measure: { kind: 'reps', value: 5 }, target: { kind: 'kg', value: 100 } },
            { measure: { kind: 'reps', value: 5 }, target: { kind: 'kg', value: 110 } },
          ],
        },
      });
      const asg = await sql<{ id: string }[]>`
        insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status, origin)
        values (${fx.athleteId}, ${day}::date, ${templateId}, 1, 'scheduled', ${origin}::workout_origin)
        returning id::text
      `;
      const assignment = Number(asg[0]!.id);
      const laps: RunLap[] = [284, 266].flatMap((pace, i) => [
        { template_segment_id: runLine, duration_s: pace, distance_m: 1000, pace_s_per_km: pace, leg: { index: 2 * i, role: 'work', phase: 'main' } },
        { template_segment_id: runLine, duration_s: 95, distance_m: 230, leg: { index: 2 * i + 1, role: 'recovery', phase: 'main' } },
      ]);
      const execution = await makeRunExecution({ fx, assignmentId: assignment, startedAtIso: `${day}T06:00:00Z`, laps });
      // El tramo de fuerza, enlazado a su línea y con su ejercicio (lo que deja el backfill).
      const seg = await sql<{ id: string }[]>`
        insert into segment_executions (execution_id, position, template_segment_id, exercise_id, modality,
                                        started_at, ended_at)
        values (${execution}, 10, ${squatLine}, ${squat}, 'strength',
                ${`${day}T06:20:00Z`}::timestamptz, ${`${day}T06:35:00Z`}::timestamptz)
        returning id::text
      `;
      await sql`
        insert into set_executions (segment_execution_id, set_index, reps_prescribed, reps_actual,
                                    load_prescribed_kg, load_actual_kg, rpe, rir, status)
        values (${seg[0]!.id}, 1, 5, 5, 100, 100, 7, 3, 'done'),
               (${seg[0]!.id}, 2, 5, 5, 110, 110, 8, 2, 'done')
      `;
      ids[origin] = { assignment, execution };
    }

    await session('coach', '2026-08-10');
    await session('self', '2026-08-11');
  }, 90_000);

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('detalle de sesión: todo casa con su línea, series serie a serie, mismo veredicto', async () => {
    const details = await Promise.all(
      (['coach', 'self'] as const).map((o) =>
        loadCoachSessionDetail({ sql, coach_id: fx.coachId, athlete_id: fx.athleteId, assignment_id: ids[o].assignment }),
      ),
    );
    const [coach, libre] = details.map((d) => {
      if (!d.ok) throw new Error('detalle no encontrado');
      return d.session;
    });
    expect(coach!.origin).toBe('coach');
    expect(libre!.origin).toBe('self');

    for (const s of [coach!, libre!]) {
      const uids = new Set(s.workout!.blocks.flatMap((b) => b.items.map((i) => i.uid)));
      // Ningún tramo «Registrado sin asociar a una línea».
      expect(s.segment_actuals.every((a) => a.item_uid != null && uids.has(a.item_uid))).toBe(true);
      const strength = s.segment_actuals.find((a) => a.modality === 'strength')!;
      expect(strength.sets.map((x) => [x.reps, x.kg, x.rpe, x.rir])).toEqual([
        [5, 100, 7, 3],
        [5, 110, 8, 2],
      ]);
      expect(strength.volume_kg).toBe(1050);
    }
    // El mismo veredicto de carrera (los ids de línea difieren; los números no).
    expect(libre!.run_compliance.summary).toEqual(coach!.run_compliance.summary);
    expect(libre!.run_compliance.summary.total).toBeGreaterThan(0);
    expect(libre!.run_compliance.tramos.map((t) => t.verdict)).toEqual(coach!.run_compliance.tramos.map((t) => t.verdict));
  });

  test('historial: las dos filas, con la misma forma', async () => {
    const month = await buildAthleteHistoryMonth(fx.athleteId, '2026-08', sql);
    const rows = month.days.flatMap((d) => d.sessions);
    const coach = rows.find((r) => r.execution_id === String(ids.coach.execution))!;
    const libre = rows.find((r) => r.execution_id === String(ids.self.execution))!;
    expect(coach).toBeDefined();
    expect(libre).toBeDefined();
    const shape = ({ title, modality, total_duration_seconds, distance_m }: typeof coach) => ({
      title,
      modality,
      total_duration_seconds,
      distance_m,
    });
    expect(shape(libre)).toEqual(shape(coach));
    expect([coach.origin, libre.origin]).toEqual(['coach', 'self']);
  });

  test('deep dive: las dos sesiones cuentan en el reparto de la semana', async () => {
    const dd = await buildAthleteDeepDive({ coach_id: fx.coachId, athlete_id: String(fx.athleteId), now: NOW, client: sql });
    const by = new Map(dd.modality.rows.map((r) => [r.key, r]));
    // 2 × (1000 + 230 + 1000 + 230) m de carrera; 2 × 1050 kg de sentadilla.
    expect(by.get('running')!.km).toBe(4.9);
    expect(by.get('strength')!.kg).toBe(2100);
    expect(dd.modality.rows.reduce((n, r) => n + r.pct, 0)).toBe(100);
  });

  test('fuerza: las dos sesiones entran en la historia del levantamiento', async () => {
    const period = resolvePeriod({ key: 'month', now: NOW });
    const section = await buildStrengthSection({ athlete_id: fx.athleteId, period }, sql);
    const worked = section.cards.find((c) => c.id === 'lifts_worked')!;
    expect(worked.rows.map((r) => r.label)).toEqual(['Sentadilla']);
    const vol = section.cards.find((c) => c.id === 'strength_volume')!;
    expect(vol.rows.find((r) => r.id === 'sessions')?.value).toBe('2');
  });
});
