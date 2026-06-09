// Unit tests for the RGPD export helper.
//
// We stub the postgres tag (no Neon connection) and assert:
//   - The aggregator returns the canonical shape (all top-level keys present).
//   - All queries are scoped by the athlete_id we pass (no global SELECTs).
//   - Partner block is present iff users.partner_id is populated.
//   - Empty downstream tables yield empty arrays, not nulls.

import { describe, expect, it } from 'vitest';
import { exportAthleteData } from '@/lib/athlete/data-export';
import type { Sql } from '@/lib/db';

type Call = { raw: string; values: unknown[] };

function makeFakeSql(scripted: Array<unknown[]>): { sql: Sql; calls: Call[] } {
  const calls: Call[] = [];
  let cursor = 0;
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const raw = strings.join('?');
    calls.push({ raw, values });
    const next = scripted[cursor++] ?? [];
    return Promise.resolve(next);
  };
  return { sql: tag as unknown as Sql, calls };
}

// Order MUST match the helper's query ISSUE order. After head/subs/partner the
// independent datasets are issued together in one Promise.all (M4), then chat
// messages are fetched last (they depend on chat_threads):
//   1. athletes+users (head)
//   2. subscriptions (if userId)
//   3. partner (if partner_id)
//   --- Promise.all (in array-literal order) ---
//   4. workouts_planned
//   5. workouts_executed
//   6. race_plans
//   7. race_results
//   8. race_debriefs
//   9. biometric_streams
//  10. daily_checkins
//  11. weekly_plans
//  12. chat_threads
//  13. notifications (if userId — else a resolved [] with no sql call)
//  14. athlete_target_events
//  15. athlete_readiness_snapshots
//  16. athlete_benchmarks
//   --- after the Promise.all resolves ---
//  17. chat_messages (if threads > 0)
function buildHappyPath() {
  return [
    [
      {
        athlete_id: '42',
        user_id: '7',
        coach_id: '1',
        full_name: 'Pablo Test',
        dob: '1990-01-01',
        sex: 'M',
        height_cm: 180,
        weight_kg: 80,
        body_fat_pct: 10,
        training_experience_years: 8,
        primary_discipline: 'hyrox',
        training_days_per_week: 6,
        equipment_access: 'full_gym',
        injuries_json: [],
        intake_completed_at: '2026-01-01T00:00:00Z',
        intake_notes_json: { ok: true },
        onboarded_at: '2026-01-01T00:00:00Z',
        athlete_created_at: '2026-01-01T00:00:00Z',
        athlete_updated_at: '2026-01-01T00:00:00Z',
        email: 'pablo@test.com',
        role: 'athlete',
        partner_id: '9',
        box_member: true,
        idioma: 'es',
        box_class_schedule: { days: [{ day_of_week: 2, type: 'strength' }] },
        user_created_at: '2026-01-01T00:00:00Z',
        user_updated_at: '2026-01-01T00:00:00Z',
        last_seen_at: '2026-05-26T00:00:00Z',
        deleted_at: null,
      },
    ],
    [{ id: 'sub-1', plan_type: 'dobles', status: 'active', current_period_end: null, cancel_at_period_end: false, partner_user_id: '9', created_at: '2026-01-01T00:00:00Z' }],
    [{ id: '9', full_name: 'Partner Test' }],
    [{ id: 'w1' }], // workouts_planned
    [{ id: 'we1' }], // workouts_executed
    [], // race_plans
    [], // race_results
    [], // race_debriefs
    [{ id: 'bm1' }], // biometric_streams
    [{ id: 'ck1' }], // daily_checkins
    [{ id: 'wp1' }], // weekly_plans
    [{ id: 'thread-1', coach_id: '1', last_message_at: null, created_at: '2026-01-01T00:00:00Z' }], // chat_threads
    [{ id: 'n1' }], // notifications
    [], // athlete_target_events
    [{ id: 'rs1' }], // athlete_readiness_snapshots
    [{ id: 'bench1' }], // athlete_benchmarks
    // chat_messages: one from the athlete's own user (7), one from the coach (1).
    [
      { id: 'msg-1', thread_id: 'thread-1', sender_user_id: '7', body: 'hi coach', created_at: '2026-01-01T00:00:00Z' },
      { id: 'msg-2', thread_id: 'thread-1', sender_user_id: '1', body: 'hi athlete', created_at: '2026-01-01T00:01:00Z' },
    ],
  ];
}

