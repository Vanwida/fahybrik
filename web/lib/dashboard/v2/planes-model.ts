// v2 · PLANNING domain model — shared derivations for Screen 6 (Plan por fases)
// and Screen 7 (Microciclo). Pure, client-safe (no DB imports) so it runs in the
// server loader AND in client components. Single source of truth for:
//   · methodology_group_id (1–10) → training MODALITY (the v2 color axis)
//   · a day's WeekSlots → its dominant modality + session count (WeekStrip input)
//   · phases (ATR defaults) → derived week count + a per-week load curve
//
// MODEL NOTE: the plan-by-phase content (which sessions sit in which day of which
// derived week) is NOT yet a persisted entity — only the coach's microcycle
// templates (program_month_templates → weeks → slots) are. Where this file needs
// per-day session content it reads the real WeekSlots; the Plan-builder canvas in
// Screen 6 is functional client state with a clearly-marked TODO(endpoint).

import type { V2Modality } from '@/components/v2/constants';
import type { WeekDay, WeekSlots } from '@fahybrid/shared/schema/program-templates';
import {
  ATR_BLOCKS_DEFAULT,
  type AtrBlockDefault,
  OBJECTIVE_OPTIONS,
} from '@/lib/dashboard/coach/methodology/defaults';

// ── methodology_group_id → modality ──────────────────────────────────────────
// The 10 coach groups (migration 0030) collapse onto the 5-hue modality axis.
// Source of truth; never inline this mapping in a component.
//   1 Fuerza Base · 2 Pliométrica            → fuerza
//   3 Series Ergómetros                       → ergo
//   4 Series Running · 5 Zona 2 / Recuperación→ carrera
//   6 WODs/Metcons · 7 Simulaciones · 9 Circuitos → circuito
//   8 Core/Movilidad · 10 Tapering            → calentamiento
const GROUP_TO_MODALITY: Record<number, V2Modality> = {
  1: 'fuerza',
  2: 'fuerza',
  3: 'ergo',
  4: 'carrera',
  5: 'carrera',
  6: 'circuito',
  7: 'circuito',
  8: 'calentamiento',
  9: 'circuito',
  10: 'calentamiento',
};

/** Map a methodology group id to its modality. Unknown / missing → null. */
export function modalityForGroup(group_id: number | null | undefined): V2Modality | null {
  if (group_id == null) return null;
  return GROUP_TO_MODALITY[group_id] ?? null;
}

// ── a day → its modalities + dominant modality ───────────────────────────────
export interface DayModalityInfo {
  /** 1 = Monday … 7 = Sunday. */
  day_of_week: number;
  /** Distinct modalities present across the day's sessions (in first-seen order). */
  modalities: V2Modality[];
  /** The dominant modality used for the strip cell color; null = rest day. */
  dominant: V2Modality | null;
  /** Number of workout sessions scheduled that day (0 = rest). */
  session_count: number;
  /** Number of blocks across all sessions that day (volume proxy). */
  block_count: number;
}

/**
 * Derive a single day's modality picture from its WeekSlots day. The dominant
 * modality is the one carried by the MOST blocks (ties → first seen). A day with
 * sessions but no classifiable block falls back to `circuito` (a generic workout)
 * so the strip never shows an unexplained blank for a non-rest day.
 */
export function deriveDayModality(day: WeekDay): DayModalityInfo {
  const counts = new Map<V2Modality, number>();
  const order: V2Modality[] = [];
  let session_count = 0;
  let block_count = 0;

  for (const session of day.sessions) {
    if (session.kind !== 'workout') continue;
    session_count += 1;
    for (const block of session.blocks ?? []) {
      block_count += 1;
      const mod = modalityForGroup(block.methodology_group_id);
      if (!mod) continue;
      if (!counts.has(mod)) order.push(mod);
      counts.set(mod, (counts.get(mod) ?? 0) + 1);
    }
  }

  let dominant: V2Modality | null = null;
  let best = 0;
  for (const mod of order) {
    const n = counts.get(mod) ?? 0;
    if (n > best) {
      best = n;
      dominant = mod;
    }
  }
  // Workout day with unclassified blocks → generic conditioning so it never reads
  // as "rest". A true rest day (0 sessions) stays null.
  if (dominant == null && session_count > 0) dominant = 'circuito';

  return {
    day_of_week: day.day_of_week,
    modalities: order,
    dominant,
    session_count,
    block_count,
  };
}

