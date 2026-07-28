import 'server-only';

// Carreras hub overview — the data layer behind GET /api/athlete/race-context.
//
// `history` lists the athlete's WHOLE race history — every imported/completed
// race, singles AND doubles/relay (source 'hyrox_import' | 'hyresult_import', or
// a manually-logged result), projected to the structured `raceHistoryItemSchema`
// contract (real race_date, format/division/gender_category, is_team_result and
// the teammates joined from `race_partners`). See shared/schema/races.ts and
// ios/FAHYBRIK/Carreras/CarrerasService.swift.
//
// The hero summary + per-station benchmarks + running splits are sourced from
// the athlete's SINGLES races, by EITHER import route ('hyrox_import', the
// legacy single-URL import, or 'hyresult_import', the by-name history import of
// 0071). What keeps team results out is `format`, not the route: a doubles split
// is the TEAM's time, not the athlete's individual performance, so it never
// drives this deep-dive. Those sections keep the pre-formatted display-string
// shape.
//
// HONEST DATA — nothing is faked:
//   • Empty when the athlete has no singles race yet (last_race null, [] arrays).
//   • standing_label / station fraction+severity derive ONLY from the real HYROX
//     ranks + field_size. No rank/field → null banner AND null bar + null verdict;
//     `station_comparison_note` then says out loud that there is nothing to
//     compare against. A bar at half mast is exactly what the honesty law
//     forbids (docs/CONTRATO-UI.md §7).
//   • There is NO division-benchmark dataset (migration 0054 stores ranks, not
//     reference times), so the comparative signal is either the station rank
//     within the field or, where the athlete has trained evidence, the personal
//     transfer delta. Never a reference time we made up.
//   • ia_report is null (import does not generate an IA report).
//
// Severity bands + pace formatting mirror lib/athlete/running-analysis.ts. They
// are intentionally re-stated here (2nd occurrence; the running-analysis copy is
// module-private and that file is owned by a parallel flow) — extract to a shared
// helper only if a 3rd consumer appears.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  HYROX_STATION_LABELS,
  hyroxStationSplitSchema,
  raceHistoryItemSchema,
  racePartnerSchema,
  type HyroxStationSplit,
  type RaceHistoryItem,
  type RacePartner,
} from '@fahybrid/shared/schema';
import { z } from 'zod';
import { buildRaceTransfer } from './race-transfer';
import { ERG_PACE_UNIT_METERS, ERG_RACE_SPLIT_METERS } from '@fahybrid/shared/domain/race-transfer';

// ── Wire contract (matches iOS CarrerasOverview) ────────────────────────────

type Severity = 'better' | 'slightly_worse' | 'worse';

export interface RaceResultSummaryDTO {
  id: string;
  event_name: string;
  date: string;
  division: string | null;
  total_time: string | null;
  run_time: string | null;
  stations_time: string | null;
  roxzone_time: string | null;
  standing_label: string | null;
  delta_vs_previous: string | null;
  total_seconds: number | null;
}

export interface StationBenchmarkDTO {
  id: string;
  station: string;
  time: string | null;
  delta: string | null;
  /**
   * Bar fill 0…1 from the station's placing within the gender field. NULL when
   * there is no rank or no field size: a half-full bar would insinuate a
   * position nobody measured (docs/CONTRATO-UI.md §7). The row still carries
   * `time` and `delta`, which ARE measured.
   */
  fraction: number | null;
  /** Field-relative verdict. NULL for the same reason as `fraction`. */
  severity: Severity | null;
}

export interface RunningSplitDTO {
  id: string;
  label: string;
  pace: string | null;
  height: number;
  severity: Severity;
}

export interface RaceIAReportDTO {
  summary: string;
  recommended_groups: string[];
}

export interface CarrerasOverviewDTO {
  last_race: RaceResultSummaryDTO | null;
  ia_report: RaceIAReportDTO | null;
  station_benchmarks: StationBenchmarkDTO[];
  /**
   * Why the station rows carry no field-relative bar, when they don't. The
   * section is not silently half-empty: it states that the comparison is not
   * possible (docs/CONTRATO-UI.md §5). Null when the bars ARE comparable.
   */
  station_comparison_note: string | null;
  running_splits: RunningSplitDTO[];
  pace_drop_note: string | null;
  history: RaceHistoryItem[];
}

// ── Constants ───────────────────────────────────────────────────────────────

