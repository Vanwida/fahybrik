/**
 * Real-DB tests for cookieless web visit counting (#20). No SQL mocked (Neon test
 * branch, describeWithDb).
 *
 * Covers:
 *   • recordVisit twice with the SAME headers on the same day ⇒ views=2, visitors=1
 *     (dedup by the daily-salted visitor_hash).
 *   • a DIFFERENT user agent ⇒ visitors=2 (a distinct hash counts as a new visitor).
 *   • loadVisitTotals sums views/visitors across days AND sources and returns min(day)
 *     as since_date; returns zeros + null since_date when nothing matches.
 *
 * recordVisit derives the daily salt from AUTH_SECRET at call time, so we pin a
 * deterministic secret below → the visitor_hash is reproducible within the run.
 *
 * recordVisit / loadVisitTotals use the module client (@/lib/db, DATABASE_URL); the
 * seed/cleanup below use the test client (TEST_DATABASE_URL). As with the other real-DB
 * suites (e.g. metrics/funnel.db.test.ts), the runner points BOTH env vars at the same
 * throwaway branch. WRITTEN for tsc; SKIPPED unless TEST_DATABASE_URL is set.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { recordVisit, loadVisitTotals } from '@/lib/analytics/visits';
import { zonedDayString, BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

// recordVisit reads AUTH_SECRET at call time to build the daily salt; give it a
// deterministic value so the derived visitor_hash is reproducible within the run.
process.env.AUTH_SECRET ??= 'test-visit-secret';

function headersFor(ip: string, ua: string): Headers {
  const h = new Headers();
  h.set('x-forwarded-for', ip);
  h.set('user-agent', ua);
  return h;
}

describeWithDb('web visit counting (#20, cookieless, real DB)', () => {
  const sql = getTestSql();

  // The day recordVisit will write to (its own Europe/Madrid "today"). Computed the
  // same way as the recorder so the assertions target the exact rows it writes.
  const today = zonedDayString(new Date(), BOX_TIMEZONE);

  // Far-future days used ONLY by the loadVisitTotals summation test → never collide
  // with real or "today" rows on a shared branch.
  const D1 = '2999-03-01';
  const D2 = '2999-03-02';

  async function purge(): Promise<void> {
    await sql`delete from visit_seen where day in (${today}::date, ${D1}::date, ${D2}::date)`;
    await sql`delete from visit_counts where day in (${today}::date, ${D1}::date, ${D2}::date)`;
  }

  async function todayCounts(source: string): Promise<{ views: number; visitors: number }> {
    const rows = await sql<{ views: number; visitors: number }[]>`
      select views::int as views, visitors::int as visitors
      from visit_counts
      where day = ${today}::date and source = ${source}
    `;
    return rows[0] ?? { views: 0, visitors: 0 };
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  beforeEach(purge);
  afterEach(purge);
  afterAll(async () => {
    await closeTestSql();
  });

  test('same visitor, same day ⇒ views increment, visitors dedupes to 1', async () => {
    const h = headersFor('203.0.113.7', 'Mozilla/5.0 (VisitTest A)');
    await recordVisit('landing', h);
    await recordVisit('landing', h);

    const c = await todayCounts('landing');
    expect(c.views).toBe(2);
    expect(c.visitors).toBe(1);
  });

  test('a different user agent counts as a second unique visitor', async () => {
    await recordVisit('landing', headersFor('203.0.113.7', 'Mozilla/5.0 (VisitTest A)'));
    await recordVisit('landing', headersFor('203.0.113.7', 'Mozilla/5.0 (VisitTest B)'));

    const c = await todayCounts('landing');
    expect(c.views).toBe(2);
    expect(c.visitors).toBe(2);
  });

  test('loadVisitTotals sums across days & sources and returns min(day); empty ⇒ zeros', async () => {
    const since = new Date(`${D1}T00:00:00Z`);

    // Nothing seeded in the far-future range yet → zeros + null since_date.
    const empty = await loadVisitTotals(since);
    expect(empty).toEqual({ views: 0, visitors: 0, since_date: null });

    // Seed the daily aggregate directly (two days, two sources).
    await sql`
      insert into visit_counts (day, source, views, visitors) values
        (${D1}::date, 'landing', 10, 6),
        (${D1}::date, 'empieza', 3, 2),
        (${D2}::date, 'landing', 7, 5)
    `;

    const totals = await loadVisitTotals(since);
    expect(totals.views).toBe(20); // 10 + 3 + 7
    expect(totals.visitors).toBe(13); // 6 + 2 + 5
    expect(totals.since_date).toBe(D1); // earliest instrumented day in range
  });
});
