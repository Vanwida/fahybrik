import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

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
// This is the phase-1 seam. The auto-result cron that calls adoptPendingRace…
// before upserting is phase 2.
// ─────────────────────────────────────────────────────────────────────────────

// Date window (days) for matching by date when there's no catalog event link. A
// HYROX event spans a weekend; an athlete may have dated their objective to the
// Saturday while the imported result lands on the Sunday — ±3 covers that slack
// without grabbing a different race in an adjacent week.
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

function daysBetweenIso(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((da - db) / 86_400_000);
}

function pickClosest(
  cands: PendingRaceCandidate[],
  imported: ImportedResultKey,
): PendingRaceCandidate {
  // Tie-break: prefer same division+gender (0 over 1), then the nearest date.
  const score = (p: PendingRaceCandidate): [number, number] => {
    const exactBracket =
      p.division === imported.division && p.gender_category === imported.gender_category ? 0 : 1;
    const dist =
      p.race_date != null && imported.race_date != null
        ? Math.abs(daysBetweenIso(p.race_date, imported.race_date))
        : Number.MAX_SAFE_INTEGER;
    return [exactBracket, dist];
  };
  return [...cands].sort((a, b) => {
    const [ea, da] = score(a);
    const [eb, db] = score(b);
    return ea !== eb ? ea - eb : da - db;
  })[0]!;
}

/**
 * Pure matcher: pick the pending FUTURE race an imported completed result should
 * ADOPT, or null if none fits.
 *   1. Catalog link wins — a pending race with the same event_id (both non-null).
 *   2. Else date+format — same event_type AND format, race_date within ±window;
 *      division/gender break ties, then the closest date.
 * Never matches across event_type or format (a doubles result never adopts a
 * singles objective). A dateless import with no event link can't be reconciled.
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

  // 2) Date + format (needs a real date on both sides).
  if (imported.race_date == null) return null;
  const sameKind = pending.filter(
    (p) =>
      p.race_date != null &&
      p.event_type === imported.event_type &&
      p.format === imported.format &&
      Math.abs(daysBetweenIso(p.race_date, imported.race_date as string)) <=
        RECONCILE_DATE_WINDOW_DAYS,
  );
  if (sameKind.length === 0) return null;
  return pickClosest(sameKind, imported);
}

/**
 * DB adopt step (phase-2 cron): find the athlete's matching pending FUTURE race
 * for a freshly-imported result and stamp the imported source_idp onto it so the
 * existing ON CONFLICT (athlete_id, source_idp) upsert fills that row in place.
 * Returns the adopted races.id, or null when nothing matched (the import then
 * inserts a fresh completed row as usual).
 */
export async function adoptPendingRaceForImport(args: {
  athlete_id: number | bigint;
  imported: ImportedResultKey & { source_idp: string };
  client?: Sql;
}): Promise<number | null> {
  const client = args.client ?? defaultSql;

  const pending = await client<PendingRaceCandidate[]>`
    select
      r.id::int                          as id,
      r.event_id::int                    as event_id,
      to_char(r.race_date, 'YYYY-MM-DD') as race_date,
      r.event_type::text                 as event_type,
      r.format::text                     as format,
      r.division::text                   as division,
      r.gender_category::text            as gender_category
    from races r
    where r.athlete_id = ${args.athlete_id as number}
      and r.result_time_seconds is null
      and r.source_idp is null
      and r.status in ('planned', 'registered')
  `;

  const match = matchPendingRace(args.imported, pending);
  if (!match) return null;

  await client`
    update races
    set source_idp = ${args.imported.source_idp}, updated_at = now()
    where id = ${match.id} and source_idp is null
  `;
  return match.id;
}
