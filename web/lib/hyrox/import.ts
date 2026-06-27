import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  hyroxImportedResultSchema,
  type HyroxImportedResult,
  type RaceGender,
} from '@fahybrid/shared/schema';
import {
  HYROX_CHROME_UA,
  HyroxParseError,
  buildDetailUrl,
  buildLeaderboardUrl,
  parseFieldSize,
  parseHyroxDetail,
  parseHyroxUrl,
  type HyroxResultRef,
} from './parse';
import type { RaceUpsertRow } from './upsert';
import { reconcileAndUpsertRace } from './reconcile';
import { resolveCatalogEventByLabel } from './catalog-link';

// =============================================================================
// HYROX result import service.
//
// 1. Validate + parse the pasted URL (host allowlist done in parseHyroxUrl).
// 2. Fetch the detail page (Chrome UA) → parse splits/ranks.
// 3. Resolve the athlete's FIELD sex (the gendered division this result belongs
//    to) and fetch that leaderboard's "N Results" header → field_size. The
//    HYROX list page never exposes ranks past its top page, so we can't locate
//    the athlete by idp (fails for anyone past ~rank 100). Instead we pick the
//    correct gendered leaderboard up-front and read its result count, which is
//    present regardless of pagination. Best-effort: a failure degrades to a null
//    field_size, never blocks the import.
// 4. Compute percentile = overall_rank / field_size.
// 5. Bridge the meeting to the shared `events` catalog (best-effort) to recover
//    the REAL race date + an event_id link — the detail page carries no machine
//    date (see below).
// 6. ADOPT a matching pending objective, then upsert into `races` (deduped on
//    (athlete_id, source_idp)) — the SHARED reconcile-then-upsert seam, identical
//    to the hyresult importer, so a pasted official result fills the coach's
//    pending target in place instead of inserting a duplicate.
// =============================================================================

// Detail/leaderboard fetches: short timeout, no redirects to off-host targets.
const FETCH_TIMEOUT_MS = 12_000;

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': HYROX_CHROME_UA, Accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new HyroxParseError(
        'fetch_failed',
        `No se pudo descargar el resultado (HTTP ${res.status}).`,
      );
    }
    return await res.text();
  } catch (err) {
    if (err instanceof HyroxParseError) throw err;
    throw new HyroxParseError('fetch_failed', 'No se pudo conectar con HYROX.');
  } finally {
    clearTimeout(timer);
  }
}

// Athlete profile sex (athletes.sex enum) → leaderboard sex token. 'other'/null
// don't map to a singles field.
function profileSexToLeaderboard(sex: string | null): 'M' | 'W' | null {
  if (sex === 'male') return 'M';
  if (sex === 'female') return 'W';
  return null;
}

// race_gender (inferred at parse from the event label) → leaderboard sex token.
function raceGenderToLeaderboard(gender: RaceGender): 'M' | 'W' | null {
  if (gender === 'men') return 'M';
  if (gender === 'women') return 'W';
  return null; // mixed → no single gendered field
}

/** Look up the athlete's profile sex from our own DB. */
async function fetchAthleteSex(client: Sql, athleteId: number): Promise<string | null> {
  const rows = await client<{ sex: string | null }[]>`
    select sex::text as sex from athletes where id = ${athleteId}
  `;
  return rows[0]?.sex ?? null;
}

/**
 * Field size = the "N Results" count of the gendered division this result
 * belongs to. We resolve the field's sex from our own data — the athlete's
 * profile sex first (their real attribute), falling back to the race's inferred
 * gender_category (the field the entry sits in) when the profile sex is unset.
 * We then read that one leaderboard's result header (present regardless of
 * pagination), so it works for any rank — not just the top ~100.
 *
 * Best-effort: returns null on a 'mixed'/'other' field with no gendered list, or
 * on any fetch/parse failure. The import still succeeds; percentile just won't
 * be computed.
 */
async function resolveFieldSize(
  ref: HyroxResultRef,
  fieldSex: 'M' | 'W' | null,
): Promise<number | null> {
  if (fieldSex == null) return null;
  try {
    const html = await fetchHtml(buildLeaderboardUrl(ref, fieldSex));
    return parseFieldSize(html);
  } catch {
    return null; // degrade gracefully
  }
}

/**
 * Import a HYROX result for an athlete from a pasted detail URL. Returns the
 * stored projection. Throws HyroxParseError (caught by the route → 4xx).
 */
