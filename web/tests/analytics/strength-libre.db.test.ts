// Las series de un tramo cuentan por su EJERCICIO aunque el tramo no lo lleve
// copiado: si está enlazado a su línea (`template_segment_id`), el ejercicio es el
// de esa línea. Un libre enlazado (DECISIONS 2026-09-28) entra en la progresión
// del levantamiento igual que una sesión del coach; un tramo sin nada sigue
// contando en el volumen, pero no puede entrar en la historia de un ejercicio.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildStrengthSection } from '@/lib/athlete/analytics/strength';
import { resolvePeriod } from '@/lib/athlete/analytics';
import type { AnalyticsCard } from '@/lib/athlete/analytics';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const period = resolvePeriod({ key: 'month', now: NOW });

function card(cards: AnalyticsCard[], id: string): AnalyticsCard {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`card ${id} not found`);
  return c;
}

describeWithDb('fuerza: el ejercicio sale del enlace del tramo (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const squat = await makeExercise({ fx, name: 'Sentadilla trasera' });
    const tpl = await makeTemplate({ fx, name: 'Fuerza libre', format: 'sets' });
    const ts = await sql<{ id: string }[]>`
      insert into template_segments (template_id, position, exercise_id, block_position)
      values (${tpl}, 0, ${squat}, 0)
      returning id::text
    `;

    /** Una ejecución con un tramo de fuerza (enlazado o no) y sus series. */
    async function session(daysAgo: number, origin: 'coach' | 'self', link: string | null, loads: number[]) {
      const day = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
      const asg = await sql<{ id: string }[]>`
        insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status, origin)
        values (${fx.athleteId}, ${day.slice(0, 10)}::date, ${tpl}, 1, 'completed', ${origin}::workout_origin)
        returning id::text
      `;
      const ex = await sql<{ id: string }[]>`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source)
        values (${asg[0]!.id}, ${fx.athleteId}, ${day}::timestamptz, ${day}::timestamptz, 'manual')
        returning id::text
      `;
      const seg = await sql<{ id: string }[]>`
        insert into segment_executions (execution_id, position, template_segment_id, modality)
        values (${ex[0]!.id}, 0, ${link}, 'strength')
        returning id::text
      `;
      for (const [i, kg] of loads.entries()) {
        await sql`
          insert into set_executions (segment_execution_id, set_index, reps_actual, load_actual_kg, status)
          values (${seg[0]!.id}, ${i + 1}, 5, ${kg}, 'done')
        `;
      }
    }

    // Sin `exercise_id` copiado en el tramo: solo el enlace a la línea.
    await session(10, 'self', ts[0]!.id, [100, 110]);
    await session(3, 'self', ts[0]!.id, [120]);
    // Sin enlace ninguno: cuenta en el volumen, no en un levantamiento.
    await session(2, 'self', null, [50]);
  }, 60_000);

  afterAll(async () => {
    await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  test('el libre enlazado entra en la progresión del ejercicio; el volumen lo cuenta todo', async () => {
    const section = await buildStrengthSection({ athlete_id: fx.athleteId, period }, sql);

    const prog = card(section.cards, 'lift_progression');
    expect(prog.availability).toBe('real');
    expect(prog.title_es.toLowerCase()).toContain('sentadilla trasera');
    expect(prog.series.length).toBe(2);

    const worked = card(section.cards, 'lifts_worked');
    expect(worked.rows.map((r) => r.label)).toEqual(['Sentadilla trasera']);

    // 5×100 + 5×110 + 5×120 + 5×50 = 1.900 kg → «1,9 t»; 3 sesiones.
    const vol = card(section.cards, 'strength_volume');
    expect(vol.rows.find((r) => r.id === 'total')?.value).toBe('1,9 t');
    expect(vol.rows.find((r) => r.id === 'sessions')?.value).toBe('3');
  });
});
