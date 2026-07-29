// Athlete ANALYTICS — shared core: period model, honesty (availability) labels,
// the unified wire shape, and the formatting + modality helpers every section
// reuses. ONE source of truth for "the window", "the honesty tag" and "the
// number→string" rules so the five sections + the drill-down can never drift.
//
// Design ground truth: docs/superpowers/plans/analiticas-tab.html. Two patterns
// run through every section: a PERIOD SELECTOR (7d/mes/año/custom = the `where`
// window) and DRILL-DOWN (every aggregate opens its REAL source sessions). No
// number is ever fabricated: when a metric is not measurable yet it is null with
// an honest `availability` tag, never a fake value.


// ── Honesty model (mirrors the doc's 5-tag legend) ───────────────────────────
//
//   real            → our data + HealthKit, measurable today.
//   needs_logging   → the schema exists, the athlete just hasn't logged enough.
//   needs_wearable  → needs partner wearable APIs (legal-entity gated).
//   field           → needs the licensed HYROX field dataset (percentile).
//   gate            → the model doesn't exist yet → an invitation, not a number.
export type Availability = 'real' | 'needs_logging' | 'needs_wearable' | 'field' | 'gate';

export type SectionKey = 'running' | 'ergo' | 'strength' | 'hyrox' | 'recovery';

// ── Period model ─────────────────────────────────────────────────────────────
//
// Rolling windows (the fitness-analytics standard: Strava "last 4 weeks"), so a
// sparse log never shows an empty calendar month. '7d'/'month'/'year' are the
// last 7/30/365 days; 'custom' is an explicit [from, to]. The window is applied
// identically to every temporal aggregate AND to its drill-down, so the list
// behind a number is always exactly the rows that produced it.
export type PeriodKey = '7d' | 'month' | 'year' | 'custom';

export interface ResolvedPeriod {
  key: PeriodKey;
  start_iso: string;
  end_iso: string;
  label_es: string;
  days: number;
}

const PERIOD_DAYS: Record<Exclude<PeriodKey, 'custom'>, number> = {
  '7d': 7,
  month: 30,
  year: 365,
};
const PERIOD_LABEL: Record<Exclude<PeriodKey, 'custom'>, string> = {
  '7d': '7 días',
  month: 'mes',
  year: 'año',
};
// Hard ceiling on a custom range so a pathological from/to can't scan forever.
const CUSTOM_MAX_DAYS = 366 * 6;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a query into a concrete window. Invalid custom inputs fall back to the
 * 30-day window rather than throwing — the endpoint validates and 400s on bad
 * input; this stays defensive for internal callers.
 */
