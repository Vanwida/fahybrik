// ANALYTICS · Section 3 (FUERZA) — the PER-SET WORK half. The 1RM cards live in
// strength.ts (test history); these cards read what the athlete actually LOGGED
// set by set (`set_executions`, mig 0088) so the section stops being "just the
// tests" and shows the real training load. The exercise identity comes from the
// denormalized `segment_executions.exercise_id` (mig 0120), so a template edit
// never orphans a lift's progression.
//
// Cards:
//   • strength_volume  — period tonnage (kg×reps) + sessions + weekly bars (drill)
//   • lift_progression — hero lift's best working set per week (drill)
//   • lifts_worked     — every lift trained this period + its best set   (drill each)
//   • load_adherence   — real load vs prescribed (does he lift what's asked)
//   • effort_rpe       — RPE/RIR trend (opt-in fields → honest gate when scarce)
//
// Honest contract (same as the rest of the tab): SKIPS never count (a skipped set
// has reps_actual = NULL and is excluded); an unloaded lift contributes reps but
// no tonnage; zero logged sets → a gate with an invitation, never fabricated zeros.

import 'server-only';

import type { Sql } from '@/lib/db';
import { estimateOneRm } from '@fahybrid/shared/domain/strength';
import {
  type AnalyticsCard,
  type CardSeriesPoint,
  type DrillRef,
  type ResolvedPeriod,
  card,
  isoWeekStart,
  numOrNull,
  seriesAxis,
} from './core';

// A working set only needs enough logged RPE to make a trend honest; below this
// the fields are treated as not-yet-logged (they are opt-in).
const MIN_RPE_SETS = 4;
const MIN_BAR = 0.25;
const PROGRESSION_MAX_WEEKS = 10;
// Tonnage crosses into tonnes for the hero number once it is this big (a single
// leg session is already ~2–4 t, so kg headlines get unreadable fast).
const TONNE_THRESHOLD_KG = 1000;

// ── DB row ───────────────────────────────────────────────────────────────────
interface StrengthSetRow {
  reps_actual: number | null;
  reps_prescribed: number | null;
  load_actual_kg: string | null;
  load_prescribed_kg: string | null;
  rpe: string | null;
  rir: string | null;
  status: string;
  exercise_id: string | null;
  exercise_name: string | null;
  execution_id: string;
  day: string; // YYYY-MM-DD
}

// A normalized in-memory set (strings → numbers once, at the boundary).
interface WorkSet {
  reps: number | null;
  repsPrescribed: number | null;
  load: number | null;
  loadPrescribed: number | null;
  rpe: number | null;
  rir: number | null;
  exerciseId: string | null;
  exerciseName: string | null;
  executionId: string;
  day: string;
  week: string;
}

// ── Formatting helpers ───────────────────────────────────────────────────────
function kg(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1).replace('.', ',');
}

/** Tonnage → a readable hero {value, unit}: tonnes once it's big, else kg. */
function tonnage(v: number): { value: string; unit: string } {
  if (v >= TONNE_THRESHOLD_KG) return { value: (v / 1000).toFixed(1).replace('.', ','), unit: 't' };
  return { value: `${Math.round(v)}`, unit: 'kg' };
}

/** "58 kg × 5" for a loaded set, "12 reps" for a bodyweight one. */
function setLabel(s: { load: number | null; reps: number | null }): string | null {
  if (s.reps == null) return null;
  if (s.load != null && s.load > 0) return `${kg(s.load)} kg × ${s.reps}`;
  return `${s.reps} reps`;
}

/**
 * The strength-normalized magnitude of a working set. A loaded set → its
 * estimated 1RM (Epley), so 100×5 ranks above 100×3; an unloaded (bodyweight)
 * set → its reps. Returns null when the set has no completed reps.
 */
function setMagnitude(s: { load: number | null; reps: number | null }): number | null {
  if (s.reps == null || s.reps < 1) return null;
  if (s.load != null && s.load > 0) return estimateOneRm(s.load, s.reps);
  return s.reps;
}

function drill(kind: string, params: Record<string, string>, count: number, label: string): DrillRef {
  return { kind, params, count, label_es: label };
}