// Run-split severity bands, expressed as a fraction slower than the race's best
// 1 km lap. ≤4% over best → "better"; ≤10% → "slightly_worse"; beyond → "worse".
// Identical to running-analysis so the per-km reading never drifts between the
// Carreras hub and the running deep-dive.
const SEVERITY_BETTER_MAX = 0.04;
const SEVERITY_SLIGHTLY_WORSE_MAX = 0.1;

// Station-rank severity bands by percentile within the gender field
// (rank / field_size; lower = better). Top quartile → "better"; top half →
// "slightly_worse"; below the median → "worse".
const STATION_PCT_BETTER_MAX = 0.25;
const STATION_PCT_SLIGHTLY_WORSE_MAX = 0.5;

// Minimum bar height so a near-best km/station still renders a visible bar.
const MIN_BAR_HEIGHT = 0.15;

// Said out loud when the stations have times but no placing to compare them to.
// An empty comparison must declare itself, never look like a mediocre result.
const STATION_NO_COMPARISON_NOTE =
  'Esta carrera no trae tu puesto por estación, así que no hay comparación con el resto del campo. Los tiempos sí son los tuyos.';

// Hero (`last_race`) date fallback. iOS RaceResultSummary.date is a NON-optional
// String, so the hero must never send null. An official single-URL import has no
// machine date (race_date null, 0072) — the history query sorts those last, so
// the hero is a real-dated import whenever one exists and this fallback only
// shows when every official import is undated. Mirrors the iOS history wording.
const HERO_DATE_UNKNOWN = 'Fecha por confirmar';

// Final-drift callout threshold (s/km): surface pace_drop_note when the second
// half of the runs is at least this much slower than the first half.
const SPLIT_DRIFT_NOTE_S_PER_KM = 8;

// ── Formatting helpers ───────────────────────────────────────────────────────

