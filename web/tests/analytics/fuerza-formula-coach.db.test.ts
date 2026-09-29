/**
 * P18 (docs/analiticas/modelo.md): la mejor serie de un ejercicio se ordena por
 * el 1RM estimado con la fórmula DEL COACH (`coach_methodology.one_rm_estimation`,
 * la misma con la que se guardan sus tests de fuerza), no con Epley fijo.
 *
 * Las dos series están elegidas para que las dos fórmulas las ordenen al revés:
 *   100 × 12 → Epley 140,0 · Brzycki 144,0
 *   136 × 2  → Epley 145,1 · Brzycki 139,9
 * Con Epley ganaría 136 × 2; con la fórmula de este coach (Brzycki) gana 100 × 12.
 *
 * Base real (rama Neon desechable vía TEST_DATABASE_URL); se salta sin ella.
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildDrillDown, resolvePeriod } from '@/lib/athlete/analytics';
import { buildStrengthSection } from '@/lib/athlete/analytics/strength';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const period = resolvePeriod({ key: 'month', now: NOW });

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

describeWithDb('la mejor serie usa la fórmula de 1RM del coach (P18, base real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let sentadilla: number;

  async function sesion(daysAgo: number, reps: number, kg: number): Promise<void> {
    const tpl = await makeTemplate({ fx, name: `Fuerza ${daysAgo}`, format: 'circuit' });
    const asg = await makeAssignment({ fx, templateId: tpl, scheduledForIso: daysAgoIso(daysAgo).slice(0, 10), status: 'completed' });
    const at = daysAgoIso(daysAgo);
    const [exec] = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source)
      values (${asg}, ${fx.athleteId}, ${at}::timestamptz, ${at}::timestamptz, 'manual')
      returning id::text
    `;
    const [seg] = await sql<Array<{ id: string }>>`
      insert into segment_executions (execution_id, position, exercise_id, modality, context_format, context_source, source)
      values (${Number(exec!.id)}, 0, ${sentadilla}, 'strength', 'sets', 'block', 'manual')
      returning id::text
    `;
    await sql`
      insert into set_executions (segment_execution_id, set_index, reps_prescribed, reps_actual, load_prescribed_kg, load_actual_kg, status, confirmed)
      values (${Number(seg!.id)}, 1, ${reps}, ${reps}, ${kg}, ${kg}, 'done', true)
    `;
  }

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`insert into coach_methodology (coach_id, one_rm_estimation) values (${fx.coachId}, 'Brzycki')`;
    sentadilla = await makeExercise({ fx, name: 'Sentadilla trasera' });
    await sesion(5, 12, 100);
    await sesion(3, 2, 136);
  }, 60_000);

  afterAll(async () => {
    await sql`delete from coach_methodology where coach_id = ${fx.coachId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  test('la mejor serie del ejercicio sale de Brzycki (100 × 12), no de Epley (136 × 2)', async () => {
    const drill = await buildDrillDown(
      { athlete_id: fx.athleteId, kind: 'strength.exercise', params: { exercise_id: String(sentadilla) }, period },
      sql,
    );
    const mejor = drill?.sessions.find((s) => s.value_label === 'mejor');
    expect(mejor?.value).toBe('100 kg × 12');
  });

  test('la tarjeta de progresión nombra la fórmula del coach', async () => {
    const section = await buildStrengthSection({ athlete_id: fx.athleteId, period }, sql);
    const prog = section.cards.find((c) => c.id === 'lift_progression');
    expect(prog?.meaning_es).toContain('Brzycki');
    expect(prog?.meaning_es).not.toContain('Epley');
  });
});
