// Per-station deep-dive — the data layer behind GET /api/athlete/stations/[station].
//
// Builds the `StationDetail` bundle for ONE of the 8 HYROX work stations from the
// athlete's IMPORTED HYROX results (`races` rows where source is an imported
// source — 'hyrox_import' | 'hyresult_import' — AND format='singles'; doubles/
// relay station splits are TEAM-level, not this athlete's, so they never feed the
// individual per-station deep-dive), keyed by the canonical 16-element
// `station_index` (2,4,…,16 — see
// STATION_INDEX_STATION in shared/schema/race-plan). Output shape mirrors the iOS
// `StationDetail` Codable contract (snake_case; pre-formatted display strings).
//
// HONEST NULLS / EMPTY — nothing is fabricated:
//   • last_time / benchmark_time / delta / fraction / percentile_label → only
//     when the athlete has imported races that recorded this station. The
//     "benchmark" is the athlete's OWN best (fastest) time for this station
//     across their imports — there is no division-benchmark table in the DB, so
//     inventing one would be dishonest. delta = last vs that best.
//   • trend → this station's time across every imported race (oldest→newest);
//     empty with 0 races, one bar with 1 race.
//   • sub_metrics → best / average / races counted / last station-rank, each
//     null when not derivable.
//   • training → the methodology group(s) that train this station. STATIC,
//     domain-defined linkage (not per-athlete counts), so count is null — we
//     surface "what trains it", not a fabricated "×N times trained".
//   • technique_video_url → projected from exercises.video_url of the matching
//     station exercise. Null today (no videos seeded) → honest placeholder.
//   • ia_recommendation / ia_objective → null (IA deferred).
//
// A station that never appears in any import returns an honest-empty detail
// (200, last_time null, empty trend/sub_metrics) — the training links + video
// still populate from the static catalogue so the screen is never blank.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { HYROX_STATION_LABELS, STATION_INDEX_STATION } from '@fahybrid/shared/schema';

// ── Wire contract (matches iOS StationDetail) ───────────────────────────────

export interface StationTrendPointDTO {
  id: string;
  label: string;
  height: number;
  time: string | null;
  severity: 'better' | 'slightly_worse' | 'worse';
}

export interface StationSubMetricDTO {
  id: string;
  label: string;
  value: string | null;
  unit: string | null;
  emphasis: 'neutral' | 'warning' | 'danger' | 'ok' | null;
}

export interface TrainingLinkDTO {
  id: string;
  title: string;
  group: string | null;
  count: string | null;
  next_label: string | null;
  modality: string | null;
}

export interface StationDetailDTO {
  id: string;
  station: string;
  technique_video_url: string | null;
  last_time: string | null;
  benchmark_time: string | null;
  delta: string | null;
  severity: 'better' | 'slightly_worse' | 'worse';
  fraction: number;
  percentile_label: string | null;
  trend: StationTrendPointDTO[];
  sub_metrics: StationSubMetricDTO[];
  training: TrainingLinkDTO[];
  ia_recommendation: string | null;
  ia_objective: string | null;
}

type Severity = 'better' | 'slightly_worse' | 'worse';

// ── Station catalogue (single source of truth for this endpoint) ─────────────
//
// One entry per HYROX work station. `index` is the canonical station_index
// (2,4,…,16) used in races.station_splits_json[].index. `position` is the 1-8
// exercises.hyrox_station_position (= index / 2). `slug` is the canonical
// exercise slug (verified against the live `exercises` table). `groups` are the
// methodology_groups (by stable PK 1-10, see migration 0030) whose focus trains
// this station — domain-defined, not heuristic. `modality` colours the iOS dot.
// `aliases` are the lowercased label forms the iOS sends ("Sled push", "Row 1km",
// "Rowing", …) so the route resolves any of them to the same station.

interface StationEntry {
  index: number;
  position: number;
  slug: string;
  /** Display label shown in the detail header (canonical race-plan label). */
  label: string;
  /** Methodology group PKs (1-10) that train this station. */
  groups: number[];
  /** iOS modality dot colour: 'erg' | 'strength' | 'run'. */
  modality: 'erg' | 'strength';
  /** Lowercased label forms the client may send for this station. */
  aliases: string[];
}

