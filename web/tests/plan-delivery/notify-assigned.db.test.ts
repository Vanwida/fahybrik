// «Tu plan está listo» tras asignar: solo si el atleta YA ve alguna semana de lo
// asignado. Un programa que empieza dentro de semanas se abre N días antes y
// avisa entonces el cron; avisar hoy era mandarle a una pantalla vacía.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeClub, mondayPlus, type Club } from './fixtures';
import { boxToday } from '@/lib/coach/week-publishing';
import { firstVisibleWeek, notifyPlanAssignedIfVisible } from '@/lib/notifications/plan-published';
import { opensText } from '@/lib/mcp/shape-write';

describeWithDb('aviso de plan asignado (DB real)', () => {
  const sql = getTestSql();
  let club: Club;
  const w1 = mondayPlus(boxToday(), 3);
  const w2 = mondayPlus(boxToday(), 4);

  beforeAll(async () => {
    club = await makeClub(sql, 1);
  });
  afterAll(async () => {
    await club.cleanup();
    await closeTestSql();
  });

  const notifications = async () => {
    const rows = await sql<Array<{ n: number }>>`
      select count(*)::int as n from notifications n
      join athletes a on a.user_id = n.user_id
      where a.id = ${club.athleteIds[0]!} and n.type = 'plan_published'
    `;
    return rows[0]!.n;
  };

  test('todas las semanas en borrador → sin aviso', async () => {
    const a = club.athleteIds[0]!;
    await sql`insert into weekly_plans (athlete_id, week_start, status, delivery_mode)
              values (${a}, ${w1}, 'draft', 'scheduled'), (${a}, ${w2}, 'draft', 'scheduled')`;
    expect(await firstVisibleWeek(sql, a, w1, 2)).toBeNull();
    expect(await notifyPlanAssignedIfVisible({ sql, athlete_id: a, start_date: w1, week_count: 2 })).toBeNull();
    expect(await notifications()).toBe(0);
  });

  test('una semana visible → aviso con ESA semana', async () => {
    const a = club.athleteIds[0]!;
    await sql`update weekly_plans set status = 'published' where athlete_id = ${a} and week_start = ${w2}`;
    expect(await notifyPlanAssignedIfVisible({ sql, athlete_id: a, start_date: w1, week_count: 2 })).toBe(w2);
    expect(await notifications()).toBe(1);
  });

  test('el conector dice cuándo se abre sola, con la regla del coach', () => {
    expect(opensText({ days_before: 2, on: '2026-09-26' })).toBe('esa semana se le abre sola 2 días antes (el 26 sept)');
    expect(opensText({ days_before: 1, on: '2026-09-27' })).toBe('esa semana se le abre sola 1 día antes (el 27 sept)');
    expect(opensText(null)).toBe('esa semana se le abre sola unos días antes de empezar');
  });
});
