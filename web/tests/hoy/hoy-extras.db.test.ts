// Lo de alrededor de la bandeja de Hoy (`loadHoyExtras`), contra una base REAL:
// quiénes son los atletas de un grupo (y solo los del coach), qué se marcó hecho
// hoy (y que «Reabrir» —el deshacer con `previous: null`— lo saca), la línea de
// actividad y los días de publicación automática.

import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Sql } from '@/lib/db';
import { applyOverrides, restoreOverrides } from '@/lib/coach/attention/overrides';
import { loadHoyExtras, loadHoyPeople, loadResolvedToday } from '@/app/[locale]/(v2)/hoy/_data/hoy-extras';
import { reopenPayload } from '@/components/v2/hoy/hoy-model';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

async function addAthlete(sql: Sql, coachId: number, name: string, onboardedDaysAgo: number): Promise<{ id: number; userId: number }> {
  const u = await sql<Array<{ id: string }>>`
    insert into users (email, role)
    values (${`${name.toLowerCase()}-${Date.now()}-${Math.random()}@test.local`}, 'athlete')
    returning id::text
  `;
  const a = await sql<Array<{ id: string }>>`
    insert into athletes (user_id, coach_id, full_name, onboarded_at)
    values (${Number(u[0]!.id)}, ${coachId}, ${name}, now() - make_interval(days => ${onboardedDaysAgo}))
    returning id::text
  `;
  return { id: Number(a[0]!.id), userId: Number(u[0]!.id) };
}

describeWithDb('Hoy · lo de alrededor de la bandeja', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let other: Fixture;
  const ids = { ana: 0, bea: 0 };
  const users: number[] = [];

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    other = await makeCoachAndAthlete(sql);
    const ana = await addAthlete(sql, fx.coachId, 'Ana Hoy', 2);
    const bea = await addAthlete(sql, fx.coachId, 'Bea Hoy', 5);
    ids.ana = ana.id;
    ids.bea = bea.id;
    users.push(ana.userId, bea.userId);
  });

  afterAll(async () => {
    const all = [ids.ana, ids.bea];
    await sql`delete from coach_alert_overrides where athlete_id = any(${all}::bigint[])`;
    await sql`delete from athletes where id = any(${all}::bigint[])`;
    await sql`delete from users where id = any(${users}::bigint[])`;
    await fx.cleanup();
    await other.cleanup();
    await closeTestSql();
  });

  it('people: nombre, alta y solo atletas del coach (uno ajeno no se cuela)', async () => {
    const people = await loadHoyPeople({
      coach_id: fx.coachId,
      athlete_ids: [String(ids.bea), String(ids.ana), String(other.athleteId), 'x'],
      client: sql,
    });
    expect(people.map((p) => p.name)).toEqual(['Ana Hoy', 'Bea Hoy']);
    expect(people.every((p) => p.onboarded_at != null)).toBe(true);
    expect(await loadHoyPeople({ coach_id: fx.coachId, athlete_ids: [], client: sql })).toEqual([]);
  });

  it('resuelto hoy: lo que el coach marcó hecho, y Reabrir lo devuelve a la bandeja', async () => {
    expect(await loadResolvedToday({ coach_id: fx.coachId, client: sql })).toEqual([]);

    await applyOverrides({
      coach_id: fx.coachId,
      targets: [
        { athlete_id: String(ids.ana), signal_kind: 'readiness_low' },
        { athlete_id: String(ids.ana), signal_kind: 'missed_sessions' },
      ],
      action: 'done',
      client: sql,
    });
    // Posponer no es «resuelto».
    await applyOverrides({
      coach_id: fx.coachId,
      targets: [{ athlete_id: String(ids.bea), signal_kind: 'rpe_high' }],
      action: 'snooze',
      until: '1d',
      client: sql,
    });

    const resolved = await loadResolvedToday({ coach_id: fx.coachId, client: sql });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.name).toBe('Ana Hoy');
    expect([...resolved[0]!.kinds].sort()).toEqual(['missed_sessions', 'readiness_low']);
    // Otro coach no ve nada de esto.
    expect(await loadResolvedToday({ coach_id: other.coachId, client: sql })).toEqual([]);

    // Reabrir desde el pie = el deshacer de la API con `previous: null`.
    const payload = reopenPayload(resolved[0]!.kinds.map((k) => ({ athlete_id: resolved[0]!.athlete_id, signal_kind: k })));
    await restoreOverrides({ coach_id: fx.coachId, restore: payload.restore, client: sql });
    expect(await loadResolvedToday({ coach_id: fx.coachId, client: sql })).toEqual([]);
    const left = await sql<Array<{ n: number }>>`
      select count(*)::int as n from coach_alert_overrides where athlete_id = ${ids.ana}
    `;
    expect(left[0]!.n).toBe(0);
  });

  it('extras: actividad de hoy y días de publicación (defecto y dato del coach)', async () => {
    const base = await loadHoyExtras({ coach_id: fx.coachId, athlete_ids: [String(ids.ana)], client: sql });
    expect(base.people).toHaveLength(1);
    expect(base.activity_today).toBe(0);
    expect(base.auto_publish_days).toBe(2);

    await sql`update coaches set auto_publish_days_before = 4 where id = ${fx.coachId}`;
    const custom = await loadHoyExtras({ coach_id: fx.coachId, athlete_ids: [], client: sql });
    expect(custom.auto_publish_days).toBe(4);
  });
});