/** Derive all 7 days of a week (always returns 7 entries, Mon→Sun). */
export function deriveWeekModalities(slots: WeekSlots): DayModalityInfo[] {
  const byDay = new Map<number, WeekDay>();
  for (const d of slots.days) byDay.set(d.day_of_week, d);
  const out: DayModalityInfo[] = [];
  for (let dow = 1; dow <= 7; dow++) {
    const day = byDay.get(dow);
    if (day) out.push(deriveDayModality(day));
    else out.push({ day_of_week: dow, modalities: [], dominant: null, session_count: 0, block_count: 0 });
  }
  return out;
}

/** Total workout sessions in a week (for week-card "N sesiones"). */
export function weekSessionCount(days: DayModalityInfo[]): number {
  return days.reduce((n, d) => n + d.session_count, 0);
}

// ── Phases (ATR defaults) → derived weeks ────────────────────────────────────
export interface PlanPhase {
  /** Stable id (the ATR block code, lower-cased). */
  id: string;
  block: AtrBlockDefault['block'];
  /** Coach-facing name (e.g. "Acumulación"). */
  name: string;
  /** Weeks derived from the phase duration. */
  week_count: number;
  order: number;
  /** Human objective labels (resolved from OBJECTIVE_OPTIONS). */
  objectives: string[];
  intensity_ceiling: AtrBlockDefault['intensityCeiling'];
  /** Draft vs published — the builder gate. ATR defaults ship as published. */
  status: 'published' | 'draft';
}

const OBJECTIVE_LABEL = new Map(OBJECTIVE_OPTIONS.map((o) => [o.id, o.label]));

/**
 * The coach's periodization phases. SOURCE: the real Pablo ATR defaults
 * (ACC 5 / TRANS 4 / REAL 3) — see methodology/defaults.ts. Per the agnostic
 * phase system these are editable per-coach data; until a per-coach phases loader
 * is wired here, the default set is the truthful content. Each phase's weeks are
 * DERIVED from its duration (a 5-week phase → 5 week cards).
 *
 * TODO(model): swap ATR_BLOCKS_DEFAULT for a fetch of methodology_phases once a
 * web loader for the per-coach phase set exists (agnostic-phase migration 0052).
 */
export function buildPlanPhases(): PlanPhase[] {
  return ATR_BLOCKS_DEFAULT.map((b, i) => ({
    id: b.block.toLowerCase(),
    block: b.block,
    name: b.labelAthlete,
    week_count: b.durationWeeks,
    order: b.order,
    objectives: b.objectives.map((o) => OBJECTIVE_LABEL.get(o) ?? o),
    intensity_ceiling: b.intensityCeiling,
    // The first phase ships as the working draft so the borrador→publicar gate is
    // demonstrable on a real phase; later phases read as published.
    status: i === 0 ? 'draft' : 'published',
  }));
}

// ── Load curve (entrada → carga → pico → descarga) ───────────────────────────
// A microcycle / phase ramps load week-to-week then deloads on the last week.
// Returned as 0–1 intensities so a bar can render proportionally. Real per-week
// load is not yet persisted, so this is a deterministic standard ATR ramp keyed
// only on (index, total) — a model-faithful default, not invented per-athlete data.
//   TODO(model): replace with persisted week load once the load-tracking lands.
export type LoadStage = 'entrada' | 'carga' | 'pico' | 'descarga';

export interface WeekLoad {
  /** 0–1 height for the load bar. */
  level: number;
  stage: LoadStage;
  /** Tracked label, e.g. "Pico". */
  label: string;
}

const STAGE_LABEL: Record<LoadStage, string> = {
  entrada: 'Entrada',
  carga: 'Carga',
  pico: 'Pico',
  descarga: 'Descarga',
};

/** Standard ATR load ramp for `total` weeks: ramps up to a peak then deloads. */
export function loadCurve(total: number): WeekLoad[] {
  if (total <= 0) return [];
  if (total === 1) return [{ level: 0.7, stage: 'carga', label: STAGE_LABEL.carga }];

  const out: WeekLoad[] = [];
  // Peak on the second-to-last week; last week is always the deload.
  const peakIndex = total - 2;
  for (let i = 0; i < total; i++) {
    let stage: LoadStage;
    let level: number;
    if (i === total - 1) {
      stage = 'descarga';
      level = 0.45;
    } else if (i === 0) {
      stage = 'entrada';
      level = 0.6;
    } else if (i === peakIndex) {
      stage = 'pico';
      level = 1;
    } else {
      stage = 'carga';
      // Linear ramp from entrada (0.6) toward the peak (1).
      const span = Math.max(peakIndex, 1);
      level = 0.6 + (0.4 * i) / span;
    }
    out.push({ level: Math.min(1, level), stage, label: STAGE_LABEL[stage] });
  }
  return out;
}

// ── Spanish day labels (Mon→Sun) ─────────────────────────────────────────────
export const DAY_LABELS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
export const DAY_LABELS_FULL = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;
