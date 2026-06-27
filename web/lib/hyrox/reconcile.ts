import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { upsertRaceRow, type RaceUpsertResult, type RaceUpsertRow } from './upsert';

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILE / ADOPT — match a freshly-imported completed result to the athlete's
// pending FUTURE race (the objective they/the coach created) and ADOPT it in
// place, instead of inserting a second row for the same race.
//
// HOW the adopt works: stamp the imported result's source_idp onto the pending
// row. The existing import upsert (lib/hyrox/upsert.ts) keys ON CONFLICT
// (athlete_id, source_idp) — so the very next upsert fills THAT row with the
// result (time, splits, ranks…), while the objective's coach-owned fields
// (priority='target', goal_time_seconds, event_id) survive. No duplicate; one
// row carries FUTURE→PAST.
//
// BOTH importers (official single-URL + hyresult full-history) flow through the
// SAME seam via `reconcileAndUpsertRace` below — adopt-then-upsert is written
// once, never duplicated per importer.
// ─────────────────────────────────────────────────────────────────────────────

// Date window (days) for matching by date when there's no catalog event span. A
// HYROX event spans a weekend; an athlete may have dated their objective to the
// Saturday while the imported result lands on the Sunday — ±3 covers that slack
// without grabbing a different race in an adjacent week. When the pending target
// IS catalog-linked, we use the event's real [start,end] span instead (below),
// so a multi-day festival no longer falls outside ±3.
export const RECONCILE_DATE_WINDOW_DAYS = 3;

// A pending FUTURE race that can be adopted: an objective with no result yet
// (result_time_seconds null, source_idp null) still in the registration phase.
export interface PendingRaceCandidate {
  id: number;
  event_id: number | null;
  race_date: string | null; // YYYY-MM-DD
  event_type: string;
  format: string;
  division: string;
  gender_category: string;
  // Catalog event span (when event-linked), used to WIDEN the date-acceptance
  // window: a multi-day festival target may be dated to the event's first day
  // while the heat — and so the imported result — lands several days later, >±3
  // from the stored race_date but still inside the real event span.
  event_start_date?: string | null; // YYYY-MM-DD
  event_end_date?: string | null; // YYYY-MM-DD
}

// The identifying fields of a freshly-imported completed result the matcher needs.
export interface ImportedResultKey {
  event_id: number | null;
  race_date: string | null; // YYYY-MM-DD
  event_type: string;
  format: string;
  division: string;
  gender_category: string;
}

// Outcome of an adopt attempt — explicit so callers can surface it (a unique-idx
// collision is MERGED, never silently swallowed).
export type AdoptOutcome = 'adopted' | 'merged' | 'none';

export interface AdoptResult {
  outcome: AdoptOutcome;
  // The row the result should fill: the adopted/merged race id, or null on 'none'.
  race_id: number | null;
}

function daysBetweenIso(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((da - db) / 86_400_000);
}

/**
 * Does an imported result's date fall in a pending candidate's accepted window?
 *   * Catalog-linked target with a known span → inside [start-window, end+window]
 *     (the multi-day-festival case: heat day may be several days past start_date).
 *   * Otherwise → within ±window of the target's own stored race_date.
 */
function dateAccepted(p: PendingRaceCandidate, importedDate: string): boolean {
  if (p.event_start_date) {
    const start = p.event_start_date;
    const end = p.event_end_date ?? p.event_start_date;
    return (
      daysBetweenIso(importedDate, start) >= -RECONCILE_DATE_WINDOW_DAYS &&
      daysBetweenIso(importedDate, end) <= RECONCILE_DATE_WINDOW_DAYS
    );
  }
  if (p.race_date == null) return false;
  return Math.abs(daysBetweenIso(p.race_date, importedDate)) <= RECONCILE_DATE_WINDOW_DAYS;
}

function pickClosest(
  cands: PendingRaceCandidate[],
  imported: ImportedResultKey,
): PendingRaceCandidate {
  // Ranking tie-breaks (NOT filters): same format first, then same
  // division+gender bracket, then the nearest date. Format is a category WITHIN
  // an event, not the event's identity — a doubles result still adopts a singles
  // objective for the same event/date, it just loses to an exact-format target.
  const score = (p: PendingRaceCandidate): [number, number, number] => {
    const formatMatch = p.format === imported.format ? 0 : 1;
    const bracketMatch =
      p.division === imported.division && p.gender_category === imported.gender_category ? 0 : 1;
    const dist =
      p.race_date != null && imported.race_date != null
        ? Math.abs(daysBetweenIso(p.race_date, imported.race_date))
        : Number.MAX_SAFE_INTEGER;
    return [formatMatch, bracketMatch, dist];
  };
  return [...cands].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sa[i]! - sb[i]!;
    }
    return 0;
  })[0]!;
}

/**
 * Pure matcher: pick the pending FUTURE race an imported completed result should
 * ADOPT, or null if none fits.
 *   1. Catalog link wins — a pending race with the same event_id (both non-null).
 *   2. Else date + same event_type, within the accepted window (±window of the
 *      target's date, OR inside the target's catalog event span). format /
 *      division / gender are RANKING tie-breaks, not hard exclusions.
 * Never matches across event_type (a DEKA result never adopts a HYROX objective).
 * A dateless import with no event link can't be reconciled.
 */