// Build the canonical label per station from the shared HYROX_STATION_LABELS so
// the header text never drifts from the race-plan / overview surfaces.
const labelFor = (index: number): string => HYROX_STATION_LABELS[index] ?? `Station ${index}`;

const STATION_CATALOGUE: readonly StationEntry[] = [
  {
    index: STATION_INDEX_STATION[0], // 2
    position: 1,
    slug: 'ski-erg',
    label: labelFor(STATION_INDEX_STATION[0]), // "SkiErg 1km"
    groups: [3, 7], // Ergómetros · Simulaciones
    modality: 'erg',
    aliases: ['skierg 1km', 'skierg', 'ski erg', 'ski-erg', 'skierg 1000m'],
  },
  {
    index: STATION_INDEX_STATION[1], // 4
    position: 2,
    slug: 'hyrox-sled-push',
    label: labelFor(STATION_INDEX_STATION[1]), // "Sled push"
    groups: [1, 2], // Fuerza Base · Explosiva
    modality: 'strength',
    aliases: ['sled push', 'sled push 50m', 'hyrox sled push'],
  },
  {
    index: STATION_INDEX_STATION[2], // 6
    position: 3,
    slug: 'hyrox-sled-pull',
    label: labelFor(STATION_INDEX_STATION[2]), // "Sled pull"
    groups: [1, 9], // Fuerza Base · Circuitos Funcionales
    modality: 'strength',
    aliases: ['sled pull', 'sled pull 50m', 'hyrox sled pull'],
  },
  {
    index: STATION_INDEX_STATION[3], // 8
    position: 4,
    slug: 'hyrox-burpee-broad-jump',
    label: labelFor(STATION_INDEX_STATION[3]), // "Burpee broad jump 80m"
    groups: [2, 6], // Explosiva / Pliométrica · WODs
    modality: 'strength',
    aliases: [
      'burpee broad jump 80m',
      'burpee broad jump',
      'burpee broad jumps',
      'burpees broad jump',
    ],
  },
  {
    index: STATION_INDEX_STATION[4], // 10
    position: 5,
    slug: 'row',
    label: labelFor(STATION_INDEX_STATION[4]), // "Row 1km"
    groups: [3, 7], // Ergómetros · Simulaciones
    modality: 'erg',
    aliases: ['row 1km', 'rowing', 'row', 'row 1000m', 'rowing 1km'],
  },
  {
    index: STATION_INDEX_STATION[5], // 12
    position: 6,
    slug: 'hyrox-farmer-carry',
    label: labelFor(STATION_INDEX_STATION[5]), // "Farmer carry 200m"
    groups: [1, 9], // Fuerza Base · Circuitos Funcionales
    modality: 'strength',
    aliases: [
      'farmer carry 200m',
      'farmer carry',
      'farmers carry',
      'farmers carry 200m',
      "farmer's carry",
    ],
  },
  {
    index: STATION_INDEX_STATION[6], // 14
    position: 7,
    slug: 'hyrox-sandbag-lunges',
    label: labelFor(STATION_INDEX_STATION[6]), // "Sandbag lunge 200m"
    groups: [9, 1], // Circuitos Funcionales · Fuerza Base
    modality: 'strength',
    aliases: [
      'sandbag lunge 200m',
      'sandbag lunge',
      'sandbag lunges',
      'sandbag lunges 100m',
      'sandbag lunges 200m',
    ],
  },
  {
    index: STATION_INDEX_STATION[7], // 16
    position: 8,
    slug: 'hyrox-wall-balls',
    label: labelFor(STATION_INDEX_STATION[7]), // "Wall ball 100"
    groups: [6, 9], // WODs · Circuitos Funcionales
    modality: 'strength',
    aliases: ['wall ball 100', 'wall ball', 'wall balls', 'wallballs', 'wall balls 100'],
  },
] as const;

/**
 * Resolve a client-supplied station label (already URL-decoded) to its catalogue
 * entry. Tolerant: case-insensitive, whitespace-collapsed, matches the canonical
 * label or any known alias. Returns null for anything that isn't one of the 8
 * work stations (the route → 404), so a typo or a run label never silently maps
 * to the wrong station.
 */
export function resolveStation(raw: string): StationEntry | null {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!norm) return null;
  for (const entry of STATION_CATALOGUE) {
    if (entry.label.toLowerCase() === norm) return entry;
    if (entry.aliases.includes(norm)) return entry;
  }
  return null;
}

