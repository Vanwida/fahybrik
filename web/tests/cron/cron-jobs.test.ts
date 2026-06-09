// Unit tests for the phase-1c operational crons (pure logic only).
//
// - weekly-evaluation: iterates active athletes, proposes only when the
//   verdict is not 'ok', best-effort per athlete.
// - publish-weekly-plans: publishes next-Monday drafts + notifies athletes.
// - expire-invitations: expires pending invitations past expires_at.
//
// All three take an injected `client`, so we drive them with a fake tagged-
// template sql that records queries and returns scripted rows. The coach/AI
// + notification collaborators are mocked at module level.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// --- module mocks (hoisted by vitest) -------------------------------------
const evaluateAthleteWeek = vi.fn();
const proposeWeekAdjustment = vi.fn();
const notifyAthlete = vi.fn();

vi.mock('@/lib/coach/weekly-evaluation', () => ({
  evaluateAthleteWeek: (...args: unknown[]) => evaluateAthleteWeek(...args),
}));
vi.mock('@/lib/coach/ai-propose-week-adjustment', () => ({
  proposeWeekAdjustment: (...args: unknown[]) => proposeWeekAdjustment(...args),
}));
vi.mock('@/lib/notifications/dispatch', () => ({
  notifyAthlete: (...args: unknown[]) => notifyAthlete(...args),
}));

import type { Sql } from '@/lib/db';
import { loadActiveAthletes, runWeeklyEvaluation } from '@/lib/cron/weekly-evaluation';
import { runPublishWeeklyPlans, nextMondayIso } from '@/lib/cron/publish-weekly-plans';
import { runExpireInvitations } from '@/lib/cron/expire-invitations';

type Call = { raw: string; values: unknown[] };

function makeFakeSql(scripted: Array<unknown[]>): { sql: Sql; calls: Call[] } {
  const calls: Call[] = [];
  let cursor = 0;
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    calls.push({ raw: strings.join('?'), values });
    return Promise.resolve(scripted[cursor++] ?? []);
  };
  return { sql: tag as unknown as Sql, calls };
}

beforeEach(() => {
  evaluateAthleteWeek.mockReset();
  proposeWeekAdjustment.mockReset();
  notifyAthlete.mockReset();
  // Safe defaults so an unintended call never produces a floating rejection.
  notifyAthlete.mockResolvedValue({ id: 'n0' });
  proposeWeekAdjustment.mockResolvedValue({ id: 'p0' });
});

// ---------------------------------------------------------------------------
// weekly-evaluation
// ---------------------------------------------------------------------------

describe('weekly-evaluation cron', () => {
  it('loadActiveAthletes queries month assignments covering today', async () => {
    const { sql, calls } = makeFakeSql([[{ athlete_id: '1', coach_id: '9' }]]);
    const rows = await loadActiveAthletes({ client: sql, now: new Date('2026-05-26T00:00:00Z') });
    expect(rows).toEqual([{ athlete_id: '1', coach_id: '9' }]);
    expect(calls[0]!.raw).toMatch(/athlete_month_assignments/i);
    expect(calls[0]!.raw).toMatch(/start_date <=/);
    expect(calls[0]!.raw).toMatch(/end_date >=/);
  });

  it('proposes only when verdict !== ok', async () => {
    const { sql } = makeFakeSql([
      [
        { athlete_id: '1', coach_id: '9' },
        { athlete_id: '2', coach_id: '9' },
      ],
    ]);
    evaluateAthleteWeek
      .mockResolvedValueOnce({ verdict: 'needs_adjustment' })
      .mockResolvedValueOnce({ verdict: 'ok' });

    const result = await runWeeklyEvaluation({ client: sql, now: new Date('2026-05-26T09:00:00Z') });

    expect(result.evaluated).toBe(2);
    expect(result.proposals_created).toBe(1);
    expect(proposeWeekAdjustment).toHaveBeenCalledTimes(1);
    expect(result.errors).toEqual([]);
  });

  it('is best-effort: one athlete failure does not abort the batch', async () => {
    const { sql } = makeFakeSql([
      [
        { athlete_id: '1', coach_id: '9' },
        { athlete_id: '2', coach_id: '9' },
      ],
    ]);
    evaluateAthleteWeek
      .mockResolvedValueOnce(Promise.reject(new Error('context build failed')))
      .mockResolvedValueOnce({ verdict: 'needs_adjustment' });

    const result = await runWeeklyEvaluation({ client: sql, now: new Date('2026-05-26T09:00:00Z') });

    expect(result.evaluated).toBe(1);
    expect(result.proposals_created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ athlete_id: '1' });
    expect(result.errors[0]!.message).toMatch(/context build failed/);
  });
});

// ---------------------------------------------------------------------------
// publish-weekly-plans
// ---------------------------------------------------------------------------

describe('publish-weekly-plans cron', () => {
  it('targets the upcoming Monday', async () => {
    // Saturday 2026-05-30 → next Monday is 2026-06-01.
    expect(await nextMondayIso(new Date('2026-05-30T23:59:00Z'))).toBe('2026-06-01');
  });

  it('publishes drafts and notifies affected athletes', async () => {
    const { sql, calls } = makeFakeSql([[{ athlete_id: '1' }, { athlete_id: '2' }]]);
    notifyAthlete.mockResolvedValue({ id: 'n1' });

    const result = await runPublishWeeklyPlans({
      client: sql,
      now: new Date('2026-05-30T23:59:00Z'),
    });

    expect(calls[0]!.raw).toMatch(/update weekly_plans/i);
    expect(calls[0]!.raw).toMatch(/status = 'published'/);
    expect(calls[0]!.raw).toMatch(/status = 'draft'/);
    expect(result.published).toBe(2);
    expect(result.notified).toBe(2);
    expect(notifyAthlete).toHaveBeenCalledTimes(2);
    expect(notifyAthlete.mock.calls[0]![0]).toMatchObject({ type: 'plan_published' });
  });

  it('notification failure does not break the publish', async () => {
    const { sql } = makeFakeSql([[{ athlete_id: '1' }]]);
    notifyAthlete.mockResolvedValue(Promise.reject(new Error('apns down')));

    const result = await runPublishWeeklyPlans({
      client: sql,
      now: new Date('2026-05-30T23:59:00Z'),
    });
    expect(result.published).toBe(1);
    expect(result.notified).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// expire-invitations
// ---------------------------------------------------------------------------

describe('expire-invitations cron', () => {
  it('expires only pending + past-expiry invitations', async () => {
    const { sql, calls } = makeFakeSql([[{ id: '1' }, { id: '2' }, { id: '3' }]]);
    const result = await runExpireInvitations({
      client: sql,
      now: new Date('2026-05-26T00:00:00Z'),
    });
    expect(calls[0]!.raw).toMatch(/update partner_invitations/i);
    expect(calls[0]!.raw).toMatch(/status = 'expired'/);
    expect(calls[0]!.raw).toMatch(/status = 'pending'/);
    expect(calls[0]!.raw).toMatch(/expires_at </);
    expect(result.expired).toBe(3);
  });
});