export function matchPendingRace(
  imported: ImportedResultKey,
  pending: PendingRaceCandidate[],
): PendingRaceCandidate | null {
  // 1) Catalog link.
  if (imported.event_id != null) {
    const linked = pending.filter(
      (p) => p.event_id != null && p.event_id === imported.event_id,
    );
    if (linked.length > 0) return pickClosest(linked, imported);
  }

  // 2) Date + event_type (needs a real date on the imported side).
  if (imported.race_date == null) return null;
  const sameKind = pending.filter(
    (p) => p.event_type === imported.event_type && dateAccepted(p, imported.race_date as string),
  );
  if (sameKind.length === 0) return null;
  return pickClosest(sameKind, imported);
}

/**
 * DB adopt step: find the athlete's matching pending FUTURE race for a
 * freshly-imported result and stamp the imported source_idp onto it so the
 * existing ON CONFLICT (athlete_id, source_idp) upsert fills that row in place.
 *
 * Three outcomes:
 *   * 'adopted' — stamped a pending target; the upsert fills it (FUTURE→PAST).
 *   * 'merged'  — a COMPLETED row already holds this (athlete_id, source_idp)
 *     (the partial unique idx, 0054). Stamping the target would hit that index;
 *     the old code let the savepoint swallow the violation and the target
 *     LINGERED as a duplicate. Instead we carry the target's coach-owned role
 *     (priority/goal/event_id/coach) onto the existing completed row and delete
 *     the redundant target — one row, no dup, nothing silently swallowed.
 *   * 'none'    — nothing matched; the import inserts a fresh tune-up row.
 */
export async function adoptPendingRaceForImport(args: {
  athlete_id: number | bigint;
  imported: ImportedResultKey & { source_idp: string };
  // Accepts the pool OR an in-flight transaction/savepoint client so the adopt
  // stamp runs atomically with the upsert that fills the row (the shared
  // reconcileAndUpsertRace runs both inside one tx/savepoint).
  client?: Sql | TransactionClient;
}): Promise<AdoptResult> {
  const client = args.client ?? defaultSql;
  const athleteId = Number(args.athlete_id);

  const pending = await client<PendingRaceCandidate[]>`
    select
      r.id::int                          as id,
      r.event_id::int                    as event_id,
      to_char(r.race_date, 'YYYY-MM-DD')  as race_date,
      r.event_type::text                 as event_type,
      r.format::text                     as format,
      r.division::text                   as division,
      r.gender_category::text            as gender_category,
      to_char(e.start_date, 'YYYY-MM-DD') as event_start_date,
      to_char(e.end_date, 'YYYY-MM-DD')   as event_end_date
    from races r
    left join events e on e.id = r.event_id
    where r.athlete_id = ${athleteId}
      and r.result_time_seconds is null
      and r.source_idp is null
      and r.status in ('planned', 'registered')
  `;

  const match = matchPendingRace(args.imported, pending);
  if (!match) return { outcome: 'none', race_id: null };

  // #5 — a completed row may ALREADY hold this (athlete_id, source_idp). Stamping
  // it onto the pending target would violate the partial unique idx; detect it
  // first and MERGE instead of letting the savepoint swallow the collision.
  const existing = await client<{ id: number }[]>`
    select id::int as id from races
    where athlete_id = ${athleteId}
      and source_idp = ${args.imported.source_idp}
      and id <> ${match.id}
    limit 1
  `;
  if (existing.length > 0) {
    const completedId = existing[0]!.id;
    // Carry the target's coach-owned periodization role onto the completed row.
    // coalesce keeps any value the completed row already holds; priority is the
    // target's role (the whole point of the target). The subsequent upsert
    // refreshes source facts on completedId but deliberately leaves these fields
    // untouched (see upsert.ts), so the merged role survives.
    await client`
      update races dst set
        priority            = src.priority,
        goal_time_seconds   = coalesce(dst.goal_time_seconds, src.goal_time_seconds),
        event_id            = coalesce(dst.event_id, src.event_id),
        created_by_coach_id  = coalesce(dst.created_by_coach_id, src.created_by_coach_id),
        updated_at          = now()
      from races src
      where dst.id = ${completedId} and src.id = ${match.id}
    `;
    await client`delete from races where id = ${match.id}`;
    return { outcome: 'merged', race_id: completedId };
  }

  await client`
    update races
    set source_idp = ${args.imported.source_idp}, updated_at = now()
    where id = ${match.id} and source_idp is null
  `;
  return { outcome: 'adopted', race_id: match.id };
}

/**
 * The shared adopt-before-upsert seam used by BOTH importers (official
 * single-URL + hyresult full-history). Runs the adopt stamp/merge and then the
 * upsert in the SAME client (a tx/savepoint), so the ON CONFLICT
 * (athlete_id, source_idp) fills exactly the row the adopt prepared. Returns the
 * stored row id/inserted plus the adopt outcome (for the caller to surface).
 */
export async function reconcileAndUpsertRace(
  client: Sql | TransactionClient,
  args: {
    athlete_id: number | bigint;
    imported: ImportedResultKey & { source_idp: string };
    row: RaceUpsertRow;
  },
): Promise<RaceUpsertResult & { adopt: AdoptResult }> {
  const adopt = await adoptPendingRaceForImport({
    athlete_id: args.athlete_id,
    imported: args.imported,
    client,
  });
  const { id, inserted } = await upsertRaceRow(client, args.row);
  return { id, inserted, adopt };
}
