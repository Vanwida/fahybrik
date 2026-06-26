import 'server-only';

import type { Sql, TransactionClient } from '@/lib/db';
import type {
  HyroxStationSplit,
  RaceDivision,
  RaceEventType,
  RaceFormat,
  RaceGender,
  RacePriority,
  RaceSource,
  RaceStatus,
} from '@fahybrid/shared/schema';

// =============================================================================
// Shared `races` upsert — the single source of truth for writing an IMPORTED
// race row, used by BOTH importers:
//   * the official single-URL importer (results.hyrox.com, ./import.ts)
//   * the hyresult.com full-history importer (./hyresult/import.ts)
//
// Dedup is the partial unique index (athlete_id, source_idp) where source_idp is
// not null (0054): re-importing the same race UPDATES in place. `priority` is
// intentionally NOT refreshed on conflict — it is the coach-owned periodization
// role, not a source fact; everything else is source-derived and refreshed.
// =============================================================================

// A normalized, fully-typed `races` insert row. Snake_case field names mirror
// the columns. `source_idp` is the dedup key (non-null for every import).
export interface RaceUpsertRow {
  athlete_id: number;
  name: string;
  event_type: RaceEventType;
  format: RaceFormat;
  division: RaceDivision;
  gender_category: RaceGender;
  priority: RacePriority;
  age_group: string | null;
  race_date: string | null; // 'YYYY-MM-DD'; null when the source has no machine date (official single-URL import, 0072)
  location: string | null;
  result_time_seconds: number;
  status: RaceStatus;
  run_splits: number[];
  station_splits: HyroxStationSplit[];
  roxzone_seconds: number | null;
  run_total_seconds: number | null;
  best_run_lap_seconds: number | null;
  overall_rank: number | null;
  age_group_rank: number | null;
  field_size: number | null;
  nationality: string | null;
  bib: string | null;
  source: RaceSource;
  source_idp: string;
  source_event: string | null;
  source_season: string | null;
  source_url: string | null;
}

export interface RaceUpsertResult {
  id: bigint;
  // true = a brand-new row was inserted; false = an existing row was refreshed.
  inserted: boolean;
}

/**
 * Insert or refresh one imported race, deduped on (athlete_id, source_idp).
 * Accepts the pool or a transaction client so a batch import can run atomically.
 * `(xmax::text = '0')` distinguishes a fresh insert (xmax 0) from a conflict
 * update (xmax = the superseded tuple's xid).
 */
export async function upsertRaceRow(
  client: Sql | TransactionClient,
  row: RaceUpsertRow,
): Promise<RaceUpsertResult> {
  const rows = await client<{ id: string; inserted: boolean }[]>`
    insert into races (
      athlete_id, name, event_type, format, division, gender_category,
      priority, age_group, race_date, location, result_time_seconds, status,
      run_splits_json, station_splits_json, roxzone_seconds, run_total_seconds,
      best_run_lap_seconds, overall_rank, age_group_rank, field_size,
      nationality, bib, source, source_idp, source_event, source_season,
      source_url, imported_at
    ) values (
      ${row.athlete_id},
      ${row.name},
      ${row.event_type}::race_event_type,
      ${row.format}::race_format,
      ${row.division}::race_division,
      ${row.gender_category}::race_gender,
      ${row.priority}::race_priority,
      ${row.age_group},
      ${row.race_date}::date,
      ${row.location},
      ${row.result_time_seconds},
      ${row.status}::race_status,
      ${client.json(row.run_splits)},
      ${client.json(row.station_splits)},
      ${row.roxzone_seconds},
      ${row.run_total_seconds},
      ${row.best_run_lap_seconds},
      ${row.overall_rank},
      ${row.age_group_rank},
      ${row.field_size},
      ${row.nationality},
      ${row.bib},
      ${row.source},
      ${row.source_idp},
      ${row.source_event},
      ${row.source_season},
      ${row.source_url},
      now()
    )
    on conflict (athlete_id, source_idp) where source_idp is not null
    do update set
      name = excluded.name,
      event_type = excluded.event_type,
      format = excluded.format,
      division = excluded.division,
      gender_category = excluded.gender_category,
      age_group = excluded.age_group,
      race_date = excluded.race_date,
      location = excluded.location,
      result_time_seconds = excluded.result_time_seconds,
      status = excluded.status,
      run_splits_json = excluded.run_splits_json,
      station_splits_json = excluded.station_splits_json,
      roxzone_seconds = excluded.roxzone_seconds,
      run_total_seconds = excluded.run_total_seconds,
      best_run_lap_seconds = excluded.best_run_lap_seconds,
      overall_rank = excluded.overall_rank,
      age_group_rank = excluded.age_group_rank,
      field_size = excluded.field_size,
      nationality = excluded.nationality,
      bib = excluded.bib,
      source = excluded.source,
      source_event = excluded.source_event,
      source_season = excluded.source_season,
      source_url = excluded.source_url,
      imported_at = excluded.imported_at,
      updated_at = now()
    returning id::text as id, (xmax::text = '0') as inserted
  `;
  const r = rows[0];
  if (!r) throw new Error('race upsert returned no row');
  return { id: BigInt(r.id), inserted: r.inserted };
}
