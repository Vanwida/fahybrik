/**
 * Real-DB test for athlete LIFECYCLE authorship (#43): pausing / dando de baja an
 * athlete records WHO did it — the athlete_pauses.created_by_* stamp (pause) /
 * athletes.last_edited_by_* stamp (baja) plus an audit_log row — atomically, and the
 * lifecycle detail read then surfaces the author name for the ficha banner.
 *
 * Real Neon branch (no mocks). Skipped when TEST_DATABASE_URL is unset. The lib funcs
 * under test use `@/lib/db` (DATABASE_URL); the seeds use the test client
 * (TEST_DATABASE_URL) — the runner points both at the same branch.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { pauseAthlete, bajaAthlete } from '@/lib/coach/athlete-lifecycle';
import { loadAthleteLifecycleDetail } from '@/lib/dashboard/coach/athlete-lifecycle-detail';
import { getMaxAthletes, setMaxAthletes } from '@/lib/coach/capacity';
import { funnelCoachId } from '@/lib/leads/funnel-coach';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('athlete lifecycle authorship (#43, real DB)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];
  let funnelCoach: bigint | null = null;
  let savedMax: number | null = null;

  /** A coach + athlete, with the coach user given a resolvable name (the author). */
  async function newAthleteWithNamedCoach(name: string): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await sql`update users set full_name = ${name} where id = ${fx.coachUserId}`;
    return fx;
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
    // Uncap the FUNNEL club (whose cap releaseWaitlistToCapacity reads) ⇒ the release
    // is a no-op (no email/lead side-effects). Restored in afterAll.
    funnelCoach = await funnelCoachId();
    if (funnelCoach !== null) {
      savedMax = await getMaxAthletes(funnelCoach);
      await setMaxAthletes(funnelCoach, null);
    }
  });

  afterEach(async () => {
    // audit_log has no FK to these entities, so it does NOT cascade — clean it by the
    // fixture's ids before the fixture drops the athlete (which cascades its pauses).
    for (const fx of fixtures.splice(0)) {
      const pauseIds = (
        await sql<{ id: string }[]>`select id::text as id from athlete_pauses where athlete_id = ${fx.athleteId}`
      ).map((r) => Number(r.id));
      if (pauseIds.length > 0) {
        await sql`delete from audit_log where entity_type = 'athlete_pauses' and entity_id in ${sql(pauseIds)}`;
      }
      await sql`delete from audit_log where entity_type = 'athletes' and entity_id = ${fx.athleteId}`;
      await fx.cleanup();
    }
  });

  afterAll(async () => {
    if (funnelCoach !== null) await setMaxAthletes(funnelCoach, savedMax);
    await closeTestSql();
  });

  test('pause stamps created_by on the pause + an audit row, and the read returns the author', async () => {
    const fx = await newAthleteWithNamedCoach('Pablo Gallardo');

    await pauseAthlete({
      athlete_id: BigInt(fx.athleteId),
      reason: 'lesion',
      requested_by: 'coach',
      coach_id: BigInt(fx.coachId),
      by_user_id: BigInt(fx.coachUserId),
    });

    // 1) The pause row carries the authorship stamp.
    const pause = await sql<{ id: string; by: string | null; kind: string | null }[]>`
      select id::text as id, created_by_user_id::text as by, created_by_kind::text as kind
      from athlete_pauses where athlete_id = ${fx.athleteId} order by id desc limit 1
    `;
    expect(BigInt(pause[0]!.by!)).toBe(BigInt(fx.coachUserId));
    expect(pause[0]!.kind).toBe('coach');

    // 2) An audit_log row points at THIS pause (create, coach).
    const audit = await sql<{ action: string; kind: string | null; by: string | null }[]>`
      select action::text as action, actor_kind::text as kind, actor_user_id::text as by
      from audit_log where entity_type = 'athlete_pauses' and entity_id = ${Number(pause[0]!.id)}
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe('create');
    expect(audit[0]!.kind).toBe('coach');
    expect(BigInt(audit[0]!.by!)).toBe(BigInt(fx.coachUserId));

    // 3) The lifecycle detail read surfaces the resolved author name for the banner.
    const detail = await loadAthleteLifecycleDetail({ athlete_id: fx.athleteId });
    expect(detail.status).toBe('pausado');
    expect(detail.paused_by_name).toBe('Pablo Gallardo');
    expect(detail.paused_by_kind).toBe('coach');
  });

  test('baja stamps baja_by on the athlete (NOT last_edited) + an audit row, and the read returns the author', async () => {
    const fx = await newAthleteWithNamedCoach('Pablo Gallardo');

    await bajaAthlete({
      athlete_id: BigInt(fx.athleteId),
      reason: 'otro',
      coach_id: BigInt(fx.coachId),
      by_user_id: BigInt(fx.coachUserId),
    });

    // 1) The athlete row carries the baja-author stamp in its OWN column — and the
    //    profile-edit slot (last_edited_by) is left untouched, so the ficha header's
    //    "editado por" does NOT light up on a baja.
    const ath = await sql<{ by: string | null; kind: string | null; edited: string | null }[]>`
      select baja_by_user_id::text as by, baja_by_kind::text as kind,
             last_edited_by_user_id::text as edited
      from athletes where id = ${fx.athleteId}
    `;
    expect(BigInt(ath[0]!.by!)).toBe(BigInt(fx.coachUserId));
    expect(ath[0]!.kind).toBe('coach');
    expect(ath[0]!.edited).toBeNull();

    // 2) An audit_log row records the baja (update on the athlete, coach).
    const audit = await sql<{ kind: string | null; by: string | null }[]>`
      select actor_kind::text as kind, actor_user_id::text as by
      from audit_log where entity_type = 'athletes' and entity_id = ${fx.athleteId} and action = 'update'
    `;
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0]!.kind).toBe('coach');
    expect(BigInt(audit[0]!.by!)).toBe(BigInt(fx.coachUserId));

    // 3) The lifecycle detail read surfaces the baja author for the banner.
    const detail = await loadAthleteLifecycleDetail({ athlete_id: fx.athleteId });
    expect(detail.status).toBe('baja');
    expect(detail.baja_by_name).toBe('Pablo Gallardo');
  });
});
