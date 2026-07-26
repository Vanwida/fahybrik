// v2 · ATLETA · DETALLE — client-safe types, tab enum + pure selectors. This
// module has NO `server-only` / DB imports so it can be imported by both the
// server orchestrator (atleta-detalle.ts) and the client components (tab bar,
// orchestrator). The DB-touching loader lives in atleta-detalle.ts and re-exports
// from here.

import type { MessageDTO } from '@/lib/chat/schema';
import type { V2Status } from '@/components/v2/StatusDot';
import type {
  AthleteLifecycleStatus,
  PauseReason,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import type { WeekdayKey } from '@fahybrid/shared/domain/coach/intake-availability';
import type { AthleteResumen } from '@/lib/dashboard/coach/resumen';
import type { AthletePlanPayload } from '@/lib/dashboard/coach/athlete-plan';
import type { BodyPayload } from '@/lib/dashboard/coach/deep-dive-body';
import type { AthleteSubscriptionStatus } from '@/lib/dashboard/coach/subscription-status';
import type { AthleteBilling, AthleteInvoice } from '@/lib/coach/billing';
import type { JointSession } from '@/lib/dashboard/coach/athlete-profile-shell';
import type { SessionReportView } from '@/lib/coach/session-reports';
import type { AthleteReviewState } from '@/lib/citas/reviews';
import type { AthleteZoneProfile } from '@fahybrid/shared/schema/methodology-system';
import {
  BENCH_BACK_SQUAT_1RM,
  BENCH_RUN_5K,
  BENCH_ROW_2K,
  benchmarkLabel,
  benchmarkMetric,
  type BenchmarkMetric,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import {
  MODALITY_LABEL as ZONE_MODALITY_LABEL,
  formatZoneRange,
  groupProfilesForCalculator,
  paceUnitLabel,
  type ProfileModality,
} from '@/lib/dashboard/v2/zone-view';

// ── Strength · 1RM (client-safe view of athlete_strength_maxes) ─────────────────
// The current resolved 1RM per lift + its version history, shaped for the Perfil
// tab. Mirrors the server AthleteStrengthMax but stays a plain view type so this
// (client-safe) module needs no server-only / schema import.
export interface StrengthMaxView {
  exercise_slug: string;
  exercise_label: string;
  one_rm_kg: number;
  version: number;
  recorded_at: string;
  source: string;
  /** All versions for this lift, oldest→newest, for the progression delta. */
  history: { one_rm_kg: number; version: number; recorded_at: string }[];
}

/** Shared placeholder for a missing value — a muted "—", never a fake number. */
export const EM_DASH = '—';

// ── Benchmark test results (client-safe view of athlete_benchmarks) ─────────────
// A benchmark = a reference test with a recorded RESULT + history (run 5k, row 2k,
// pull-ups, …). Distinct from in-WOD segment durations: a segment time inside a
// workout is NOT a test result. The unit decides how the value reads (see
// benchmarkMetric). Strength 1RMs live in athlete_strength_maxes (versioned), so
// kg benchmarks are never sourced from here — single source per concept.
export interface BenchmarkResult {
  value: number;
  recorded_at: string;
}
export interface BenchmarkSeries {
  exercise_slug: string;
  label: string;
  /** Stored unit ('seconds' | 'reps' | 'kg') — drives time/reps/load rendering. */
  unit: string;
  /** Results oldest→newest, for the progression delta. */
  results: BenchmarkResult[];
}

// ── Progresión de tests (Histórico) — real reference tests only ────────────────
// One row per test with ≥2 data points (first vs latest). Strength is kg, pace is
// time (mm:ss), rep tests are a count. `improved` lights the delta color
// (faster/heavier/more = ok); `delta_label` is the pre-formatted signed change.
export interface TestProgressionRow {
  key: string;
  label: string;
  before: string;
  after: string;
  /** Signed, pre-formatted change ("−0:12", "+5 kg", "+3"); null = single point / no change. */
  delta_label: string | null;
  /** true = improvement, false = regression, null = no change (muted). */
  improved: boolean | null;
}

// ── Sub-tab identity (the ?tab= query value) ────────────────────────────────────
export const ATLETA_TABS = ['perfil', 'plan', 'ritmos', 'carreras', 'historico', 'sesiones', 'biometria', 'rendimiento', 'pagos', 'mensajes'] as const;
export type AtletaTab = (typeof ATLETA_TABS)[number];
export const DEFAULT_ATLETA_TAB: AtletaTab = 'perfil';

export function normalizeAtletaTab(raw: string | undefined): AtletaTab {
  return (ATLETA_TABS as readonly string[]).includes(raw ?? '')
    ? (raw as AtletaTab)
    : DEFAULT_ATLETA_TAB;
}

// ── Lifecycle (#13) — the ficha's pause/baja/re-alta context ─────────────────────
// The state that drives the header actions + the banner. DISTINCT from billing: it
// says whether the coach is currently coaching the athlete, independent of Stripe.
// Single shape shared by the server read (loadAthleteLifecycleDetail) and the client
// surfaces (LifecycleControl / LifecycleBanner), so it lives in this client-safe module.
export interface DetalleLifecycle {
  /** activo | pausado | baja. */
  status: AthleteLifecycleStatus;
  /** Open pause reason code when pausado, else null. */
  pause_reason: PauseReason | null;
  /** ISO YYYY-MM-DD the current pause started, else null. */
  paused_since: string | null;
  /** ISO YYYY-MM-DD planned return ("vuelve el"), null = indefinite / n/a. */
  planned_return: string | null;
  /** Authorship of the current pause (#43): who opened it + which actor kind, for the
   *  "X pausó · hace Y" sello. null when unattributed (historical / athlete-requested). */
  paused_by_name: string | null;
  paused_by_kind: 'coach' | 'athlete' | null;
  /** ISO instant the athlete went baja, else null. */
  baja_at: string | null;
  /** Baja reason code, else null. */
  baja_reason: PauseReason | null;
  /** Authorship of the baja (#43): the coach who gave it, for the "X dio de baja" sello.
   *  null when unattributed (historical rows before the registry). */
  baja_by_name: string | null;
  /** A PENDING athlete-initiated pause request awaiting the coach, else null. Only an
   *  activo athlete can have one (the requestPause guard). */
  pending_request: { request_id: string; reason: PauseReason } | null;
}

// ── Header / identity projection ────────────────────────────────────────────────
export interface DetalleHeader {
  athlete_id: string;
  full_name: string;
  /** Real level name from athlete_levels.name (e.g. 'N1'–'N5'); null = not assigned. */
  level: string | null;
  status: V2Status;
  status_label: string;
  /** "alta hace 3 meses" style relative tenure, null when unknown. */
  tenure_label: string | null;
  /** "Acumulación · sem 4" style current phase label, null when no plan. */
  phase_label: string | null;
  modality_label: string | null;
  /** Lifecycle state (#13) — drives the header actions + the pause/baja/request banner. */
  lifecycle: DetalleLifecycle;
  /** Authorship sello (#43): who did the alta + last profile edit, and when (ISO).
   *  Fields are null when unattributed (historical rows before the team registry). */
  authored: {
    alta_by_name: string | null;
    alta_at: string | null;
    edited_by_name: string | null;
    edited_at: string | null;
  };
}

// ── Stat cluster (the 4 header StatTiles) ──────────────────────────────────────
export interface DetalleStat {
  label: string;
  value: string;
  tone: 'fg' | 'ok' | 'warn' | 'danger' | 'info';
}

// ── Clasificación (Perfil tab) — the two axes the assignment resolver needs ─────
// An athlete becomes assignable once BOTH level_id and training_days_per_week are
// set. This block carries the current values, the algorithmic level suggestion
// (when the coach hasn't confirmed one), the coach's full level set for the
// picker, and the valid days band — so nivel + días live in ONE place.
export interface ClasificacionLevelOption {
  id: string;
  /** Short code shown as the chip, e.g. "N1". */
  name: string;
  /** Human-readable label, e.g. "Iniciación". */
  label: string;
}

export interface ClasificacionData {
  level_id: string | null;
  level_name: string | null;
  suggested_level_id: string | null;
  suggested_level_name: string | null;
  /** Short human "por qué" for the suggestion (e.g. "Mejor HYROX real 1:02:30 →
   *  N4"). Null when there's nothing to explain, or outside the intake review
   *  (only that surface enriches it — see loadIntakeReview). */
  suggested_level_reason: string | null;
  training_days_per_week: number | null;
  /** The coach's levels, ordered, for the picker. */
  levels: ClasificacionLevelOption[];
  /** Inclusive valid band for días/semana (from the shared sequence schema). */
  days_band: { min: number; max: number };
}

// ── Días de entreno · reales (#47) — the athlete's OWN declared weekly pattern ──
// Read from athletes.availability_json ({mon..sun -> program|other_activity|rest},
// Step 5 onboarding / iOS "Mis días"). Distinct from ClasificacionData's plain
// training_days_per_week (the coach's declared TARGET count): this resolves WHICH
// days, from the athlete's own input. Always visible in the ficha (permanent
// context, independent of the active tab) — read-only for the coach.
export interface TrainingDayCell {
  key: WeekdayKey;
  /** Short label, e.g. "Lun". */
  label: string;
  /** Full label for a11y/tooltips, e.g. "Lunes". */
  full_label: string;
  /** True = the athlete marked this day `program` (a real training day). */
  trains: boolean;
}

export interface TrainingDaysData {
  /** Always 7 cells, Monday→Sunday. */
  days: TrainingDayCell[];
  /** Program-day count when the athlete declared availability, else the coach's
   *  plain training_days_per_week as a fallback. Null when neither exists. */
  training_days_per_week: number | null;
  /** True when the athlete has actually declared per-day availability. False →
   *  `days` carries no real signal (every cell `trains: false`) and the card
   *  renders an honest empty state instead of guessing which days from the
   *  plain count (Step 5 is skippable; the column defaults to '{}'). */
  has_availability: boolean;
}

// ── The unified payload the page passes to the client ──────────────────────────
export interface V2AthleteDetalle {
  header: DetalleHeader;
  stats: DetalleStat[];
  /** Nivel + días/semana — the assignment classification (Perfil tab). */
  classification: ClasificacionData;
  /** Measured max HR (bpm); null = never measured. Read-only on the Perfil tab. */
  max_hr_bpm: number | null;
  /** Días de entreno reales (#47) — the athlete's own declared weekly pattern.
   *  Always visible in the ficha header zone, independent of the active tab. */
  training_days: TrainingDaysData;
  resumen: AthleteResumen | null;
  plan: AthletePlanPayload | null;
  body: BodyPayload | null;
  subscription: AthleteSubscriptionStatus | null;
  /** Pagos tab (#15): the athlete's current billing (agreed price, status, next
   *  renewal, comp flag). null = no subscription at all → "Sin cobro configurado". */
  billing: AthleteBilling | null;
  /** Pagos tab (#15): mirrored Stripe invoice history, newest first. Empty = none. */
  invoices: AthleteInvoice[];
  /** Primer tramo de la conversación, del más viejo al más nuevo; null si el hilo
   *  no se pudo cargar. Es el MISMO DTO que devuelve la API y que llega por el
   *  canal en vivo, adjuntos incluidos — el panel no traduce nada. */
  chat: { thread_id: string; messages: MessageDTO[] } | null;
  /** Current versioned zone profiles per modality (Ritmos/Zonas tab). Empty = no
   *  test yet. READ from athlete_zone_profiles — the calculator never recomputes. */
  zone_profiles: AthleteZoneProfile[];
  /** Current 1RM per lift + version history (Perfil tab · Fuerza). Empty = no max
   *  yet. READ from athlete_strength_maxes — never recomputed. */
  strength_maxes: StrengthMaxView[];
  /** Reference-test results + history per slug (Perfil cards + Histórico
   *  progression). Empty = no test recorded. READ from athlete_benchmarks — never
   *  derived from in-WOD segment durations. */
  benchmarks: BenchmarkSeries[];
  /** JOINT "Entrenar juntos" sessions (viewed athlete's result vs the partner's,
   *  per shared session), newest first. Empty = none. Rendered in the Histórico
   *  tab as a real side-by-side card. */
  joint_sessions: JointSession[];
  /** 1:1 session reports (#14) — this athlete's coaching calls + the sales calls of the
   *  lead it converted from (follow-the-person). Newest first. Rendered in the Sesiones tab. */
  sessions: SessionReportView[];
  /** Revisiones 1:1 recurrentes (#21): cadencia, última revisión, próxima reservada,
   *  propuesta pendiente y si toca (due). null si el load degradó. Alimenta el panel al
   *  frente del tab 1:1. */
  review: AthleteReviewState | null;
}

// Re-export so the client tab components import the type from this client-safe
// module (never from the server-only shell). `export type` is erased at compile,
// so no server code reaches the client bundle.
export type { JointSession };
export type { AthleteReviewState };

// ── Tests de referencia (Perfil tab, left column) ──────────────────────────────
export interface ReferenceTest {
  slug: string;
  icon: string;
  label: string;
  /** Resolved value string (e.g. "21:40 · 4:20/km") or null when no result. */
  value: string | null;
  /** ISO date of the result, or null. */
  date_iso: string | null;
}

// ── Zonas de entrenamiento (Perfil tab, right column) ──────────────────────────
// The resolver's output, GROUPED BY MODALITY so the panel reads as separate
// sections (Remo / Ski-Erg / Bike-Erg / Carrera) instead of one flat list.
// AGNOSTIC: the zone `code` is the stored band code, never a hardcoded
// Z2/umbral/ATR vocabulary.
export interface DerivedZone {
  /** Stored band code (e.g. "Z1"), shown as the row label. */
  code: string;
  /** Absolute resolved range + unit (e.g. "2:15–2:30 /500m"), or null. */
  target: string | null;
  /** True when the coach hand-adjusted this band (no per-band override yet → false). */
  adjusted: boolean;
}

export interface DerivedObjectiveGroup {
  modality: ProfileModality;
  /** Coach-facing modality name (Remo / Ski-Erg / Bike-Erg / Carrera). */
  modality_label: string;
  zones: DerivedZone[];
}

export interface PerfilTabData {
  reference_tests: ReferenceTest[];
  /** Resolved zone targets grouped by modality (Perfil tab · Zonas de entrenamiento). */
  objective_groups: DerivedObjectiveGroup[];
  /** Profile version count (resolver versions athlete profiles on re-test). */
  profile_version: number | null;
  /** Strength maxes (1RM per lift + history) for the Fuerza · 1RM section. */
  strength_maxes: StrengthMaxView[];
  /** Measured max HR (bpm); null = never measured → the row is omitted (honest-null). */
  max_hr_bpm: number | null;
}

const SECONDS_PER_MINUTE = 60;

function fmtTime(s: number | null): string | null {
  if (s == null) return null;
  const m = Math.floor(s / SECONDS_PER_MINUTE);
  const sec = Math.round(s % SECONDS_PER_MINUTE);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Render one metric value in its native unit. */
function fmtMetricValue(value: number, metric: BenchmarkMetric): string {
  if (metric === 'time') return fmtTime(Math.round(value)) ?? EM_DASH;
  if (metric === 'load') return `${Math.round(value)} kg`;
  return `${Math.round(value)}`; // reps
}

/** Pre-format a signed metric change ("−0:12", "+5 kg", "+3"). */
function fmtDeltaLabel(delta: number, metric: BenchmarkMetric): string {
  const sign = delta > 0 ? '+' : '−';
  const abs = Math.abs(delta);
  if (metric === 'time') return `${sign}${fmtTime(Math.round(abs)) ?? '0:00'}`;
  if (metric === 'load') return `${sign}${Math.round(abs)} kg`;
  return `${sign}${Math.round(abs)}`;
}

/**
 * "Progresión de tests" rows — REAL reference tests only, first vs latest:
 *  · strength 1RM (kg, versioned) from athlete_strength_maxes → higher is better
 *  · pace / endurance / rep benchmarks from athlete_benchmarks → time lower-better,
 *    reps higher-better
 * kg benchmarks are skipped (strength is the single kg source — never double-count),
 * and a test needs ≥2 data points to show a delta. Never derived from in-WOD
 * segment durations. Pure — safe in the client bundle.
 */
export function buildTestProgression(
  strength_maxes: StrengthMaxView[] = [],
  benchmarks: BenchmarkSeries[] = [],
): TestProgressionRow[] {
  const rows: TestProgressionRow[] = [];

  for (const m of strength_maxes) {
    if (m.history.length < 2) continue;
    const first = m.history[0]!;
    const last = m.history[m.history.length - 1]!;
    const delta = Math.round(last.one_rm_kg - first.one_rm_kg);
    rows.push({
      key: `s:${m.exercise_slug}`,
      label: m.exercise_label,
      before: fmtMetricValue(first.one_rm_kg, 'load'),
      after: fmtMetricValue(last.one_rm_kg, 'load'),
      delta_label: delta === 0 ? null : fmtDeltaLabel(delta, 'load'),
      improved: delta === 0 ? null : delta > 0,
    });
  }

  for (const b of benchmarks) {
    if (b.results.length < 2) continue;
    const metric = benchmarkMetric(b.unit);
    if (metric === 'load') continue; // kg sourced from strength_maxes above
    const first = b.results[0]!;
    const last = b.results[b.results.length - 1]!;
    const delta = Math.round(last.value - first.value);
    const improved = delta === 0 ? null : metric === 'time' ? delta < 0 : delta > 0;
    rows.push({
      key: `b:${b.exercise_slug}`,
      label: b.label,
      before: fmtMetricValue(first.value, metric),
      after: fmtMetricValue(last.value, metric),
      delta_label: delta === 0 ? null : fmtDeltaLabel(delta, metric),
      improved,
    });
  }

  return rows;
}

/**
 * Derived zone targets = the absolute zone bands the resolver already produced from
 * the athlete's tests (the stored athlete_zone_profiles snapshot), GROUPED BY
 * MODALITY. This is the test → profile → absolute-targets chain: each modality's
 * threshold (test) in → its resolved bands out. We surface those bands verbatim —
 * never inventing a target — ordered ergo (row/ski/bike) then run, one group per
 * modality, each zone by sort_order.
 *
 * AGNOSTIC: labels come from the stored `code` + the modality, never a hardcoded
 * Z2/umbral/ATR vocabulary. `adjusted` stays false — this model has no per-band
 * manual override yet, so we don't fake one.
 */
function deriveObjectiveGroups(zone_profiles: AthleteZoneProfile[]): DerivedObjectiveGroup[] {
  const { ergo, run } = groupProfilesForCalculator(zone_profiles);
  const ordered = [...ergo, ...run];
  return ordered.map((p) => {
    const unit = paceUnitLabel(p.pace_unit);
    const zones = [...p.zones_json]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((z) => ({
        code: z.code,
        target: `${formatZoneRange(z)} ${unit}`,
        adjusted: false,
      }));
    return { modality: p.modality, modality_label: ZONE_MODALITY_LABEL[p.modality], zones };
  });
}

/** Maps the REAL reference-test results into the Perfil reference-test cards:
 *  pace tests (5k / 2k) from athlete_benchmarks (latest result, mm:ss) and the
 *  1RM from athlete_strength_maxes (kg). No result → null ("pendiente"). NEVER
 *  derived from in-WOD segment durations. Derived objectives come from the stored
 *  zone profiles (resolver output). Pure — safe in the client bundle. */
export function buildPerfilTab(
  benchmarks: BenchmarkSeries[] = [],
  zone_profiles: AthleteZoneProfile[] = [],
  strength_maxes: StrengthMaxView[] = [],
  max_hr_bpm: number | null = null,
): PerfilTabData {
  const benchBySlug = new Map(benchmarks.map((b) => [b.exercise_slug, b]));

  // Latest result of a TIME-based benchmark, formatted mm:ss (5k / 2k row are
  // always seconds). No recorded result → null ("pendiente de registro").
  const latestTime = (slug: string): { value: string | null; date_iso: string | null } => {
    const last = benchBySlug.get(slug)?.results.at(-1) ?? null;
    if (!last) return { value: null, date_iso: null };
    return { value: fmtTime(Math.round(last.value)), date_iso: last.recorded_at };
  };

  const run5k = latestTime(BENCH_RUN_5K);
  const row2k = latestTime(BENCH_ROW_2K);
  // The 1RM reference card reads the REAL back-squat max (kg) from the strength
  // system — NOT a segment time misread as a load. No max → "Pendiente".
  const squat = strength_maxes.find((m) => m.exercise_slug === BENCH_BACK_SQUAT_1RM) ?? null;

  const reference_tests: ReferenceTest[] = [
    { slug: BENCH_RUN_5K, icon: 'directions_run', label: benchmarkLabel(BENCH_RUN_5K), value: run5k.value, date_iso: run5k.date_iso },
    { slug: BENCH_ROW_2K, icon: 'rowing', label: benchmarkLabel(BENCH_ROW_2K), value: row2k.value, date_iso: row2k.date_iso },
    {
      slug: '1rm',
      icon: 'fitness_center',
      label: 'Fuerza · 1RM',
      value: squat ? `${Math.round(squat.one_rm_kg)} kg` : null,
      date_iso: squat?.recorded_at ?? null,
    },
  ];

  // Real derived zone targets from the stored zone profiles (resolver output),
  // grouped by modality. When the athlete has no test yet this is [] → the Perfil
  // tab shows its honest empty state. No fake targets ever ship.
  const objective_groups = deriveObjectiveGroups(zone_profiles);

  // Profile version = the latest resolved zone-profile version across modalities
  // (each modality versions on re-test); null when there's no profile yet.
  const profile_version =
    zone_profiles.length > 0 ? Math.max(...zone_profiles.map((p) => p.version)) : null;

  return { reference_tests, objective_groups, profile_version, strength_maxes, max_hr_bpm };
}

/** Selector convenience — builds the Perfil tab from the loaded detalle payload. */
export function selectPerfilTab(detalle: V2AthleteDetalle): PerfilTabData {
  return buildPerfilTab(
    detalle.benchmarks ?? [],
    detalle.zone_profiles,
    detalle.strength_maxes ?? [],
    detalle.max_hr_bpm,
  );
}
