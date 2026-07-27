// Las bajas se clavan a la suscripción CONCRETA (obra 0 multi-coach), nunca un
// barrido user_id+status: subscriptions no lleva club hasta la obra 4, así que
// un update por user_id cancelaría de golpe las suscripciones de TODOS los
// clubes del humano. Aquí: con dos subs activas, la baja marca UNA (la más
// reciente — la que resuelve getSubscriptionByUserId) y la otra queda intacta.
//
// DB real (Neon branch). Se salta con aviso cuando no hay TEST_DATABASE_URL.

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { bajaAthlete } from '@/lib/coach/athlete-lifecycle';
import { scheduleBajaSelf, cancelScheduledBaja } from '@/lib/athlete/lifecycle-self-service';
import { funnelCoachId } from '@/lib/leads/funnel-coach';
import { getMaxAthletes, setMaxAthletes } from '@/lib/coach/capacity';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('bajas — la suscripción concreta, no user_id+status (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];
  let funnelCoach: bigint | null = null;
  let savedMax: number | null = null;

  async function seedSub(fx: Fixture, daysAgoCreated: number, periodEndDays: number | null) {
    const rows = await sql<{ id: string }[]>`
      insert into subscriptions (user_id, plan_type, status, created_at, current_period_end)
      values (
        ${fx.athleteUserId}, 'individual', 'active',
        now() - make_interval(days => ${daysAgoCreated}),
        ${periodEndDays === null ? null : sql`now() + make_interval(days => ${periodEndDays})`}
      )
      returning id::text as id
    `;
    return Number(rows[0]!.id);
  }

  async function cancelFlags(ids: number[]): Promise<Map<number, boolean>> {
    const rows = await sql<{ id: string; cancel_at_period_end: boolean }[]>`
      select id::text as id, cancel_at_period_end from subscriptions where id in ${sql(ids)}
    `;
    return new Map(rows.map((r) => [Number(r.id), r.cancel_at_period_end]));
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
    // Neutraliza el release del waitlist que dispara bajaAthlete (club del funnel).
    funnelCoach = await funnelCoachId();
    if (funnelCoach !== null) {
      savedMax = await getMaxAthletes(funnelCoach);
      await setMaxAthletes(funnelCoach, null);
    }
  });

  afterEach(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
  });

  afterAll(async () => {
    if (funnelCoach !== null) await setMaxAthletes(funnelCoach, savedMax);
    await closeTestSql();
  });

  test('bajaAthlete (coach): marca SOLO la sub activa más reciente del atleta', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const oldSub = await seedSub(fx, 30, null);
    const newSub = await seedSub(fx, 1, null);

    await bajaAthlete({ athlete_id: BigInt(fx.athleteId), reason: 'otro', coach_id: BigInt(fx.coachId) });

    const flags = await cancelFlags([oldSub, newSub]);
    expect(flags.get(newSub)).toBe(true); // la concreta
    expect(flags.get(oldSub)).toBe(false); // jamás el barrido
  });

  test('scheduleBajaSelf + undo: marca y desmarca la MISMA sub concreta', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const oldSub = await seedSub(fx, 30, null);
    // La relevante: activa, con periodo pagado por delante (runway) y más reciente.
    const runwaySub = await seedSub(fx, 1, 20);

    const res = await scheduleBajaSelf({
      athlete_id: BigInt(fx.athleteId),
      user_id: BigInt(fx.athleteUserId),
      reason: 'otro',
    });
    expect(res.applied_now).toBe(false); // programada al fin del periodo

    let flags = await cancelFlags([oldSub, runwaySub]);
    expect(flags.get(runwaySub)).toBe(true);
    expect(flags.get(oldSub)).toBe(false);

    await cancelScheduledBaja({ athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId) });
    flags = await cancelFlags([oldSub, runwaySub]);
    expect(flags.get(runwaySub)).toBe(false); // la misma, desmarcada
    expect(flags.get(oldSub)).toBe(false); // intacta en todo el ciclo
  });
});
