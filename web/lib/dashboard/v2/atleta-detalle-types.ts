// v2 · ATLETA · DETALLE — client-safe types, tab enum + pure selectors. This
// module has NO `server-only` / DB imports so it can be imported by both the
// server orchestrator (atleta-detalle.ts) and the client components (tab bar,
// orchestrator). The DB-touching loader lives in atleta-detalle.ts and re-exports
// from here.

import type { V2Status } from '@/components/v2/StatusDot';
import type { AthleteResumen } from '@/lib/dashboard/coach/resumen';
import type { AthletePlanPayload } from '@/lib/dashboard/coach/athlete-plan';
import type { BodyPayload } from '@/lib/dashboard/coach/deep-dive-body';
import type {
  PerformancePayload,
  ExerciseTimeSeries,
} from '@/lib/dashboard/coach/deep-dive-performance';
import type { AthleteSubscriptionStatus } from '@/lib/dashboard/coach/subscription-status';
import type { AthleteZoneProfile } from '@fahybrid/shared/schema/methodology-system';
import { BENCH_BACK_SQUAT_1RM } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import {
  MODALITY_LABEL as ZONE_MODALITY_LABEL,
  formatZoneRange,
  groupProfilesForCalculator,
  paceUnitLabel,
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

// ── Sub-tab identity (the ?tab= query value) ────────────────────────────────────
export const ATLETA_TABS = ['perfil', 'plan', 'ritmos', 'historico', 'biometria', 'mensajes'] as const;
export type AtletaTab = (typeof ATLETA_TABS)[number];
export const DEFAULT_ATLETA_TAB: AtletaTab = 'perfil';

export function normalizeAtletaTab(raw: string | undefined): AtletaTab {
  return (ATLETA_TABS as readonly string[]).includes(raw ?? '')
    ? (raw as AtletaTab)
    : DEFAULT_ATLETA_TAB;
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
}

// ── Stat cluster (the 4 header StatTiles) ──────────────────────────────────────
export interface DetalleStat {
  label: string;
  value: string;
  tone: 'fg' | 'ok' | 'warn' | 'danger' | 'info';
}

export interface DetalleChatMessage {
  id: string;
  sender_role: 'coach' | 'athlete';
  body: string | null;
  created_at: string;
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
  training_days_per_week: number | null;
  /** The coach's levels, ordered, for the picker. */
  levels: ClasificacionLevelOption[];
  /** Inclusive valid band for días/semana (from the shared sequence schema). */
  days_band: { min: number; max: number };
}

// ── The unified payload the page passes to the client ──────────────────────────
export interface V2AthleteDetalle {
  header: DetalleHeader;
  stats: DetalleStat[];
  /** Nivel + días/semana — the assignment classification (Perfil tab). */
  classification: ClasificacionData;
  resumen: AthleteResumen | null;
  plan: AthletePlanPayload | null;
  body: BodyPayload | null;
  performance: PerformancePayload | null;
  subscription: AthleteSubscriptionStatus | null;
  /** Initial chat messages (role-resolved), newest last; null if thread load failed. */
  chat: { thread_id: string; messages: DetalleChatMessage[] } | null;
  /** Current versioned zone profiles per modality (Ritmos/Zonas tab). Empty = no
   *  test yet. READ from athlete_zone_profiles — the calculator never recomputes. */
  zone_profiles: AthleteZoneProfile[];
  /** Current 1RM per lift + version history (Perfil tab · Fuerza). Empty = no max
   *  yet. READ from athlete_strength_maxes — never recomputed. */
  strength_maxes: StrengthMaxView[];
}

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

// ── Objetivos derivados (Perfil tab, right column) ─────────────────────────────
export interface DerivedObjective {
  zone_label: string;
  target: string | null;
  adjusted: boolean;
}

export interface PerfilTabData {
  reference_tests: ReferenceTest[];
  objectives: DerivedObjective[];
  /** Profile version count (resolver versions athlete profiles on re-test). */
  profile_version: number | null;
  /** Strength maxes (1RM per lift + history) for the Fuerza · 1RM section. */
  strength_maxes: StrengthMaxView[];
}

function fmtTime(s: number | null): string | null {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Derived objectives = the absolute zone bands the resolver already produced from
 * the athlete's tests (the stored athlete_zone_profiles snapshot). This is the
 * test → profile → absolute-targets chain: each modality's threshold (test) in →
 * its 6 resolved bands out. We surface those bands verbatim — never inventing a
 * target — ordered ergo (row/ski/bike) then run, each zone by sort_order.
 *
 * AGNOSTIC: labels come from the stored `code` + the modality, never a hardcoded
 * Z2/umbral/ATR vocabulary. `adjusted` stays false — this model has no per-band
 * manual override yet, so we don't fake one.
 */
function deriveObjectives(zone_profiles: AthleteZoneProfile[]): DerivedObjective[] {
  const { ergo, run } = groupProfilesForCalculator(zone_profiles);
  const ordered = [...ergo, ...run];
  const out: DerivedObjective[] = [];
  for (const p of ordered) {
    const unit = paceUnitLabel(p.pace_unit);
    const zones = [...p.zones_json].sort((a, b) => a.sort_order - b.sort_order);
    for (const z of zones) {
      out.push({
        zone_label: `${ZONE_MODALITY_LABEL[p.modality]} · ${z.code}`,
        target: `${formatZoneRange(z)} ${unit}`,
        adjusted: false,
      });
    }
  }
  return out;
}

/** Maps the real performance exercise series + Fabrik protocols into the Perfil
 *  reference-test cards. Values come from the deep-dive PR/test attempts when
 *  present; otherwise null ("pendiente"). The derived objectives come from the
 *  stored zone profiles (the resolver output). Pure — safe in the client bundle. */
export function buildPerfilTab(
  performance: PerformancePayload | null,
  zone_profiles: AthleteZoneProfile[] = [],
  strength_maxes: StrengthMaxView[] = [],
): PerfilTabData {
  const exById = new Map<string, ExerciseTimeSeries>();
  if (performance) for (const ex of performance.exercises) exById.set(ex.exercise_slug, ex);

  const latest = (slug: string): { value: string | null; date_iso: string | null } => {
    const ex = exById.get(slug);
    if (!ex) return { value: null, date_iso: null };
    const test = [...ex.attempts].reverse().find((a) => a.is_test || a.is_pr) ?? ex.attempts.at(-1);
    return { value: fmtTime(test?.best_seconds ?? ex.best_seconds), date_iso: test?.iso_date ?? null };
  };

  const run5k = latest('5k');
  const row2k = latest('row_2k');
  // The 1RM reference card reads the REAL back-squat max (kg) from the strength
  // system — NOT best_seconds (a time) misread as a load. No max → "Pendiente".
  const squat = strength_maxes.find((m) => m.exercise_slug === BENCH_BACK_SQUAT_1RM) ?? null;

  const reference_tests: ReferenceTest[] = [
    { slug: '5k', icon: 'directions_run', label: 'Carrera 5 km', value: run5k.value, date_iso: run5k.date_iso },
    { slug: 'row_2k', icon: 'rowing', label: 'Remo 2000 m', value: row2k.value, date_iso: row2k.date_iso },
    {
      slug: '1rm',
      icon: 'fitness_center',
      label: 'Fuerza · 1RM',
      value: squat ? `${Math.round(squat.one_rm_kg)} kg` : null,
      date_iso: squat?.recorded_at ?? null,
    },
  ];

  // Real derived objectives from the stored zone profiles (resolver output). When
  // the athlete has no test yet this is [] → the Perfil tab shows its honest empty
  // state ("aún sin objetivos derivados"). No fake targets ever ship.
  const objectives = deriveObjectives(zone_profiles);

  // Profile version = the latest resolved zone-profile version across modalities
  // (each modality versions on re-test); null when there's no profile yet.
  const profile_version =
    zone_profiles.length > 0 ? Math.max(...zone_profiles.map((p) => p.version)) : null;

  return { reference_tests, objectives, profile_version, strength_maxes };
}

/** Selector convenience — builds the Perfil tab from the loaded detalle payload. */
export function selectPerfilTab(detalle: V2AthleteDetalle): PerfilTabData {
  return buildPerfilTab(detalle.performance, detalle.zone_profiles, detalle.strength_maxes ?? []);
}
