// First-party, cookieless, PII-free web VISIT counting (#20). This is the recorder
// (write side) + the totals reader the coach /metricas funnel uses.
//
// ── RGPD / privacy reasoning ────────────────────────────────────────────────────────
// This counter is designed to need NO consent banner, à la Plausible:
//   • NO cookies, NO localStorage/sessionStorage, NO persistent identifier is ever set
//     on the visitor's device. Counting happens entirely server-side, on render.
//   • The raw IP is NEVER stored. Neither is the user agent. The ONLY derived value we
//     persist is a per-visitor DAILY hash used transiently to dedupe unique visitors:
//         visitor_hash = sha256( dailySalt | ip | userAgent )
//         dailySalt     = sha256( AUTH_SECRET + ':visit:' + <today, Europe/Madrid> )
//     Because the salt is secret-derived (AUTH_SECRET) AND rotates every calendar day,
//     the hash is (a) non-reversible — you cannot recover the IP from it — and (b)
//     un-correlatable across days — the same visitor produces a different hash tomorrow,
//     so there is no long-term tracking or cross-day profiling.
//   • Lawful basis = LEGITIMATE INTEREST (aggregate traffic analytics with no personal
//     data and no tracking). Under GDPR/ePrivacy this needs no cookie consent.
//   • #19: the public privacy policy should mention that we keep anonymous, cookieless
//     visit analytics (page views + unique-visitor counts) with no personal data stored.
//
// Fail-safe by construction: a tracking failure must NEVER break a page render, so
// recordVisit swallows every error, and if AUTH_SECRET is unset it simply skips counting.

import { createHash } from 'node:crypto';
import { sql } from '@/lib/db';
import { zonedDayString, BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';

/** The two instrumented entry points. `source` is stored verbatim in visit_counts. */
export const VISIT_SOURCES = ['landing', 'empieza'] as const;
export type VisitSource = (typeof VISIT_SOURCES)[number];

export interface VisitTotals {
  /** Total page hits in range. */
  views: number;
  /** Distinct daily-salted visitors in range. */
  visitors: number;
  /** Earliest instrumented day with data (YYYY-MM-DD), for the "desde …" disclaimer; null when empty. */
  since_date: string | null;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Secret-derived, day-rotating salt. New salt each Madrid calendar day → hashes cannot
 *  be correlated across days, and are non-reversible without AUTH_SECRET. */
function dailySalt(day: string, authSecret: string): string {
  return sha256(`${authSecret}:visit:${day}`);
}

/** Non-reversible per-visitor-per-day key. ip/userAgent are consumed ONLY here and never
 *  persisted; only this hash reaches the database. */
function visitorHash(salt: string, ip: string, userAgent: string): string {
  return sha256(`${salt}|${ip}|${userAgent}`);
}

/**
 * Count one visit to `source`. Computes today's daily-salted, non-reversible visitor
 * hash from the request headers (IP from the first `x-forwarded-for` hop + user agent —
 * used ONLY to hash, never stored), then in ONE transaction inserts into the dedup set
 * and bumps the daily aggregate (views always +1, visitors +1 only on a brand-new hash).
 *
 * Never throws: if AUTH_SECRET is unset it skips (fail-safe), and any DB error is
 * swallowed so a tracking failure can never break the page render.
 */
export async function recordVisit(source: VisitSource, headers: Headers): Promise<void> {
  try {
    const authSecret = process.env.AUTH_SECRET;
    // Fail-safe: no secret ⇒ no non-guessable salt ⇒ skip counting rather than store a
    // weakly-salted hash or throw.
    if (!authSecret) return;

    const day = zonedDayString(new Date(), BOX_TIMEZONE); // today in Europe/Madrid, YYYY-MM-DD
    const ip = (headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ?? '';
    const userAgent = headers.get('user-agent') ?? '';

    const hash = visitorHash(dailySalt(day, authSecret), ip, userAgent);

    await sql.begin(async (tx) => {
      // Claim the dedup key. `returning` yields a row ONLY when actually inserted, so a
      // non-empty result ⇒ this is a new unique visitor for (day, source).
      const seen = await tx<{ visitor_hash: string }[]>`
        insert into visit_seen (day, source, visitor_hash)
        values (${day}::date, ${source}, ${hash})
        on conflict do nothing
        returning visitor_hash
      `;
      const newVisitor = seen.length > 0 ? 1 : 0;

      await tx`
        insert into visit_counts (day, source, views, visitors)
        values (${day}::date, ${source}, 1, ${newVisitor})
        on conflict (day, source) do update
          set views    = visit_counts.views + 1,
              visitors  = visit_counts.visitors + excluded.visitors
      `;
    });
  } catch {
    // Swallow: analytics must never break a render. (No console noise in prod.)
  }
}

/**
 * Sum the daily aggregate for the "Visitas web" funnel row. `since` bounds the range
 * (null = whole history). `since_date` is the earliest instrumented day WITH data inside
 * the range — the honest "desde …" start for the disclaimer. Returns zeros + null when
 * the table is empty / no rows match.
 */
export async function loadVisitTotals(since: Date | null): Promise<VisitTotals> {
  const rows = await sql<VisitTotals[]>`
    select
      coalesce(sum(views), 0)::int    as views,
      coalesce(sum(visitors), 0)::int as visitors,
      min(day)::text                  as since_date
    from visit_counts
    where (${since}::date is null or day >= ${since}::date)
  `;
  return rows[0] ?? { views: 0, visitors: 0, since_date: null };
}