describe('exportAthleteData', () => {
  it('returns the canonical export shape with all top-level keys', async () => {
    const { sql } = makeFakeSql(buildHappyPath());
    const data = await exportAthleteData({ sql, athlete_id: BigInt(42) });

    expect(data).toHaveProperty('exported_at');
    expect(data.user).not.toBeNull();
    expect(data.user?.id).toBe('7');
    expect(data.athlete?.id).toBe('42');
    expect(data.subscription?.id).toBe('sub-1');
    expect(data.partner?.id).toBe('9');
    expect(data.workouts_planned.length).toBe(1);
    expect(data.workouts_executed.length).toBe(1);
    expect(data.biometric_streams.length).toBe(1);
    expect(data.chat_threads.length).toBe(1);
    expect(data.chat_messages.length).toBe(2);
    expect(data.notifications.length).toBe(1);
    expect(data.athlete_readiness_snapshots.length).toBe(1);
  });

  it('redacts the coach user_id from chat messages (M5 — no third-party PII)', async () => {
    const { sql } = makeFakeSql(buildHappyPath());
    const data = await exportAthleteData({ sql, athlete_id: BigInt(42) });

    // No message may leak a raw sender_user_id (the coach is a third party).
    for (const msg of data.chat_messages) {
      expect(msg).not.toHaveProperty('sender_user_id');
      expect(msg).toHaveProperty('sender_role');
    }
    // The athlete's own message (user 7) is tagged 'athlete'; the coach's
    // (user 1) is 'coach'.
    const own = data.chat_messages.find((m) => m['id'] === 'msg-1');
    const fromCoach = data.chat_messages.find((m) => m['id'] === 'msg-2');
    expect(own?.['sender_role']).toBe('athlete');
    expect(fromCoach?.['sender_role']).toBe('coach');
  });

  it('returns nulls for user/athlete when athlete row is missing', async () => {
    // Head row empty → helper still completes (most downstream queries
    // simply return empty arrays).
    const scripted = buildHappyPath();
    scripted[0] = []; // no athlete row
    const { sql } = makeFakeSql(scripted);
    const data = await exportAthleteData({ sql, athlete_id: BigInt(999) });
    expect(data.user).toBeNull();
    expect(data.athlete).toBeNull();
    // No userId → subscriptions/notifications skipped (helper short-circuits).
    expect(data.subscription).toBeNull();
    expect(data.notifications).toEqual([]);
  });

  it('omits partner block when user has no partner_id', async () => {
    const scripted = buildHappyPath();
    const head = scripted[0]![0] as Record<string, unknown>;
    head['partner_id'] = null;
    // Now the partner SELECT is skipped, shifting the script. Re-create
    // without partner row at position 2.
    scripted.splice(2, 1);
    const { sql } = makeFakeSql(scripted);
    const data = await exportAthleteData({ sql, athlete_id: BigInt(42) });
    expect(data.partner).toBeNull();
  });

  it('scopes every assignment query by athlete_id (no global SELECTs)', async () => {
    const { sql, calls } = makeFakeSql(buildHappyPath());
    await exportAthleteData({ sql, athlete_id: BigInt(42) });

    // Inspect: every query that touches athlete-owned rows must include 42
    // in the bound values. The few queries that don't (head, partner) are
    // identified by their `from` clause.
    const athleteScoped = calls.filter((c) =>
      /workout_assignments|workout_executions|race_plans|race_results|race_debriefs|biometric_streams|daily_checkins|weekly_plans|chat_threads|athlete_target_events|athlete_daily_readiness_snapshots|athlete_benchmarks/i.test(
        c.raw,
      ),
    );
    expect(athleteScoped.length).toBeGreaterThan(0);
    // Helper casts via `as unknown as number` for sql interpolation, but
    // postgres-js receives the original bigint value at runtime. Accept
    // either form.
    for (const c of athleteScoped) {
      const hit =
        c.values.includes(42) || c.values.includes(BigInt(42)) || c.values.some(
          (v) => typeof v === 'bigint' && v === BigInt(42),
        );
      expect(hit).toBe(true);
    }
  });
});
