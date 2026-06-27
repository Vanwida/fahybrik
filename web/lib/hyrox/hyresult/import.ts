import 'server-only';

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  hyresultImportAllResult,
  hyresultImportedRaceSchema,
  type HyresultImportAllResult,
  type HyresultImportedRace,
} from '@fahybrid/shared/schema';
import { upsertRaceRow } from '../upsert';
import { adoptPendingRaceForImport } from '../reconcile';
import { fetchAthleteRaces } from './parse';
import { mapToRaceRow, type MappedPartner } from './map';

// =============================================================================
// hyresult.com full-history import service.
//
// 1. Fetch + parse the athlete's ENTIRE race history (singles + doubles/relay).
// 2. Map each race → normalized `races` row + teammates.
// 3. In ONE transaction (atomic, idempotent): upsert each race (dedup on
//    athlete_id+source_idp) and REPLACE its race_partners. Re-running refreshes
//    in place — never duplicates.
// =============================================================================

/** Delete + re-insert a race's teammates (idempotent on re-import). */
async function replacePartners(
  client: Sql | TransactionClient,
  raceId: bigint,
  partners: MappedPartner[],
): Promise<void> {
  await client`delete from race_partners where race_id = ${raceId}`;
  if (partners.length === 0) return;
  const rows = partners.map((p) => ({
    race_id: raceId,
    position: p.position,
    name: p.name,
    slug: p.slug,
    nation: p.nation,
    source_idp: p.source_idp,
  }));
  await client`
    insert into race_partners ${client(rows, 'race_id', 'position', 'name', 'slug', 'nation', 'source_idp')}
  `;
}

/**
 * Import an athlete's full hyresult history into their `races`. Idempotent per
 * (athlete_id, source_idp): re-running updates rows + partners in place.
 */
export async function importAllRaces(params: {
  athlete_id: bigint | number;
  slug: string;
  client?: Sql;
}): Promise<HyresultImportAllResult> {
  const client = params.client ?? defaultSql;
  const athleteId = Number(params.athlete_id);
  const slug = params.slug.trim().toLowerCase();

  const races = await fetchAthleteRaces(slug);

  const result = await client.begin(async (tx) => {
    // Persist the hyresult identity link (the auto-import LINCHPIN): this athlete
    // IS this hyresult profile. Written here — the single chokepoint EVERY
    // by-slug import flows through (web "¿eres tú?" confirm, iOS ImportRaceSheet
    // confirm, and the auto-result cron) — so a profile can never be imported
    // without its slug being recorded. Guarded by `is distinct from` so a
    // re-import / cron pass is a no-op, not a needless write. Atomic with the
    // races below: if the import rolls back, so does the link.
    await tx`
      update athletes
      set hyresult_slug = ${slug}, updated_at = now()
      where id = ${athleteId} and hyresult_slug is distinct from ${slug}
    `;

    let imported = 0;
    let updated = 0;
    const out: HyresultImportedRace[] = [];
    for (const race of races) {
      // A non-finishing entry (DNS / abandoned, recorded as t_total <= 0) is not a
      // completed result — skip it rather than persist a 0-second "finish".
      if (race.t_total <= 0) continue;

      // Per-race SAVEPOINT so one malformed historical race is skipped instead of
      // aborting the whole batch (best-effort across a long history, matching
      // parse.ts). A plain try/catch is insufficient: once any statement errors,
      // Postgres aborts the surrounding transaction and every later upsert fails;
      // the savepoint rolls back ONLY that race and leaves the transaction usable.
      // The per-race projection parse runs INSIDE the savepoint too, so a row that
      // maps outside the response contract is isolated, not fatal to the response.
      try {
        const projected = await tx.savepoint(async (sp) => {
          const { row, partners } = mapToRaceRow(race, athleteId, slug);

          // RECONCILE / ADOPT (the unified FUTURE→PAST seam): before writing this
          // completed result, stamp its source_idp onto a matching PENDING future
          // objective the athlete/coach created (same event_type+format, date
          // within ±window, or a catalog event_id link). The upsert below keys ON
          // CONFLICT (athlete_id, source_idp), so it then fills THAT row in place
          // — the planned target becomes the completed result, no duplicate row.
          // No-op when nothing matches (a tune-up with no objective just inserts
          // as a fresh `tune_up` row). Conservative by construction: a past result
          // can't match a still-future objective (date > window, event_id null),
          // so this is a no-op on first import and only "bites" once a target's
          // date has passed — which is exactly when it should adopt. Running it in
          // EVERY import (manual confirm + cron) — not just the cron — also closes
          // the duplicate/unique-violation race when an athlete manually re-imports
          // after a target passes but before the next cron pass.
          await adoptPendingRaceForImport({
            athlete_id: athleteId,
            imported: {
              event_id: null, // hyresult imports carry no catalog link
              race_date: row.race_date,
              event_type: row.event_type,
              format: row.format,
              division: row.division,
              gender_category: row.gender_category,
              source_idp: row.source_idp,
            },
            client: sp,
          });

          const { id, inserted } = await upsertRaceRow(sp, row);
          await replacePartners(sp, id, partners);
          const projection: HyresultImportedRace = hyresultImportedRaceSchema.parse({
            // Number, not bigint — the response race_id is a JS number (matches
            // the history endpoint). Serial ids are small; `id` stays bigint for
            // the partner write below.
            race_id: Number(id),
            name: row.name,
            event_type: row.event_type,
            format: row.format,
            division: row.division,
            gender_category: row.gender_category,
            age_group: row.age_group,
            race_date: row.race_date,
            result_time_seconds: row.result_time_seconds,
            run_splits: row.run_splits,
            station_splits: row.station_splits,
            roxzone_seconds: row.roxzone_seconds,
            run_total_seconds: row.run_total_seconds,
            best_run_lap_seconds: row.best_run_lap_seconds,
            overall_rank: row.overall_rank,
            age_group_rank: row.age_group_rank,
            nationality: row.nationality,
            source: row.source,
            source_idp: row.source_idp,
            source_season: row.source_season,
            source_url: row.source_url,
            was_inserted: inserted,
            partners,
          });
          return { inserted, projection };
        });
        if (projected.inserted) imported++;
        else updated++;
        out.push(projected.projection);
      } catch {
        // Skip this single malformed race; the rest of the history still imports.
        continue;
      }
    }
    return { imported, updated, races: out };
  });

  // Validate the response against the shared contract before returning. Every
  // entry in `races` was already individually validated inside its savepoint, so
  // this only re-affirms the envelope (counts + array shape).
  return hyresultImportAllResult.parse(result);
}