// ── Loader ───────────────────────────────────────────────────────────────────
// One round-trip: every logged strength set in the window. SKIPS are excluded in
// SQL (status <> 'skipped'); structural (warm-up) segments never count; modality
// resolves from the segment tag, falling back to the exercise category.
async function loadStrengthSets(
  client: Sql,
  athleteId: number,
  period: ResolvedPeriod,
): Promise<WorkSet[]> {
  const rows = await client<StrengthSetRow[]>`
    select
      st.reps_actual,
      st.reps_prescribed,
      st.load_actual_kg::text     as load_actual_kg,
      st.load_prescribed_kg::text as load_prescribed_kg,
      st.rpe::text                as rpe,
      st.rir::text                as rir,
      st.status,
      se.exercise_id::text        as exercise_id,
      ex.name                     as exercise_name,
      we.id::text                 as execution_id,
      to_char(coalesce(we.ended_at, we.started_at)::date, 'YYYY-MM-DD') as day
    from set_executions st
    join segment_executions se on se.id = st.segment_execution_id
    join workout_executions we on we.id = se.execution_id
    left join exercises ex on ex.id = se.exercise_id
    where we.athlete_id = ${athleteId}
      and st.status <> 'skipped'
      and coalesce(se.is_structural, false) = false
      and coalesce(se.modality, case when ex.category = 'strength' then 'strength' else 'other' end) = 'strength'
      and coalesce(we.ended_at, we.started_at) >= ${period.start_iso}::timestamptz
      and coalesce(we.ended_at, we.started_at) <= ${period.end_iso}::timestamptz
    order by we.started_at asc, se.position asc, st.set_index asc
  `;

  return rows.map((r) => ({
    reps: r.reps_actual,
    repsPrescribed: r.reps_prescribed,
    load: numOrNull(r.load_actual_kg),
    loadPrescribed: numOrNull(r.load_prescribed_kg),
    rpe: numOrNull(r.rpe),
    rir: numOrNull(r.rir),
    exerciseId: r.exercise_id,
    exerciseName: r.exercise_name,
    executionId: r.execution_id,
    day: r.day,
    week: isoWeekStart(r.day),
  }));
}

// ── Public entry ─────────────────────────────────────────────────────────────
/**
 * The per-set work cards, in display order. Empty (no logged sets) → a single
 * gate card inviting the athlete to log a strength session; otherwise the full
 * volume / progression / breakdown / adherence / effort set.
 */
export async function buildStrengthWorkCards(
  client: Sql,
  athleteId: number,
  period: ResolvedPeriod,
): Promise<{ cards: AnalyticsCard[]; hasData: boolean }> {
  const sets = await loadStrengthSets(client, athleteId, period);

  if (sets.length === 0) {
    return {
      hasData: false,
      cards: [
        card({
          id: 'strength_volume',
          title_es: `Volumen de fuerza · ${period.label_es}`,
          availability: 'needs_logging',
          availability_note:
            'Registra una sesión de fuerza (series con carga) para ver tu volumen, progresión y adherencia.',
        }),
      ],
    };
  }

  return {
    hasData: true,
    cards: [
      buildVolumeCard(sets, period),
      buildProgressionCard(sets),
      buildLiftsWorkedCard(sets),
      buildAdherenceCard(sets),
      buildEffortCard(sets),
    ],
  };
}

// ── CARD: volume (tonnage + sessions + weekly bars) ──────────────────────────
function buildVolumeCard(sets: WorkSet[], period: ResolvedPeriod): AnalyticsCard {
  let totalKg = 0;
  for (const s of sets) {
    if (s.load != null && s.load > 0 && s.reps != null) totalKg += s.load * s.reps;
  }
  const sessions = new Set(sets.map((s) => s.executionId));
  const weeks = Math.max(1, Math.round(period.days / 7));

  // Weekly tonnage bars (taller = more kg moved).
  const byWeek = new Map<string, number>();
  for (const s of sets) {
    if (s.load != null && s.load > 0 && s.reps != null) {
      byWeek.set(s.week, (byWeek.get(s.week) ?? 0) + s.load * s.reps);
    }
  }
  const ordered = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxWeek = Math.max(1, ...ordered.map(([, v]) => v));
  const series: CardSeriesPoint[] = ordered.map(([wk, v], i) => {
    const t = tonnage(v);
    return {
      id: wk,
      height: Math.max(MIN_BAR, Math.min(1, v / maxWeek)),
      display: `${t.value} ${t.unit}`,
      current: i === ordered.length - 1,
      label: wk,
    };
  });

  const hero = tonnage(totalKg);
  const perWeek = tonnage(totalKg / weeks);
  return card({
    id: 'strength_volume',
    title_es: `Volumen de fuerza · ${period.label_es}`,
    availability: 'real',
    primary: {
      value: hero.value,
      unit: hero.unit,
      side: { value: String(sessions.size), label: 'sesiones' },
    },
    series,
    series_kind: 'bars',
    rows: [
      { id: 'total', label: `Total ${period.label_es}`, value: `${hero.value} ${hero.unit}`, sub: 'carga × reps', accent: true, drill: null },
      { id: 'sessions', label: 'Sesiones de fuerza', value: String(sessions.size), sub: `${sets.length} series`, accent: false, drill: null },
      { id: 'per_week', label: 'Media/sem', value: `${perWeek.value} ${perWeek.unit}`, sub: null, accent: false, drill: null },
    ],
    drill: drill('strength.volume', {}, sessions.size, `de ${sessions.size} sesiones · fecha · tonelaje`),
    meaning_es: 'Tonelaje = suma de carga × reps de cada serie hecha (nunca cuenta los saltos). Peso corporal suma reps, no kg.',
  });
}

