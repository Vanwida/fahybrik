import 'server-only';

// Training × race CROSS — the data layer behind the HYROX "transfer" surfaces.
//
// Fetches the athlete's rows (their latest SINGLES race with splits, their
// training efforts by modality + station exercise, their zone-profile thresholds)
// and hands them to the pure `computeRaceTransfer` (shared/domain/race-transfer),
// which owns every rule (erg ÷2 normalization, fresh vs fatigued, evidence tiers,
// the transfer delta). Nothing is computed here that the pure module can compute.
//
// COMPETED SIDE — `singles` races only. Doubles/relay station splits are the
// TEAM's, not this athlete's, so they never feed the cross (the query filters
// them out; the result carries an honest `only_doubles` gate when that's all the
// athlete has).
//
// TRAINED SIDE — three tiers, best first: `observado` (real segment_executions:
// run/ski/row by modality → pace; the 6 functional stations by exercise identity
// → practice duration, split fresh vs fatigued), `estimado` (the zone-profile
// threshold, run/ski/row only), else `sin_datos`. The station↔exercise map reuses
// STATION_CATALOGUE — no second mapping.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  computeRaceTransfer,
  type ObservedEffort,
  type RaceTransferResult,
  type StationKind,
  type StationTransfer,
  type StationTransferInput,
  type TransferUnit,
} from '@fahybrid/shared/domain/race-transfer';
import { STATION_CATALOGUE, type StationEntry } from './station-detail';

export type { RaceTransferResult } from '@fahybrid/shared/domain/race-transfer';

// The run on foot — the 9th cross target, not a HYROX station (index 0 sentinel).
const RUN_ENTRY = {
  index: 0,
  slug: 'run',
  label: 'Carrera a pie',
} as const;

// Modalities that carry a zone-profile threshold usable as the `estimado` tier.
const PACED_MODALITIES = ['run', 'ski', 'row'] as const;
type PacedModality = (typeof PACED_MODALITIES)[number];

/** Map a catalogue entry to its cross kind: ski/row are erg (paced), the other 6
 *  functional stations compare a practice duration. */
function kindForStation(entry: StationEntry): Exclude<StationKind, 'run'> {
  if (entry.slug === 'ski-erg') return 'ski';
  if (entry.slug === 'row') return 'row';
  return 'functional';
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

interface RaceRow {
  id: string;
  name: string;
  race_date: string | null;
  run_splits_json: unknown;
  station_splits_json: unknown;
}

interface ModalityEffortRow {
  modality: string;
  pace_s: string | null;
  context_format: string | null;
  prior_work_s: number | null;
  position: number;
}

interface StationEffortRow {
  position_station: number; // exercises.hyrox_station_position (2,3,4,6,7,8)
  duration_s: string | null;
  context_format: string | null;
  prior_work_s: number | null;
  position: number; // segment position within the execution
}

interface ThresholdRow {
  modality: string;
  threshold_s: string;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/** Parse a stored run_splits_json into an ordered lap-seconds array. */
function parseRunSplits(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => toNum(n)).filter((n): n is number => n != null);
}

/** Parse a stored station_splits_json into {index, seconds} pairs. */
function parseStationSplits(raw: unknown): Array<{ index: number; seconds: number | null }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ index: number; seconds: number | null }> = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const idx = toNum((s as { index?: unknown }).index);
    if (idx == null) continue;
    out.push({ index: idx, seconds: toNum((s as { seconds?: unknown }).seconds) });
  }
  return out;
}

/**
 * Build the training × race cross for one athlete. Honest gates: `only_doubles`
 * when the athlete has races but none singles; `no_singles_race` when none at all.
 */