export async function importHyroxResult(params: {
  athlete_id: bigint | number;
  result_url: string;
  client?: Sql;
}): Promise<HyroxImportedResult> {
  const client = params.client ?? defaultSql;
  const athleteId = Number(params.athlete_id);

  const ref = parseHyroxUrl(params.result_url);
  const canonicalUrl = buildDetailUrl(ref);

  const detailHtml = await fetchHtml(canonicalUrl);
  const detail = parseHyroxDetail(detailHtml);

  // Field sex resolution: athlete profile sex first (their real attribute),
  // then the race's inferred gender_category (the field the entry sits in) as a
  // fallback when the profile sex is unset. A 'mixed' event or an unset/'other'
  // profile with no gendered category leaves it unresolved → field_size null.
  const athleteSex = await fetchAthleteSex(client, athleteId);
  const gender: RaceGender = /\bmixed\b/i.test(detail.event_label ?? '')
    ? 'mixed'
    : detail.gender_category;
  const fieldSex =
    profileSexToLeaderboard(athleteSex) ?? raceGenderToLeaderboard(gender);

  const field_size = await resolveFieldSize(ref, fieldSex);

  // percentile = overall_rank / field_size (1 = last; lower = better). Null if
  // either is missing.
  const percentile =
    detail.overall_rank != null && field_size != null && field_size > 0
      ? Math.min(1, Math.max(0, detail.overall_rank / field_size))
      : null;

  const raceName = detail.meeting
    ? `HYROX ${detail.meeting}`
    : detail.event_label ?? 'HYROX';

  // race_date: the detail page exposes the meeting name ("2026 Amsterdam") but no
  // machine-readable ISO date. We DON'T fabricate one (migration 0072 killed the
  // today's-date placeholder). Instead we bridge the meeting to the curated
  // `events` catalog: a confident hit yields the REAL start_date AND an event_id
  // the adopt step can match on. A miss leaves race_date null — the honest "date
  // unknown" signal — and the row still imports.
  const catalog = await resolveCatalogEventByLabel(client, {
    series: 'hyrox',
    label: detail.meeting,
  });
  const raceDate = catalog?.race_date ?? null;

  // Build the normalized row and write it through the SHARED reconcile-then-upsert
  // (adopt a matching pending target, then upsert deduped on
  // (athlete_id, source_idp); ON CONFLICT refreshes in place).
  const row: RaceUpsertRow = {
    athlete_id: athleteId,
    name: raceName,
    event_type: 'hyrox',
    format: 'singles',
    division: detail.division,
    gender_category: gender,
    priority: 'tune_up',
    age_group: detail.age_group,
    race_date: raceDate,
    location: detail.meeting,
    result_time_seconds: detail.finish_time_seconds,
    status: 'completed',
    run_splits: detail.run_splits,
    station_splits: detail.station_splits,
    roxzone_seconds: detail.roxzone_seconds,
    run_total_seconds: detail.run_total_seconds,
    best_run_lap_seconds: detail.best_run_lap_seconds,
    overall_rank: detail.overall_rank,
    age_group_rank: detail.age_group_rank,
    field_size,
    nationality: detail.nationality,
    bib: detail.bib,
    source: 'hyrox_import',
    source_idp: ref.idp,
    source_event: ref.event,
    source_season: ref.season,
    source_url: canonicalUrl,
  };

  // Adopt-then-upsert in ONE transaction so the adopt's source_idp stamp is
  // visible to the upsert's ON CONFLICT (athlete_id, source_idp) — they MUST be
  // atomic, otherwise the upsert can't see the just-stamped target row.
  let raceId: bigint;
  try {
    raceId = (
      await client.begin((tx) =>
        reconcileAndUpsertRace(tx, {
          athlete_id: athleteId,
          imported: {
            event_id: catalog?.event_id ?? null,
            race_date: raceDate,
            event_type: 'hyrox',
            format: 'singles',
            division: detail.division,
            gender_category: gender,
            source_idp: ref.idp,
          },
          row,
        }),
      )
    ).id;
  } catch {
    throw new HyroxParseError('store_failed', 'No se pudo guardar el resultado.');
  }

  const result: HyroxImportedResult = {
    race_id: raceId,
    athlete_id: BigInt(athleteId),
    name: raceName,
    result_time_seconds: detail.finish_time_seconds,
    division: detail.division,
    gender_category: gender,
    age_group: detail.age_group,
    nationality: detail.nationality,
    bib: detail.bib,
    race_date: raceDate,
    location: detail.meeting,
    run_splits: row.run_splits,
    station_splits: row.station_splits,
    roxzone_seconds: detail.roxzone_seconds,
    run_total_seconds: detail.run_total_seconds,
    best_run_lap_seconds: detail.best_run_lap_seconds,
    overall_rank: detail.overall_rank,
    age_group_rank: detail.age_group_rank,
    field_size,
    percentile,
    source: 'hyrox_import',
    source_idp: ref.idp,
    source_event: ref.event,
    source_season: ref.season,
    source_url: canonicalUrl,
    imported_at: new Date().toISOString(),
  };

  // Validate the stored projection against the shared schema before returning —
  // the response contract is the schema, not whatever we happened to build.
  return hyroxImportedResultSchema.parse(result);
}