// ── Per-exercise aggregation (shared by progression + lifts-worked) ──────────
interface ExerciseAgg {
  exerciseId: string;
  name: string;
  loaded: boolean;
  sessions: Set<string>;
  weeks: Set<string>;
  /** Best set overall (max magnitude). */
  best: WorkSet | null;
  bestMag: number;
  /** Best set per week (for the progression series). */
  bestByWeek: Map<string, { set: WorkSet; mag: number }>;
}

function aggregateByExercise(sets: WorkSet[]): ExerciseAgg[] {
  const byEx = new Map<string, ExerciseAgg>();
  for (const s of sets) {
    if (s.exerciseId == null) continue; // can't attribute → no per-lift history
    const mag = setMagnitude(s);
    if (mag == null) continue;
    const e =
      byEx.get(s.exerciseId) ??
      ({
        exerciseId: s.exerciseId,
        name: s.exerciseName ?? 'Ejercicio',
        loaded: false,
        sessions: new Set<string>(),
        weeks: new Set<string>(),
        best: null,
        bestMag: -Infinity,
        bestByWeek: new Map(),
      } satisfies ExerciseAgg);
    e.sessions.add(s.executionId);
    e.weeks.add(s.week);
    if (s.load != null && s.load > 0) e.loaded = true;
    if (mag > e.bestMag) {
      e.bestMag = mag;
      e.best = s;
    }
    const wk = e.bestByWeek.get(s.week);
    if (!wk || mag > wk.mag) e.bestByWeek.set(s.week, { set: s, mag });
    byEx.set(s.exerciseId, e);
  }
  // Most history first (weeks, then sessions) — the hero + display order.
  return [...byEx.values()].sort(
    (a, b) => b.weeks.size - a.weeks.size || b.sessions.size - a.sessions.size || b.bestMag - a.bestMag,
  );
}

// ── CARD: lift progression (hero lift's best set per week) ────────────────────
function buildProgressionCard(sets: WorkSet[]): AnalyticsCard {
  const aggs = aggregateByExercise(sets);
  const hero = aggs[0] ?? null;

  if (!hero || !hero.best) {
    return card({
      id: 'lift_progression',
      title_es: 'Progresión por ejercicio',
      availability: 'needs_logging',
      availability_note: 'Registra el mismo ejercicio en varias sesiones para ver su progresión.',
    });
  }

  const weekly = [...hero.bestByWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-PROGRESSION_MAX_WEEKS);
  const maxMag = Math.max(1, ...weekly.map(([, w]) => w.mag));
  const series: CardSeriesPoint[] = weekly.map(([wk, w], i) => ({
    id: wk,
    height: Math.max(MIN_BAR, Math.min(1, w.mag / maxMag)),
    display: setLabel(w.set),
    current: i === weekly.length - 1,
    label: wk,
  }));

  const currentBest = setLabel(hero.best);
  return card({
    id: 'lift_progression',
    title_es: `Progresión · ${hero.name.toLowerCase()}`,
    availability: 'real',
    availability_note: hero.weeks.size >= 2 ? null : 'Una sola semana: entrénalo más para ver la curva.',
    primary: { value: currentBest, unit: null, side: null },
    series,
    series_kind: 'line',
    series_axis: seriesAxis(series),
    drill: drill('strength.exercise', { exercise_id: hero.exerciseId }, hero.sessions.size, `${hero.sessions.size} sesiones · mejor serie`),
    meaning_es: hero.loaded
      ? 'Mejor serie de cada semana (por 1RM estimado, Epley). Subiendo = más fuerte.'
      : 'Mejor serie de cada semana (reps, ejercicio sin carga externa).',
  });
}

// ── CARD: lifts worked (every lift this period + its best set) ───────────────
function buildLiftsWorkedCard(sets: WorkSet[]): AnalyticsCard {
  const aggs = aggregateByExercise(sets);
  const heroId = aggs[0]?.exerciseId ?? '';
  const rows = aggs.map((e) => ({
    id: e.exerciseId,
    label: e.name,
    value: e.best ? setLabel(e.best) : '—',
    sub: `${e.sessions.size} ${e.sessions.size === 1 ? 'sesión' : 'sesiones'}`,
    accent: e.exerciseId === heroId,
    drill: drill('strength.exercise', { exercise_id: e.exerciseId }, e.sessions.size, `${e.sessions.size} sesiones`),
  }));
  return card({
    id: 'lifts_worked',
    title_es: 'Ejercicios trabajados',
    availability: rows.length ? 'real' : 'needs_logging',
    availability_note: rows.length ? null : 'Aún no hay ejercicios de fuerza con historial.',
    rows,
    meaning_es: 'Tu mejor serie real por ejercicio en el periodo. Cada fila abre su historial.',
  });
}

