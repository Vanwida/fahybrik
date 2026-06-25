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

// ── The unified payload the page passes to the client ──────────────────────────
export interface V2AthleteDetalle {
  header: DetalleHeader;
  stats: DetalleStat[];
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
}

function fmtTime(s: number | null): string | null {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Maps the real performance exercise series + Fabrik protocols into the Perfil
 *  reference-test cards. Values come from the deep-dive PR/test attempts when
 *  present; otherwise null ("pendiente"). Pure — safe in the client bundle. */
export function buildPerfilTab(performance: PerformancePayload | null): PerfilTabData {
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
  const squat = latest('back_squat');

  const reference_tests: ReferenceTest[] = [
    { slug: '5k', icon: 'directions_run', label: 'Carrera 5 km', value: run5k.value, date_iso: run5k.date_iso },
    { slug: 'row_2k', icon: 'rowing', label: 'Remo 2000 m', value: row2k.value, date_iso: row2k.date_iso },
    { slug: '1rm', icon: 'fitness_center', label: 'Fuerza · 1RM', value: squat.value, date_iso: squat.date_iso },
  ];

  // TODO(endpoint): replace with the resolver's derived-objective rows. Shape is
  // final; values null until the resolver is wired so no fake targets ship.
  const objectives: DerivedObjective[] = [
    { zone_label: 'Z2 · rodaje', target: null, adjusted: false },
    { zone_label: 'Z4 · umbral', target: null, adjusted: false },
    { zone_label: 'Remo · umbral /500m', target: null, adjusted: false },
    { zone_label: 'Sentadilla · cargas %', target: null, adjusted: false },
    { zone_label: 'Zonas FC', target: null, adjusted: false },
  ];

  return { reference_tests, objectives, profile_version: null };
}

/** Selector convenience — builds the Perfil tab from the loaded detalle payload. */
export function selectPerfilTab(detalle: V2AthleteDetalle): PerfilTabData {
  return buildPerfilTab(detalle.performance);
}
