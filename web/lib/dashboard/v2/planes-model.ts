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
import type {
  WeekDay,
  WeekDayPart,
  WeekSlots,
} from '@fahybrid/shared/schema/program-templates';
import { legacyItemToPrescription, prescriptionToText } from '@fahybrid/shared/domain/prescription';

// Per-day card limits — keep the 7-column week scannable: at most a couple of
// dose lines per block, a couple of blocks summarised; the rest collapses to
// "+N más" / "+N bl". Named so the threshold isn't a scattered magic number.
const MAX_BLOCKS_PER_DAY_CARD = 2;
const MAX_ITEM_LINES_PER_BLOCK = 2;

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

// ── a day → its modalities + dominant modality + real content preview ─────────

/** One exercise line previewed on a day card: name + its compact dose text. */
export interface DayItemLine {
  /** Exercise / movement name (e.g. "Back Squat"). */
  name: string;
  /** Compact dose rendered from the structured prescription ("5×8 @ 75% RM"). */
  dose: string;
}

/** One block previewed on a day card: header + its modality + a few item lines. */
export interface DayBlockInfo {
  /** Block container title (e.g. "Fuerza inferior", "Series 800m"). */
  title: string;
  /** Block modality for the chip / accent; null when not classifiable. */
  modality: V2Modality | null;
  /** Methodology group id (1–10) — resolved to the coach's label in the view. */
  group_id: number | null;
  /** First MAX_ITEM_LINES_PER_BLOCK exercise lines with their dose. */
  lines: DayItemLine[];
  /** Total exercise items in the block (lines may be truncated). */
  item_count: number;
}

/** A session within a day (AM / PM …) with its coach focus + blocks. */
export interface DaySessionInfo {
  /** Coach focus for the session ("Series medias"); null when none set. */
  focus: string | null;
  blocks: DayBlockInfo[];
}

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
  /** Total exercise items across all blocks that day (volume proxy). */
  item_count: number;
  /**
   * True when the day carries an explicit rest-kind session (coach scheduled
   * "rest"), vs a fully empty day (no sessions at all). Distinguishes the
   * "Descanso" card from the dashed add-affordance in the editor.
   */
  is_rest: boolean;
  /**
   * True when a REST day carries ≥1 recovery suggestion (oferta blanda del coach).
   * Drives the subtle "recuperación ofrecida" mark on the week strip. Always false
   * on workout/empty days (recovery is a rest-only concept — #47).
   */
  has_recovery: boolean;
  /** Day-level focus label, when the coach set one on the day itself. */
  focus: string | null;
  /** Per-session content preview (focus + blocks) for the rich day card. */
  sessions: DaySessionInfo[];
}

// Render an item's dose from its structured prescription, deriving from legacy
// params_json+notes when no prescription_json is stored (mirrors editor-data so
// real Pablo weeks — which carry params_json — read correctly, not blank).
function itemDose(item: WeekDayPart['items'][number]): string {
  const prescription =
    item.prescription_json ??
    legacyItemToPrescription({
      params_json: (item.params_json ?? null) as Record<string, unknown> | null,
      notes: item.notes ?? null,
    });
  return prescriptionToText(prescription);
}

function blockInfo(block: WeekDayPart): DayBlockInfo {
  const items = block.items ?? [];
  return {
    title: block.title,
    modality: modalityForGroup(block.methodology_group_id),
    group_id: block.methodology_group_id ?? null,
    item_count: items.length,
    lines: items.slice(0, MAX_ITEM_LINES_PER_BLOCK).map((it) => ({
      name: it.exercise_name,
      dose: itemDose(it),
    })),
  };
}

/**
 * Derive a single day's picture from its WeekSlots day: the dominant modality
 * (the one carried by the MOST blocks; ties → first seen) AND a content preview
 * (per-session focus + blocks + a couple of real exercise/dose lines) so the
 * day card can show CONTEXT, not just a modality tag. A workout day with no
 * classifiable block falls back to `circuito` so it never reads as "rest".
 */