// ── CARD: load adherence (real vs prescribed) ────────────────────────────────
function buildAdherenceCard(sets: WorkSet[]): AnalyticsCard {
  const loadPairs = sets.filter((s) => s.load != null && s.loadPrescribed != null && s.loadPrescribed > 0);
  const repPairs = sets.filter((s) => s.reps != null && s.repsPrescribed != null && s.repsPrescribed > 0);

  const avgPct = (list: WorkSet[], pick: (s: WorkSet) => number): number | null => {
    if (list.length === 0) return null;
    const sum = list.reduce((a, s) => a + pick(s), 0);
    return Math.round((sum / list.length) * 100);
  };
  const loadPct = avgPct(loadPairs, (s) => (s.load as number) / (s.loadPrescribed as number));
  const repPct = avgPct(repPairs, (s) => (s.reps as number) / (s.repsPrescribed as number));

  const hasLoad = loadPct != null;
  return card({
    id: 'load_adherence',
    title_es: 'Carga real vs prescrita',
    availability: hasLoad ? 'real' : 'needs_logging',
    availability_note: hasLoad
      ? null
      : 'Necesita series con carga prescrita Y registrada para medir la adherencia.',
    primary: hasLoad ? { value: `${loadPct}`, unit: '%', side: null } : null,
    rows: [
      {
        id: 'load',
        label: 'Adherencia a la carga',
        value: loadPct != null ? `${loadPct}%` : '—',
        sub: `${loadPairs.length} series con carga prescrita`,
        accent: true,
        drill: null,
      },
      {
        id: 'reps',
        label: 'Adherencia a las reps',
        value: repPct != null ? `${repPct}%` : '—',
        sub: `${repPairs.length} series con reps prescritas`,
        accent: false,
        drill: null,
      },
    ],
    meaning_es: '100% = levanta exactamente lo pautado. <100% = se queda corto; >100% = va por encima.',
  });
}

// ── CARD: effort (RPE / RIR — opt-in, honest gate when scarce) ───────────────
function buildEffortCard(sets: WorkSet[]): AnalyticsCard {
  const rpeSets = sets.filter((s) => s.rpe != null);
  const rirSets = sets.filter((s) => s.rir != null);

  if (rpeSets.length < MIN_RPE_SETS && rirSets.length < MIN_RPE_SETS) {
    return card({
      id: 'effort_rpe',
      title_es: 'Esfuerzo · RPE / RIR',
      availability: 'needs_logging',
      availability_note: 'RPE y RIR son opcionales. Regístralos por serie para ver tu esfuerzo real.',
    });
  }

  const avg = (list: WorkSet[], pick: (s: WorkSet) => number | null): number | null => {
    const vals = list.map(pick).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 10) / 10;
  };
  const avgRpe = avg(rpeSets, (s) => s.rpe);
  const avgRir = avg(rirSets, (s) => s.rir);

  // Weekly RPE trend (only weeks that have RPE data).
  const byWeek = new Map<string, { sum: number; n: number }>();
  for (const s of rpeSets) {
    if (s.rpe == null) continue;
    const e = byWeek.get(s.week) ?? { sum: 0, n: 0 };
    e.sum += s.rpe;
    e.n += 1;
    byWeek.set(s.week, e);
  }
  const ordered = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const series: CardSeriesPoint[] = ordered.map(([wk, e], i) => {
    const v = e.sum / e.n;
    return {
      id: wk,
      height: Math.max(MIN_BAR, Math.min(1, v / 10)), // RPE is on a 0..10 scale
      display: v.toFixed(1).replace('.', ','),
      current: i === ordered.length - 1,
      label: wk,
    };
  });

  return card({
    id: 'effort_rpe',
    title_es: 'Esfuerzo · RPE / RIR',
    availability: 'real',
    series,
    series_kind: 'line',
    series_axis: seriesAxis(series),
    rows: [
      { id: 'rpe', label: 'RPE medio', value: avgRpe != null ? `${kg(avgRpe)}/10` : null, sub: `${rpeSets.length} series`, accent: true, drill: null },
      { id: 'rir', label: 'RIR medio', value: avgRir != null ? `${kg(avgRir)}` : null, sub: rirSets.length ? `${rirSets.length} series` : 'sin registro', accent: false, drill: null },
    ],
    meaning_es: 'RPE alto sostenido con misma carga = fatiga; RPE bajando a igual carga = adaptándote.',
  });
}

// Kept for the drill-down (same window, same source rows).
export { loadStrengthSets, setLabel, tonnage, setMagnitude };
export type { WorkSet };
