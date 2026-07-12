// ANALYTICS · CARGA DE ENTRENAMIENTO — the athlete's own view of the load engine
// the coach already reads (shared/domain/training-load, via @/lib/training-load).
// ONE engine, one truth: internal load = RPE × duration → TSS → Banister
// CTL(fitness)/ATL(fatigue)/TSB(freshness). We surface only two athlete-legible
// cards, both gated honestly on logged RPE:
//   • Forma         — the TSB trend (12 weeks) + a plain-Spanish reading.
//   • Carga semanal — weekly TSS volume bars: is the load ramping up or easing.
//
// Deliberately NOT an ACWR card: the recovery section already has "Carga aguda vs
// crónica", and that one reads a DIFFERENT source — the HealthKit workout-duration
// marker stream (biometric_streams metric_type='training_load' = external volume,
// gated on wearable sync). This module is INTERNAL perceived load (RPE), gated on
// logged RPE. Two honest, complementary readings; we never show the same number
// twice, and the copy always says which is which.
//
// The acronyms TSB/CTL/ATL never reach the UI — only "forma", "carga", "fatiga".

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { computeLoadSeries, getDailyTssSeries } from '@/lib/training-load';
import type { DailyTss, LoadPoint } from '@/lib/training-load';
import {
  type AnalyticsCard,
  type CardSeriesPoint,
  type ResolvedPeriod,
  card,
  dayMonthEs,
  isoWeekStart,
  seriesAxis,
} from './core';

// ── Windows ──────────────────────────────────────────────────────────────────
// Show the last 12 weeks of form. CTL has a 42-day time constant, so we compute
// over a 90-day warm-up BEFORE the shown window (the same stabilization the
// coach's getLoadSummary uses) and only plot the tail — otherwise the first weeks
// would ramp from a cold zero and read as fake "fatigue".
const DISPLAY_DAYS = 84; // 12 weeks plotted
const WARMUP_DAYS = 90; // CTL settle before the plotted window
const LOAD_WEEKS = 12; // weekly-volume bars

// Honesty gate: below this many RPE-tagged sessions inside the shown window the
// load story is mostly guessed (the engine falls back to a default intensity when
// RPE is absent), so we show a "needs_logging" card instead of a soft number.
const MIN_RPE_SESSIONS = 6;

// Bar/line floor so a real-but-tiny value still renders as a sliver, never 0-height.
const MIN_BAR = 0.08;

// ── Forma (freshness) reading zones ──────────────────────────────────────────
// TSB = fitness − fatigue. Bands follow the TrainingPeaks / Coggan Performance-
// Manager convention, relabelled in plain Spanish. Ordered high→low; the first
// band whose `min` the value clears wins.
type FormZone = { key: string; min: number; label: string; reading: string };

const FORM_ZONES: readonly FormZone[] = [
  {
    key: 'muy_fresco',
    min: 20,
    label: 'Muy fresco',
    reading:
      'Estás muy descansado, con poca fatiga acumulada. A punto para competir; si no compites pronto, toca volver a cargar.',
  },
  {
    key: 'fresco',
    min: 5,
    label: 'Fresco',
    reading: 'Estás fresco y a punto: buen momento para un test o una competición.',
  },
  {
    key: 'equilibrio',
    min: -10,
    label: 'En equilibrio',
    reading:
      'Carga y descanso están compensados: entrenas de forma sostenida sin acumular fatiga.',
  },
  {
    key: 'en_carga',
    min: -30,
    label: 'En carga',
    reading:
      'Estás en carga: entrenando fuerte y acumulando fatiga. Es lo normal dentro de un bloque exigente.',
  },
  {
    key: 'fatiga_alta',
    min: Number.NEGATIVE_INFINITY,
    label: 'Fatiga alta',
    reading:
      'Llevas bastante fatiga acumulada. Cuida el descanso para que la carga acabe cuajando en forma.',
  },
];

export function formZone(tsb: number): FormZone {
  for (const z of FORM_ZONES) if (tsb >= z.min) return z;
  return FORM_ZONES[FORM_ZONES.length - 1]!;
}

// Display bounds for the form line (NOT physiological limits — just the plotted
// scale). Anchoring to a FIXED range keeps the line honest: a steady TSB near 0
// sits mid-height and a −30 sinks toward the floor, instead of min-max stretching
// a flat fortnight into a dramatic swing.
const FORM_SCALE_MIN = -40;
const FORM_SCALE_MAX = 30;

function normForm(tsb: number): number {
  const t = (tsb - FORM_SCALE_MIN) / (FORM_SCALE_MAX - FORM_SCALE_MIN);
  return Math.max(MIN_BAR, Math.min(1, t));
}

// ── Weekly-volume trend (±8% counts as steady) ───────────────────────────────
const TREND_FLAT = 0.08;

function weeklyTrendLabel(weekly: readonly WeeklyLoad[]): string {
  if (weekly.length < 3) return 'Estable';
  const split = Math.max(1, Math.floor(weekly.length / 3));
  const recent = weekly.slice(-split).map((w) => w.tss);
  const earlier = weekly.slice(0, weekly.length - split).map((w) => w.tss);
  const r = avg(recent);
  const e = earlier.length ? avg(earlier) : r;
  if (e <= 0) return r > 0 ? 'Subiendo' : 'Estable';
  const rel = (r - e) / e;
  if (rel > TREND_FLAT) return 'Subiendo';
  if (rel < -TREND_FLAT) return 'Bajando';
  return 'Estable';
}