export function resolvePeriod(input: {
  key?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): ResolvedPeriod {
  const now = input.now ?? new Date();
  const key = (input.key ?? 'month') as PeriodKey;

  if (key === 'custom') {
    const from = parseDay(input.from);
    const to = parseDay(input.to);
    if (from && to && from.getTime() <= to.getTime()) {
      const days = Math.min(
        CUSTOM_MAX_DAYS,
        Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1,
      );
      const end = new Date(to.getTime() + 86_400_000 - 1); // inclusive end-of-day
      return {
        key: 'custom',
        start_iso: from.toISOString(),
        end_iso: end.toISOString(),
        label_es: `${isoDay(from)} → ${isoDay(to)}`,
        days,
      };
    }
    // bad custom range → safe default
  }

  const days = PERIOD_DAYS[(key in PERIOD_DAYS ? key : 'month') as keyof typeof PERIOD_DAYS];
  const start = new Date(now.getTime() - days * 86_400_000);
  return {
    key: key in PERIOD_DAYS ? key : 'month',
    start_iso: start.toISOString(),
    end_iso: now.toISOString(),
    label_es: PERIOD_LABEL[(key in PERIOD_DAYS ? key : 'month') as keyof typeof PERIOD_LABEL],
    days,
  };
}

function parseDay(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(`${s.trim()}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

// ── Unified wire shape (snake_case — iOS Codable contract) ────────────────────

/** A tappable aggregate's link to its real source rows. `count` is ALWAYS the
 *  true number of rows behind the number (never padded). The drill-down endpoint
 *  re-runs the same window with `kind`+`params` and returns that exact list. */
export interface DrillRef {
  kind: string;
  params: Record<string, string>;
  count: number;
  label_es: string;
}

export interface CardRow {
  id: string;
  label: string;
  value: string | null;
  sub: string | null;
  accent: boolean;
  drill: DrillRef | null;
}

export interface CardSeriesPoint {
  id: string;
  /** Normalised 0..1 bar height (taller = bigger magnitude). */
  height: number;
  /** Pre-formatted display value for the point (pace/time/number). */
  display: string | null;
  /** The most-recent / current point, accented in the UI. */
  current: boolean;
  label: string | null;
}

export interface CardZone {
  code: string;
  label: string;
  color: string;
  /** Pre-formatted value (e.g. "18 km" or "4:10–4:31"). */
  value: string | null;
  /** Share of the period 0..100, null when not a distribution. */
  pct: number | null;
  drill: DrillRef | null;
}

export interface AnalyticsCard {
  id: string;
  title_es: string;
  availability: Availability;
  availability_note: string | null;
  /** Hero number (e.g. "84" + "km", with an optional side stat). */
  primary: {
    value: string | null;
    unit: string | null;
    side: { value: string; label: string } | null;
  } | null;
  rows: CardRow[];
  series: CardSeriesPoint[];
  /** How the series renders in the app: a trend/progression 'line' (with an area
   *  fill + emphasized endpoint) or a volume 'bars'. Null when there is no series
   *  (or for pre-series_kind cached payloads — the client falls back by card id). */
  series_kind: 'line' | 'bars' | null;
  /** Line-chart y-axis end labels — the REAL formatted values at the series'
   *  lowest (bottom) and highest (top) plotted points. Never fabricated: both come
   *  from an actual point's `display`. Null when a series can't yield both. */
  series_axis: { min_display: string; max_display: string } | null;
  zones: CardZone[];
  meaning_es: string | null;
  drill: DrillRef | null;
}

export interface AnalyticsSection {
  section: SectionKey;
  title_es: string;
  availability: Availability;
  period: ResolvedPeriod;
  cards: AnalyticsCard[];
}

// ── Drill-down wire shape ────────────────────────────────────────────────────

export interface SourceSession {
  id: string;
  /** YYYY-MM-DD of the session/test/race. Null only for an undated import. */
  date: string | null;
  title_es: string;
  detail_es: string | null;
  /** Headline figure for the row (pace/time). */
  value: string | null;
  value_label: string | null;
  // The workout_assignment this row belongs to, when the drill's rows come from an
  // execution (workout_executions.assignment_id is NOT NULL, so it always resolves
  // there). Lets the client open the existing session detail from a drill row.
  // Absent/null for drills whose rows are NOT execution-backed — a 5k benchmark
  // test, the 1RM history, race segments, transfer stations, recovery readings.
  assignment_id?: string | null;
}

export interface DrillDownResult {
  kind: string;
  title_es: string;
  subtitle_es: string | null;
  summary: Array<{ id: string; value: string; label: string; accent: boolean }>;
  sessions: SourceSession[];
  /** The real table the rows came from — shown in the sheet footer. */
  source_table: string;
  period: ResolvedPeriod;
}

// ── Card builder helper ──────────────────────────────────────────────────────

export function card(partial: Partial<AnalyticsCard> & Pick<AnalyticsCard, 'id' | 'title_es' | 'availability'>): AnalyticsCard {
  return {
    availability_note: null,
    primary: null,
    rows: [],
    series: [],
    series_kind: null,
    series_axis: null,
    zones: [],
    meaning_es: null,
    drill: null,
    ...partial,
  };
}

/**
 * Derive a line chart's y-axis end labels from a built series: the REAL formatted
 * value at the lowest plotted point (bottom) and at the highest (top). Never
 * fabricates — both strings come straight from a point's `display`. Returns null
 * when the series has <2 points or either extreme lacks a display, so the client
 * simply omits y labels. Kept here so every section derives axis labels the same
 * way, from the SAME heights already normalized into the series.
 */
export function seriesAxis(
  points: CardSeriesPoint[],
): { min_display: string; max_display: string } | null {
  if (points.length < 2) return null;
  let lo = points[0]!;
  let hi = points[0]!;
  for (const p of points) {
    if (p.height < lo.height) lo = p;
    if (p.height > hi.height) hi = p;
  }
  if (lo.display == null || hi.display == null) return null;
  return { min_display: lo.display, max_display: hi.display };
}

// ── Formatting helpers (single source for number→string) ─────────────────────

export function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
export function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/** Seconds → "m:ss" (pace per km/500m, or short station/run times). */
export function paceStr(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Seconds → "h:mm:ss" when ≥1h else "m:ss" (race finish / long efforts). */
export function clockStr(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return null;
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Metres → "x.y km". Null/zero-safe. */
export function kmStr(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return null;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Signed delta "−1:02" / "+0:18" — negative = faster/lower. */
export function deltaStr(sec: number): string {
  const sign = sec < 0 ? '−' : sec > 0 ? '+' : '';
  const abs = Math.abs(Math.round(sec));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

/** Monday (ISO, UTC) of the week containing a YYYY-MM-DD day. Single source for
 *  the weekly-bucket key every section's volume/trend series share. */
export function isoWeekStart(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

/** "24 jun" from a YYYY-MM-DD. */
export function dayMonthEs(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const day = Number(m[3]);
  const mon = MONTHS_ES[Number(m[2]) - 1] ?? '';
  return `${day} ${mon}`;
}

// La resolución de modalidad y el predicado de «esto cuenta como trabajo» viven
// juntos en `@/lib/execution/segment-work` — se re-exporta aquí para no romper a
// quien ya importaba `SEG_MODALITY_SQL` desde el core de analítica.
export { SEG_IS_WORK_EFFORT, SEG_MODALITY_SQL } from '@/lib/execution/segment-work';