/** Seconds → "H:MM:SS" when ≥1h, else "M:SS". Null-safe. */
function timeStr(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Signed delta in seconds → "−2:34" (faster) / "+1:10" (slower) / "±0:00". */
function signedDeltaStr(deltaSeconds: number): string {
  const sign = deltaSeconds < 0 ? '−' : deltaSeconds > 0 ? '+' : '±';
  const abs = Math.abs(Math.round(deltaSeconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

/** Division enum → display label. */
function divisionLabel(division: string | null): string | null {
  if (division === 'pro') return 'Pro';
  if (division === 'open') return 'Open';
  if (division === 'elite') return 'Elite';
  return division;
}

/**
 * Standing banner from the overall placing within the gender field.
 *   • rank + field  → "192 / 456 · top 42%"  (top X% = your percentile placing)
 *   • rank, no field → "192" (honest: we know the placing but not the field size)
 *   • no rank        → null  (nothing to show)
 * top X% is rounded to the nearest percent (rank 1 of any field reads "top 1%").
 */
function standingLabel(rank: number | null, field: number | null): string | null {
  if (rank == null || rank <= 0) return null;
  if (field == null || field <= 0) return `${rank}`;
  const pct = Math.min(100, Math.max(1, Math.round((rank / field) * 100)));
  return `${rank} / ${field} · top ${pct}%`;
}

/** Classify a per-km lap pace against the best lap of the same race. */
function lapSeverity(lapSec: number, bestSec: number): Severity {
  if (bestSec <= 0) return 'worse';
  const over = (lapSec - bestSec) / bestSec;
  if (over <= SEVERITY_BETTER_MAX) return 'better';
  if (over <= SEVERITY_SLIGHTLY_WORSE_MAX) return 'slightly_worse';
  return 'worse';
}

/** The field-relative reading of one station: a bar and a verdict, or neither. */
export type StationFieldReading =
  | { fraction: number; severity: Severity }
  | { fraction: null; severity: null };

/**
 * Place one station within the gender field, from its rank and the field size.
 * Bar fill grows with the percentile (smaller rank = better placing).
 *
 * Without a rank or a field size there is NOTHING: no bar, no verdict — the same
 * rule `standingLabel` above already applies to the hero banner. It used to
 * answer "algo peor" with a bar at half mast to a question nobody had the data
 * to ask, which is the exact shape docs/CONTRATO-UI.md §7 forbids.
 *
 * Bar and verdict are returned TOGETHER so a caller cannot end up drawing one
 * without the other.
 */
export function stationFieldReading(
  rank: number | null,
  field: number | null,
): StationFieldReading {
  if (rank == null || field == null || field <= 0 || rank <= 0) {
    return { fraction: null, severity: null };
  }
  const pct = rank / field;
  const severity: Severity =
    pct <= STATION_PCT_BETTER_MAX
      ? 'better'
      : pct <= STATION_PCT_SLIGHTLY_WORSE_MAX
        ? 'slightly_worse'
        : 'worse';
  return { fraction: Math.max(MIN_BAR_HEIGHT, Math.min(1, pct)), severity };
}

// ── Stored-row → summary ─────────────────────────────────────────────────────

// Exported so the sibling rich-history reader (lib/races/athlete-races.ts) projects
// from the SAME row shape — one definition of the structured history projection.
export interface RaceHistoryRow {
  id: string;
  name: string;
  // null for an official single-URL import with no machine date (0072); to_char
  // of a NULL date yields NULL, sorted last by the history query.
  race_date: string | null;
  event_type: string;
  format: string;
  division: string;
  gender_category: string;
  age_group: string | null;
  location: string | null;
  result_time_seconds: number | null;
  run_total_seconds: number | null;
  roxzone_seconds: number | null;
  best_run_lap_seconds: number | null;
  overall_rank: number | null;
  age_group_rank: number | null;
  field_size: number | null;
  source: string;
  source_season: string | null;
  run_splits_json: unknown;
  station_splits_json: unknown;
  partners_json: unknown;
}

/** Parse the stored station_splits_json into the validated split list. */
function parseStationSplits(raw: unknown): HyroxStationSplit[] {
  const parsed = z.array(hyroxStationSplitSchema).max(8).safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}

/** Parse the stored run_splits_json into an ordered list of lap seconds. */
function parseRunSplits(raw: unknown): number[] {
  const parsed = z.array(z.number().int().min(0).max(7200)).max(8).safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}

/** Sum the 8 station seconds (skipping nulls). Null when none are present. */
function stationsTotalSeconds(splits: HyroxStationSplit[]): number | null {
  const present = splits.map((s) => s.seconds).filter((s): s is number => s != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

/**
 * Project one stored race row → RaceResultSummary. `previousSeconds` is the
 * finish time of the athlete's immediately-prior race (chronologically), used for
 * delta_vs_previous; null when this is their first/only race.
 */
function toSummary(row: RaceHistoryRow, previousSeconds: number | null): RaceResultSummaryDTO {
  const stationSplits = parseStationSplits(row.station_splits_json);
  const finish = row.result_time_seconds;
  const delta =
    finish != null && previousSeconds != null
      ? signedDeltaStr(finish - previousSeconds)
      : null;

  return {
    id: row.id,
    event_name: row.name,
    date: row.race_date ?? HERO_DATE_UNKNOWN,
    division: divisionLabel(row.division),
    total_time: timeStr(finish),
    run_time: timeStr(row.run_total_seconds),
    stations_time: timeStr(stationsTotalSeconds(stationSplits)),
    roxzone_time: timeStr(row.roxzone_seconds),
    standing_label: standingLabel(row.overall_rank, row.field_size),
    delta_vs_previous: delta,
    total_seconds: finish ?? null,
  };
}

// ── Stored-row → history item (structured contract) ──────────────────────────

/** Parse the joined race_partners array into the validated teammate list. */
function parsePartners(raw: unknown): RacePartner[] {
  const parsed = z.array(racePartnerSchema).safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}

/**
 * Project one stored race row → the structured `raceHistoryItemSchema` contract
 * (singles AND doubles/relay). `percentile` is derived (overall_rank / field_size,
 * clamped 0..1) exactly as the importer computes it; `is_team_result` is
 * format !== 'singles'. Validated against the shared schema so the response IS
 * the contract, not whatever we happened to build.
 */
export function toHistoryItem(row: RaceHistoryRow): RaceHistoryItem | null {
  const percentile =
    row.overall_rank != null && row.field_size != null && row.field_size > 0
      ? Math.min(1, Math.max(0, row.overall_rank / row.field_size))
      : null;

  // safeParse (not .parse): a single malformed stored row (e.g. a 0-second
  // finish, or a location >200 chars) must degrade to OMISSION, never throw and
  // 500 the whole /race-context response. Invalid rows are filtered out by the
  // caller; valid rows are untouched.
  const parsed = raceHistoryItemSchema.safeParse({
    race_id: Number(row.id),
    name: row.name,
    race_date: row.race_date,
    location: row.location,
    event_type: row.event_type,
    format: row.format,
    division: row.division,
    gender_category: row.gender_category,
    age_group: row.age_group,
    result_time_seconds: row.result_time_seconds,
    run_total_seconds: row.run_total_seconds,
    roxzone_seconds: row.roxzone_seconds,
    best_run_lap_seconds: row.best_run_lap_seconds,
    overall_rank: row.overall_rank,
    age_group_rank: row.age_group_rank,
    field_size: row.field_size,
    percentile,
    run_splits: parseRunSplits(row.run_splits_json),
    station_splits: parseStationSplits(row.station_splits_json),
    is_team_result: row.format !== 'singles',
    partners: parsePartners(row.partners_json),
    source: row.source,
    source_season: row.source_season,
  });
  return parsed.success ? parsed.data : null;
}

// ── Builder ───────────────────────────────────────────────────────────────--

/**
 * Build the Carreras hub overview for an athlete from their imported HYROX
 * results. Returns an honest-empty overview when the athlete has none.
 */
export async function buildCarrerasOverview(
  args: { athlete_id: number | bigint },
  client: Sql = defaultSql,
): Promise<CarrerasOverviewDTO> {
  const athleteId = Number(args.athlete_id);

  // The athlete's WHOLE race history, most recent first — singles AND
  // doubles/relay. Includes every imported race plus any manually-logged result
  // (a manual row with no result is an upcoming/target race, not history).
  // Teammates are LEFT JOINed from race_partners and aggregated to an array
  // ordered by position ([] for singles). Ordered by race_date DESC NULLS LAST so
  // an official single-URL import with no machine date (race_date null, 0072) sinks
  // to the bottom instead of floating above real-dated history; imported_at then
  // disambiguates ties deterministically. `group by r.id` (the PK) lets us project
  // every r.* column alongside the aggregate.
  const rows = await client<RaceHistoryRow[]>`
    select
      r.id::text                          as id,
      r.name,
      to_char(r.race_date, 'YYYY-MM-DD')  as race_date,
      r.event_type::text                  as event_type,
      r.format::text                      as format,
      r.division::text                    as division,
      r.gender_category::text             as gender_category,
      r.age_group,
      r.location,
      r.result_time_seconds,
      r.run_total_seconds,
      r.roxzone_seconds,
      r.best_run_lap_seconds,
      r.overall_rank,
      r.age_group_rank,
      r.field_size,
      r.source,
      r.source_season,
      r.run_splits_json,
      r.station_splits_json,
      coalesce(
        json_agg(
          json_build_object(
            'name', rp.name,
            'slug', rp.slug,
            'nation', rp.nation,
            'position', rp.position
          ) order by rp.position
        ) filter (where rp.race_id is not null),
        '[]'::json
      )                                   as partners_json
    from races r
    left join race_partners rp on rp.race_id = r.id
    where r.athlete_id = ${athleteId}
      and (
        r.source in ('hyrox_import', 'hyresult_import')
        or (r.source = 'manual' and r.result_time_seconds is not null)
      )
    group by r.id
    order by r.race_date desc nulls last, r.imported_at desc nulls last, r.id desc
  `;

  // The full structured history (the iOS Carreras hub's race list). A row that
  // fails the contract is omitted (toHistoryItem → null), never fatal.
  const history: RaceHistoryItem[] = rows
    .map(toHistoryItem)
    .filter((item): item is RaceHistoryItem => item !== null);

  // Hero summary + per-station benchmarks + running splits are the athlete's OWN
  // performance, so they come from SINGLES imports — either import route. The
  // filter used to accept `hyrox_import` alone, which is the legacy single-URL
  // route; everyone whose history came in by name from hyresult (0071) had no
  // "última carrera" at all. Every sibling reader of this spine (race-transfer,
  // station-detail, goal-gap, dobles-*) already accepts both, and `format` is
  // what keeps team results out — a doubles split is the TEAM's time, not the
  // athlete's, so it must never drive this deep-dive.
  const importRows = rows.filter(
    (r) =>
      (r.source === 'hyrox_import' || r.source === 'hyresult_import') && r.format === 'singles',
  );

  if (importRows.length === 0) {
    return {
      last_race: null,
      ia_report: null,
      station_benchmarks: [],
      station_comparison_note: null,
      running_splits: [],
      pace_drop_note: null,
      history,
    };
  }

  const latest = importRows[0];
  // delta_vs_previous compares to the athlete's immediately-prior official import.
  const last_race = toSummary(latest, importRows[1]?.result_time_seconds ?? null);

  // ── station_benchmarks: the latest race's 8 stations, in canonical order ────
  // `delta` is now the PERSONAL transfer signal: this station's race split vs the
  // athlete's own TRAINED level (observed practice or the zone-profile estimate),
  // expressed in the same full-split seconds as `time`. Null when the athlete has
  // no trained evidence for the station (honest — never a fabricated reference).
  // The rank-derived fraction + severity stay as the field-relative reading.
  const transfer = await buildRaceTransfer({ athlete_id: athleteId }, client);
  // index → trained level (native unit); erg values are per-500m, so ×2 to reach
  // the full 1 km split that `time` shows.
  const trainedFullByIndex = new Map<number, number>();
  const ERG_SPLIT_FACTOR = ERG_RACE_SPLIT_METERS / ERG_PACE_UNIT_METERS; // = 2
  for (const s of transfer.stations) {
    if (s.trained.value_s == null || s.trained.unit == null) continue;
    const full = s.trained.unit === 'per_500m' ? s.trained.value_s * ERG_SPLIT_FACTOR : s.trained.value_s;
    trainedFullByIndex.set(s.index, full);
  }

  const latestStationSplits = parseStationSplits(latest.station_splits_json);
  const station_benchmarks: StationBenchmarkDTO[] = latestStationSplits.map((st) => {
    const trainedFull = trainedFullByIndex.get(st.index);
    // delta = race split − trained level (positive = slower in the race than trained).
    const delta =
      st.seconds != null && trainedFull != null ? signedDeltaStr(st.seconds - trainedFull) : null;
    const field = stationFieldReading(st.rank, latest.field_size);
    return {
      id: `station_${st.index}`,
      station: HYROX_STATION_LABELS[st.index] ?? `Estación ${st.index}`,
      time: timeStr(st.seconds),
      delta,
      fraction: field.fraction,
      severity: field.severity,
    };
  });
  // The section explains itself when NO station could be placed in the field.
  const station_comparison_note =
    station_benchmarks.length > 0 && station_benchmarks.every((b) => b.fraction == null)
      ? STATION_NO_COMPARISON_NOTE
      : null;

  // ── running_splits: the latest race's 8×1 km laps ───────────────────────────
  const runLaps = parseRunSplits(latest.run_splits_json);
  let running_splits: RunningSplitDTO[] = [];
  let pace_drop_note: string | null = null;

  // `worst > 0` guards an all-zero lap array: zero-second laps are not laps, and
  // a chart normalized against 0 could only be drawn by inventing a height.
  if (runLaps.length > 0 && Math.max(...runLaps) > 0) {
    const best = Math.min(...runLaps);
    const worst = Math.max(...runLaps);
    // Bars: taller = slower (per the iOS handoff). Normalize to the slowest lap.
    running_splits = runLaps.map((lap, i) => ({
      id: `k${i + 1}`,
      label: `k${i + 1}`,
      pace: timeStr(lap),
      height: Math.max(MIN_BAR_HEIGHT, Math.min(1, lap / worst)),
      severity: lapSeverity(lap, best),
    }));

    // Final-drift callout: second-half average lap vs first-half.
    if (runLaps.length >= 4) {
      const mid = Math.floor(runLaps.length / 2);
      const firstAvg = runLaps.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const secondAvg =
        runLaps.slice(mid).reduce((a, b) => a + b, 0) / (runLaps.length - mid);
      const drift = Math.round(secondAvg - firstAvg);
      if (drift >= SPLIT_DRIFT_NOTE_S_PER_KM) {
        pace_drop_note = `Caída de ritmo en la segunda mitad (+${drift}s/km)`;
      }
    }
  }

  return {
    last_race,
    // No IA report is generated on import — honest null keeps the view's empty
    // state rather than fabricating a weakness summary.
    ia_report: null,
    station_benchmarks,
    station_comparison_note,
    running_splits,
    pace_drop_note,
    history,
  };
}