export function deriveDayModality(day: WeekDay): DayModalityInfo {
  const counts = new Map<V2Modality, number>();
  const order: V2Modality[] = [];
  const sessions: DaySessionInfo[] = [];
  let session_count = 0;
  let block_count = 0;
  let item_count = 0;
  let has_rest_session = false;

  for (const session of day.sessions) {
    if (session.kind !== 'workout') {
      has_rest_session = true;
      continue;
    }
    session_count += 1;
    const blocks = session.blocks ?? [];
    for (const block of blocks) {
      block_count += 1;
      item_count += (block.items ?? []).length;
      const mod = modalityForGroup(block.methodology_group_id);
      if (!mod) continue;
      if (!counts.has(mod)) order.push(mod);
      counts.set(mod, (counts.get(mod) ?? 0) + 1);
    }
    sessions.push({
      focus: session.focus ?? null,
      blocks: blocks.map(blockInfo),
    });
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
  // as "rest". A true rest day (0 workout sessions) stays null.
  if (dominant == null && session_count > 0) dominant = 'circuito';

  return {
    day_of_week: day.day_of_week,
    modalities: order,
    dominant,
    session_count,
    block_count,
    item_count,
    // Rest only when there's no workout AND the coach signalled deliberate rest:
    // the explicit day-level `kind: 'rest'` (first-class #47) OR the legacy signals
    // (a phantom rest session / a day-level focus). A fully empty day → NOT "rest"
    // (renders the dashed add-affordance, not the "Descanso" card).
    is_rest: session_count === 0 && (day.kind === 'rest' || has_rest_session || !!day.focus),
    // Recuperación ofrecida: solo cuenta en un día sin entreno (rest-only).
    has_recovery: session_count === 0 && (day.recovery_suggestions?.length ?? 0) > 0,
    focus: day.focus ?? null,
    sessions,
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
    else
      out.push({
        day_of_week: dow,
        modalities: [],
        dominant: null,
        session_count: 0,
        block_count: 0,
        item_count: 0,
        is_rest: false,
        has_recovery: false,
        focus: null,
        sessions: [],
      });
  }
  return out;
}

/** Total workout sessions in a week (for week-card "N sesiones"). */
export function weekSessionCount(days: DayModalityInfo[]): number {
  return days.reduce((n, d) => n + d.session_count, 0);
}

// NOTE: there is deliberately NO per-week "load curve" here. Real per-week load
// is not yet persisted, and a synthetic ATR-shaped ramp (entrada→carga→pico→
// descarga) would (a) paint invented numbers as if they were real and (b) bake a
// single methodology's shape into an agnostic system. The week cards show the
// HONEST signal instead — real session count + the modalities the week covers.
//   TODO(model): add a real per-week load signal once load-tracking lands.

// ── Microciclo canvas href ───────────────────────────────────────────────────
// The microciclo is ONE canvas at `/microciclos/[id]`; the day editor is a zoom
// LEVEL on the same canvas, driven by the `?dia=N` query param (N = flat day
// index across the microciclo). No separate day route. Single source of truth so
// the week calendar, the 4-week grid, the week-context strip and the cross-week
// copy all build the SAME in-place link.
export function dayCanvasHref(microcycleId: string | number, dayIndex: number): string {
  return `/microciclos/${microcycleId}?dia=${dayIndex}`;
}

// ── Duplicar semana (client mutation) ────────────────────────────────────────
// SINGLE source for the "duplicar semana" call shared by BOTH microciclo views
// (the focused-week editor and the N-week grid overview). POSTs to the coach
// endpoint that DEEP-COPIES the source week's slots_json into a NEW week inserted
// right after it (insert…select → an independent jsonb row, never a shared ref).
// Reuses the existing server logic (duplicateWeekIntoMonth) — no parallel copier.
// Returns the new week's id + 0-based position; THROWS on a non-OK response so the
// caller can surface an honest error instead of pretending it worked.
export interface DuplicatedWeek {
  /** New program_week_templates id (string; bigint-safe). */
  id: string;
  /** 0-based position of the new week within the microciclo. */
  week_index: number;
}

export async function duplicateWeekInMonth(
  microcycleId: string | number,
  weekId: string | number,
): Promise<DuplicatedWeek> {
  const res = await fetch(
    `/api/coach/program-months/${microcycleId}/weeks/${weekId}/duplicate`,
    { method: 'POST', credentials: 'include' },
  );
  if (!res.ok) {
    throw new Error('No se pudo duplicar la semana.');
  }
  return (await res.json()) as DuplicatedWeek;
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