// ── Constants ───────────────────────────────────────────────────────────────

// Trend / sub-metric severity bands, expressed as a fraction slower than the
// athlete's own best for this station. ≤3% over best → "better"; ≤10% →
// "slightly_worse"; beyond → "worse". (Tighter than running's 4%: a station is a
// short fixed effort, so a 3%+ regression is meaningful.)
const SEVERITY_BETTER_MAX = 0.03;
const SEVERITY_SLIGHTLY_WORSE_MAX = 0.1;
// Cap on how many trend bars the iOS strip shows (most recent N races).
const TREND_MAX_BARS = 8;
// Minimum bar height so a near-best bar is still visible.
const MIN_BAR_HEIGHT = 0.15;

// Map a methodology group PK → its iOS modality dot. Ergometer groups read as
// 'erg'; everything else inherits the station's own modality.
const GROUP_MODALITY_OVERRIDE: Readonly<Record<number, 'erg'>> = { 3: 'erg' };

// ── Formatting helpers ────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/** Seconds → "m:ss" (station times are minutes-scale, never hours). Null-safe. */
function timeStr(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Signed delta "−0:08" / "+0:42" / "0:00". Negative = faster than reference. */
function deltaStr(seconds: number): string {
  const sign = seconds < 0 ? '−' : seconds > 0 ? '+' : '';
  const abs = Math.abs(Math.round(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

/** Classify a station time against the athlete's best for the same station. */
function severityVsBest(timeSec: number, bestSec: number): Severity {
  if (bestSec <= 0) return 'worse';
  const over = (timeSec - bestSec) / bestSec;
  if (over <= SEVERITY_BETTER_MAX) return 'better';
  if (over <= SEVERITY_SLIGHTLY_WORSE_MAX) return 'slightly_worse';
  return 'worse';
}

// Spanish month abbreviations for the trend bar caption fallback (when the
// station has no parseable time but we still want a label).
const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];
function monthLabel(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const idx = Number(m[2]) - 1;
  return MONTHS_ES[idx] ?? isoDate;
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

interface RaceRow {
  // null for an official single-URL import with no machine date (0072); such a
  // race can't be placed on the per-station time-trend, so it's skipped below.
  race_date: string | null;
  field_size: number | null;
  station_splits_json: Array<{ index: number; seconds: number | null; rank: number | null }> | null;
}

interface VideoRow {
  video_url: string | null;
}

// One station observation pulled out of a race's splits.
interface Observation {
  date: string;
  seconds: number;
  rank: number | null;
  field_size: number | null;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export async function buildStationDetail(
  args: { athlete_id: number | bigint; station: StationEntry },
  client: Sql = defaultSql,
): Promise<StationDetailDTO> {
  const athleteId = Number(args.athlete_id);
  const { station } = args;

  // technique_video_url: the matching station exercise's video. Projected from
  // the real column — null when unseeded (honest placeholder on iOS).
  const videoRows = await client<VideoRow[]>`
    select video_url
    from exercises
    where slug = ${station.slug}
    limit 1
  `;
  const technique_video_url = videoRows[0]?.video_url ?? null;

  // All imported HYROX results for this athlete, oldest→newest. station_splits is
  // the canonical 8-element array; we pluck this station's entry by index.
  const raceRows = await client<RaceRow[]>`
    select
      to_char(race_date, 'YYYY-MM-DD') as race_date,
      field_size,
      station_splits_json
    from races
    where athlete_id = ${athleteId}
      and source in ('hyrox_import', 'hyresult_import')
      and format = 'singles'
      and station_splits_json is not null
    order by race_date asc, id asc
  `;

  // Reduce each race to a single observation for THIS station (skip races where
  // the station is absent or has null seconds — that race simply didn't record
  // this station, so it contributes nothing rather than a fake zero).
  const observations: Observation[] = [];
  for (const r of raceRows) {
    // An undated official import (race_date null, 0072) has no position on the
    // chronological trend and must not become the "latest" observation — skip it.
    if (r.race_date == null) continue;
    const splits = Array.isArray(r.station_splits_json) ? r.station_splits_json : [];
    const split = splits.find((s) => s && s.index === station.index);
    const seconds = num(split?.seconds);
    if (seconds == null || seconds <= 0) continue;
    observations.push({
      date: r.race_date,
      seconds,
      rank: num(split?.rank),
      field_size: num(r.field_size),
    });
  }

  // training[] — STATIC, domain-defined. Always present so the screen surfaces
  // "what trains this station" even with zero races. count/next_label null (we
  // do not fabricate per-athlete training counts here; the linkage is the value).
  const groupRows =
    station.groups.length > 0
      ? await client<Array<{ id: number; name_es: string; slug: string; sort_order: number }>>`
          select id, name_es, slug, sort_order
          from methodology_groups
          where id in ${client(station.groups)}
          order by sort_order asc
        `
      : [];
  const training: TrainingLinkDTO[] = groupRows.map((g) => ({
    id: g.slug,
    title: g.name_es,
    // "G03 · Series de Ergómetros" — the coach-facing group chip.
    group: `G${String(g.id).padStart(2, '0')} · ${g.name_es}`,
    count: null,
    next_label: null,
    modality: GROUP_MODALITY_OVERRIDE[g.id] ?? station.modality,
  }));

  // Honest-empty: no recorded observations for this station.
  if (observations.length === 0) {
    return {
      id: station.label,
      station: station.label,
      technique_video_url,
      last_time: null,
      benchmark_time: null,
      delta: null,
      severity: 'better',
      fraction: 0,
      percentile_label: null,
      trend: [],
      sub_metrics: [],
      training,
      ia_recommendation: null,
      ia_objective: null,
    };
  }

  const last = observations[observations.length - 1]!;
  const times = observations.map((o) => o.seconds);
  const best = Math.min(...times);
  const slowest = Math.max(...times);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;

  // Hero: last vs the athlete's own best. delta = last − best (≥0); severity vs
  // best; fraction = best/last (bar fills toward 1 as last approaches best).
  const lastVsBest = last.seconds - best;
  const heroSeverity = severityVsBest(last.seconds, best);
  const fraction = last.seconds > 0 ? Math.max(0, Math.min(1, best / last.seconds)) : 0;

  // percentile_label from THIS station's rank in the most-recent race / its field
  // size → "top N%". Null when either is missing (honest).
  let percentile_label: string | null = null;
  if (last.rank != null && last.field_size != null && last.field_size > 0) {
    const pct = Math.min(100, Math.max(1, Math.round((last.rank / last.field_size) * 100)));
    percentile_label = `top ${pct}%`;
  }

  // trend[]: most recent TREND_MAX_BARS races, oldest→newest. Bars taller =
  // slower (per the iOS handoff): normalize each time to the slowest observed.
  const trendObs = observations.slice(-TREND_MAX_BARS);
  const trend: StationTrendPointDTO[] = trendObs.map((o, i) => ({
    id: `${o.date}-${i}`,
    label: monthLabel(o.date),
    height: slowest > 0 ? Math.max(MIN_BAR_HEIGHT, Math.min(1, o.seconds / slowest)) : MIN_BAR_HEIGHT,
    time: timeStr(o.seconds),
    severity: severityVsBest(o.seconds, best),
  }));

  // sub_metrics: best / average / races counted / last station-rank. emphasis
  // colours only the rows that read as a result (best = ok); the rest neutral.
  const sub_metrics: StationSubMetricDTO[] = [
    { id: 'best', label: 'MEJOR', value: timeStr(best), unit: null, emphasis: 'ok' },
    { id: 'avg', label: 'MEDIA', value: timeStr(avg), unit: null, emphasis: 'neutral' },
    {
      id: 'races',
      label: 'CARRERAS',
      value: String(observations.length),
      unit: observations.length === 1 ? 'carrera' : 'carreras',
      emphasis: 'neutral',
    },
    {
      id: 'last_rank',
      label: 'PUESTO ÚLTIMA',
      value: last.rank != null ? `#${last.rank}` : null,
      unit: last.field_size != null ? `de ${last.field_size}` : null,
      emphasis: 'neutral',
    },
  ];

  return {
    id: station.label,
    station: station.label,
    technique_video_url,
    last_time: timeStr(last.seconds),
    benchmark_time: timeStr(best),
    delta: deltaStr(lastVsBest),
    severity: heroSeverity,
    fraction,
    percentile_label,
    trend,
    sub_metrics,
    training,
    ia_recommendation: null,
    ia_objective: null,
  };
}