export async function buildRaceTransfer(
  args: { athlete_id: number | bigint },
  client: Sql = defaultSql,
): Promise<RaceTransferResult> {
  const athleteId = Number(args.athlete_id);

  // ── Competed side: the latest SINGLES race with splits (doubles excluded) ────
  const raceRows = await client<RaceRow[]>`
    select id::text as id, name, to_char(race_date, 'YYYY-MM-DD') as race_date,
      run_splits_json, station_splits_json
    from races
    where athlete_id = ${athleteId}
      and format = 'singles'
      and source in ('hyrox_import', 'hyresult_import')
      and station_splits_json is not null
    order by race_date desc nulls last, id desc
    limit 1
  `;
  const raceRow = raceRows[0] ?? null;

  // Distinguish "no races" from "only doubles" for the honest gate.
  let onlyDoubles = false;
  if (!raceRow) {
    const doublesRows = await client<Array<{ n: number }>>`
      select count(*)::int as n
      from races
      where athlete_id = ${athleteId}
        and format <> 'singles'
        and source in ('hyrox_import', 'hyresult_import')
        and station_splits_json is not null
    `;
    onlyDoubles = (doublesRows[0]?.n ?? 0) > 0;
  }

  // ── Trained side: modality efforts (run/ski/row → a pace) ────────────────────
  const modalityRows = await client<ModalityEffortRow[]>`
    select
      se.modality,
      (case se.modality
        when 'run' then se.avg_pace_s_per_km
        else se.avg_pace_s_per_500m
      end)::text as pace_s,
      se.context_format,
      se.prior_work_s,
      se.position
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${athleteId}
      and se.modality in ('run', 'ski', 'row')
      and (case se.modality
        when 'run' then se.avg_pace_s_per_km
        else se.avg_pace_s_per_500m
      end) is not null
  `;

  // ── Trained side: functional station efforts (by station exercise → duration) ─
  // Match the movement via exercises.hyrox_station_position (2,3,4,6,7,8 = the 6
  // functional stations; 1/5 = ski/row are modality-paced above). Duration is the
  // real segment span; unmeasurable spans are excluded, never fabricated.
  const stationRows = await client<StationEffortRow[]>`
    select
      ex.hyrox_station_position as position_station,
      extract(epoch from (se.ended_at - se.started_at))::text as duration_s,
      se.context_format,
      se.prior_work_s,
      se.position
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    join exercises ex on ex.id = se.exercise_id
    where we.athlete_id = ${athleteId}
      and ex.hyrox_station_position in (2, 3, 4, 6, 7, 8)
      and se.started_at is not null
      and se.ended_at is not null
      and se.ended_at > se.started_at
  `;

  // ── Trained side: zone-profile thresholds (latest per modality → `estimado`) ─
  const thresholdRows = await client<ThresholdRow[]>`
    select distinct on (modality) modality, threshold_s::text as threshold_s
    from athlete_zone_profiles
    where athlete_id = ${athleteId} and modality in ('run', 'ski', 'row')
    order by modality, version desc
  `;
  const thresholdByModality = new Map<PacedModality, number>();
  for (const t of thresholdRows) {
    const v = toNum(t.threshold_s);
    if (v != null && PACED_MODALITIES.includes(t.modality as PacedModality)) {
      thresholdByModality.set(t.modality as PacedModality, v);
    }
  }

  // Group efforts for O(1) lookup while assembling the station defs.
  const modalityEfforts = new Map<PacedModality, ObservedEffort[]>();
  for (const r of modalityRows) {
    const value = toNum(r.pace_s);
    if (value == null) continue;
    const mod = r.modality as PacedModality;
    const list = modalityEfforts.get(mod) ?? [];
    list.push({ value_s: value, context_format: r.context_format, prior_work_s: r.prior_work_s, position: r.position });
    modalityEfforts.set(mod, list);
  }
  const stationEfforts = new Map<number, ObservedEffort[]>();
  for (const r of stationRows) {
    const value = toNum(r.duration_s);
    if (value == null) continue;
    const list = stationEfforts.get(r.position_station) ?? [];
    list.push({ value_s: value, context_format: r.context_format, prior_work_s: r.prior_work_s, position: r.position });
    stationEfforts.set(r.position_station, list);
  }

  // ── Assemble the 9 cross targets: the run, then the 8 stations in order ───────
  const stations: StationTransferInput[] = [];

  stations.push({
    index: RUN_ENTRY.index,
    slug: RUN_ENTRY.slug,
    label: RUN_ENTRY.label,
    kind: 'run',
    race_index: null, // uses the run-lap mean
    observed: modalityEfforts.get('run') ?? [],
    threshold_s: thresholdByModality.get('run') ?? null,
  });

  for (const entry of STATION_CATALOGUE) {
    const kind = kindForStation(entry);
    let observed: ObservedEffort[];
    let threshold: number | null;
    if (kind === 'ski' || kind === 'row') {
      observed = modalityEfforts.get(kind) ?? [];
      threshold = thresholdByModality.get(kind) ?? null;
    } else {
      observed = stationEfforts.get(entry.position) ?? [];
      threshold = null; // no threshold for functional stations
    }
    stations.push({
      index: entry.index,
      slug: entry.slug,
      label: entry.label,
      kind,
      race_index: entry.index,
      observed,
      threshold_s: threshold,
    });
  }

  return computeRaceTransfer({
    race: raceRow
      ? {
          id: Number(raceRow.id),
          name: raceRow.name,
          date: raceRow.race_date,
          run_splits: parseRunSplits(raceRow.run_splits_json),
          station_splits: parseStationSplits(raceRow.station_splits_json),
        }
      : null,
    only_doubles: onlyDoubles,
    stations,
  });
}