// ── Pure card builders (no DB — trivially testable) ──────────────────────────

export type WeeklyLoad = { week: string; tss: number };

/** Forma = the TSB trend over the shown window + the current plain-Spanish state. */
export function buildFormCard(tail: readonly LoadPoint[], hasEnoughRpe: boolean): AnalyticsCard {
  if (!hasEnoughRpe || tail.length < 2) {
    return card({
      id: 'form',
      title_es: 'Forma',
      availability: 'needs_logging',
      availability_note: 'Registra el esfuerzo (RPE) de tus entrenos para ver tu forma.',
      meaning_es:
        'Tu forma cruza la condición que construyes con el cansancio reciente. Necesita unas semanas de entrenos con su esfuerzo anotado.',
    });
  }
  const series: CardSeriesPoint[] = tail.map((p, i) => {
    const z = formZone(p.tsb);
    return {
      id: p.date,
      height: normForm(p.tsb),
      display: z.label,
      current: i === tail.length - 1,
      label: p.date,
    };
  });
  const current = formZone(tail[tail.length - 1]!.tsb);
  return card({
    id: 'form',
    title_es: 'Forma',
    availability: 'real',
    primary: { value: current.label, unit: null, side: null },
    series,
    series_kind: 'line',
    series_axis: seriesAxis(series),
    meaning_es: current.reading,
  });
}

/** Carga semanal = weekly internal-load (RPE) volume, as bars, with a trend word. */
export function buildWeeklyLoadCard(
  weekly: readonly WeeklyLoad[],
  hasEnoughRpe: boolean,
): AnalyticsCard {
  if (!hasEnoughRpe || weekly.length < 2) {
    return card({
      id: 'weekly_load',
      title_es: 'Carga semanal',
      availability: 'needs_logging',
      availability_note: 'Registra el esfuerzo (RPE) de tus entrenos para ver tu carga semanal.',
      meaning_es:
        'Cuánto entrenas cada semana, según la duración y tu esfuerzo (RPE). Necesita unas semanas de registro.',
    });
  }
  const maxTss = Math.max(1, ...weekly.map((w) => w.tss));
  const series: CardSeriesPoint[] = weekly.map((w, i) => ({
    id: w.week,
    height: Math.max(MIN_BAR, Math.min(1, w.tss / maxTss)),
    display: `${Math.round(w.tss)}`,
    current: i === weekly.length - 1,
    label: dayMonthEs(w.week),
  }));
  return card({
    id: 'weekly_load',
    title_es: 'Carga semanal',
    availability: 'real',
    primary: { value: weeklyTrendLabel(weekly), unit: null, side: null },
    series,
    series_kind: 'bars',
    series_axis: null,
    meaning_es:
      'Cuánto entrenas cada semana, según la duración y tu esfuerzo (RPE). Sube y baja el volumen de forma progresiva: los saltos bruscos son los que pasan factura.',
  });
}

// ── Weekly bucketing (shared isoWeekStart key) ───────────────────────────────

export function weeklyBuckets(daily: readonly DailyTss[]): WeeklyLoad[] {
  const by = new Map<string, number>();
  for (const d of daily) {
    const wk = isoWeekStart(d.date);
    by.set(wk, (by.get(wk) ?? 0) + d.tss);
  }
  return [...by.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([week, tss]) => ({ week, tss }));
}

// ── DB-backed entry (reuses the coach's engine — one source of truth) ────────

export async function buildLoadCards(
  args: { athlete_id: number | bigint; period: ResolvedPeriod },
  client: Sql = defaultSql,
): Promise<AnalyticsCard[]> {
  const athleteId = Number(args.athlete_id);
  // Anchor the window to the section's period end, like the recovery ACWR card —
  // a custom historical range computes form up to that end, not to "now".
  const end = new Date(args.period.end_iso);

  const daily = await getDailyTssSeries({
    athlete_id: athleteId,
    end_date: end,
    days: WARMUP_DAYS + DISPLAY_DAYS,
    client,
  });
  const series = computeLoadSeries(daily);
  const tail = series.slice(-DISPLAY_DAYS);
  const weekly = weeklyBuckets(daily.slice(-DISPLAY_DAYS)).slice(-LOAD_WEEKS);

  const rpeCount = await countRpeSessions(client, athleteId, end, DISPLAY_DAYS);
  const hasEnoughRpe = rpeCount >= MIN_RPE_SESSIONS;

  return [buildFormCard(tail, hasEnoughRpe), buildWeeklyLoadCard(weekly, hasEnoughRpe)];
}

async function countRpeSessions(
  client: Sql,
  athleteId: number,
  end: Date,
  days: number,
): Promise<number> {
  const start = new Date(end.getTime() - days * 86_400_000);
  const rows = await client<Array<{ n: number }>>`
    select count(*)::int as n
    from workout_executions we
    where we.athlete_id = ${athleteId}
      and we.perceived_exertion is not null
      and coalesce(we.ended_at, we.started_at, we.created_at) >= ${start.toISOString()}
      and coalesce(we.ended_at, we.started_at, we.created_at) <= ${end.toISOString()}
  `;
  return rows[0]?.n ?? 0;
}

function avg(xs: readonly number[]): number {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
}