// ── Display formatting (shared by the card / station-detail / carreras wiring) ─

/** Unit suffix for a trained/competed pace value. */
export function transferUnitSuffix(unit: TransferUnit): string {
  if (unit === 'per_km') return '/km';
  if (unit === 'per_500m') return '/500m';
  return ''; // functional seconds carry no per-distance suffix
}

/** Seconds → "m:ss" (pace or short duration). Null-safe. */
export function transferTimeStr(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const t = Math.round(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** A trained/competed value formatted with its unit, e.g. "1:52/500m", "5:45". */
export function transferValueStr(seconds: number | null | undefined, unit: TransferUnit): string | null {
  const t = transferTimeStr(seconds);
  return t == null ? null : `${t}${transferUnitSuffix(unit)}`;
}

/** Transfer delta as a signed percentage, e.g. "+34%" / "−5%" / "±0%". Null-safe. */
export function transferDeltaPctStr(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '±';
  return `${sign}${Math.abs(pct)}%`;
}

/** ES display label for a tier chip. The machine tier stays 'estimado'; the copy
 *  reads "umbral" since that tier is now always the zone-profile threshold. */
export function transferTierLabel(tier: 'observado' | 'estimado' | 'sin_datos'): string {
  if (tier === 'observado') return 'observado';
  if (tier === 'estimado') return 'umbral';
  return 'sin datos';
}

// One station's cross, pre-formatted for a per-station surface (station-detail).
// Additive, all snake_case + optional — safe for the iOS StationDetail decode,
// which whitelists its CodingKeys and ignores unknown wire keys.
export interface StationTransferEvidenceDTO {
  /** Which evidence backs the trained level: 'observado' | 'estimado' | 'sin_datos'. */
  tier: string;
  /** Trained level, pre-formatted with its unit, e.g. "1:52/500m" or "5:00". */
  trained_value: string | null;
  /** This athlete's competed value in the comparison basis (erg = per 500 m). */
  race_value: string | null;
  /** Observed fresh vs fatigued means (observado only), pre-formatted. */
  fresco: string | null;
  fatigado: string | null;
  /** Count of classified training efforts behind the trained level. */
  n_efforts: number;
  /** Transfer delta, e.g. "+34%" (positive = slower in the race than trained). */
  delta_pct: string | null;
}

/** Format one station's cross entry into its display DTO (unit-consistent). */
export function stationTransferEvidence(entry: StationTransfer): StationTransferEvidenceDTO {
  // entry.unit is the station's canonical unit (== trained.unit when present).
  const t = entry.trained;
  return {
    tier: transferTierLabel(t.tier),
    trained_value: t.value_s != null ? transferValueStr(t.value_s, entry.unit) : null,
    race_value: entry.race_seconds != null ? transferValueStr(entry.race_seconds, entry.unit) : null,
    fresco: t.contexto?.fresco_s != null ? transferValueStr(t.contexto.fresco_s, entry.unit) : null,
    fatigado: t.contexto?.fatigado_s != null ? transferValueStr(t.contexto.fatigado_s, entry.unit) : null,
    n_efforts: t.n_efforts,
    delta_pct: transferDeltaPctStr(entry.transfer_delta_pct),
  };
}
