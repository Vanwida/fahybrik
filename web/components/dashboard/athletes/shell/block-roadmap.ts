// Derivación ÚNICA para Mes y Macro de la ficha del atleta. Ambas vistas se
// construyen sobre `AthleteBlocksView` (atr_macrocycles → atr_blocks →
// microcycles + scheduled/completed/published) — la MISMA estructura por bloque
// que el Hub y el roster, NO de athlete_month_assignments (legacy, desalineado).
// Vocabulario del fundador: "bloque" + nombre de fase (el nombre lo define el
// coach en sus fases de periodización), NUNCA "microciclo" en superficie.
//
// El nombre/color/role de cada fase salen del RESOLVER (resolvePhase) sobre las
// fases configuradas por el coach. Sin fases configuradas (o bloque sin phase_id)
// el resolver cae al enum ATR legacy → labels idénticos a hoy.

import type { AthleteBlocksView } from '@/lib/dashboard/coach/assign-block';
import type { AtrBlockType } from '@fahybrid/shared/domain/coach/types';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import type { PhaseRole } from '@fahybrid/shared/schema/_primitives';
import { resolvePhase, indexPhasesById } from '@/lib/dashboard/coach/resolve-phase';

/** Estado de una semana del plan, en lenguaje del fundador. */
export type WeekState = 'hecha' | 'en_curso' | 'planificada' | 'borrador';

export const WEEK_STATE_LABEL: Record<WeekState, string> = {
  hecha: 'Hecha',
  en_curso: 'En curso',
  planificada: 'Planificada',
  borrador: 'Borrador',
};

/** Color SEMÁNTICO por estado (acento reservado a "en curso" = hoy). */
export function weekStateTone(state: WeekState): string {
  switch (state) {
    case 'en_curso':
      return 'var(--accent)';
    case 'hecha':
      return 'var(--status-success)';
    case 'borrador':
      return 'var(--status-warning)';
    default:
      return 'var(--text-muted)';
  }
}

/** Una semana (microciclo) resuelta para pintar — base común de Mes y Macro. */
export interface RoadmapWeek {
  microcycle_id: string;
  /** week_number macro-relativo (1..N) del microciclo. */
  week_number: number;
  /** Semana RELATIVA AL BLOQUE (1-indexed): "sem 2 de 4". */
  block_week: number;
  week_start: string;
  week_end: string;
  scheduled: number;
  completed: number;
  /** % cumplimiento (0-100). null si la semana aún no empezó (futuro honesto). */
  compliance_pct: number | null;
  state: WeekState;
  is_current: boolean;
}

/** Un bloque resuelto con sus semanas — base común de Mes y Macro. */
export interface RoadmapBlock {
  block_id: string;
  type: AtrBlockType;
  /** Nombre de fase en palabras — del resolver (fase del coach o ATR legacy). */
  phase_label: string;
  /** Eje de intensidad agnóstico (volume/intensity/peak/...) — del resolver. */
  phase_role: PhaseRole;
  /** Token de color de la fase (var(--...)) — del resolver. */
  phase_color: string;
  /** Clases Tailwind del chip de fase (border/bg/text) — del resolver. */
  phase_badge_class: string;
  status: string;
  start_date: string;
  end_date: string;
  /** Nº de semanas planificadas del bloque (denominador "sem X de N"). */
  week_count: number;
  /** true si el bloque ya tiene sesiones materializadas. */
  is_assigned: boolean;
  /** Plantillas de semana disponibles para programar este bloque. */
  available_week_templates: number;
  is_current: boolean;
  weeks: RoadmapWeek[];
}

export interface Roadmap {
  blocks: RoadmapBlock[];
  /** El bloque que contiene hoy (o null fuera del macrociclo). */
  currentBlock: RoadmapBlock | null;
  /** La semana en curso (contiene hoy), si existe. */
  currentWeek: RoadmapWeek | null;
  /** Total de semanas del macrociclo (suma de week_count por bloque). */
  totalWeeks: number;
  macrocycleStart: string | null;
  macrocycleEnd: string | null;
}

function compliancePct(scheduled: number, completed: number): number | null {
  if (scheduled <= 0) return null;
  return Math.round((completed / scheduled) * 100);
}

/**
 * Resuelve el estado de una semana a partir de su posición temporal + datos.
 *  - en_curso: contiene hoy.
 *  - hecha: la semana terminó (week_end < hoy) — trayectoria histórica.
 *  - borrador: futura y NO publicada (weekly_plans.status='draft').
 *  - planificada: futura y publicada.
 * Una semana materializada SIN sesiones cuenta igual; el % degrada a null.
 */
function resolveWeekState(params: {
  weekStartIso: string;
  weekEndIso: string;
  todayIso: string;
  published: boolean;
}): WeekState {
  const { weekStartIso, weekEndIso, todayIso, published } = params;
  if (weekStartIso <= todayIso && weekEndIso >= todayIso) return 'en_curso';
  if (weekEndIso < todayIso) return 'hecha';
  // Futura.
  return published ? 'planificada' : 'borrador';
}

/**
 * Construye el roadmap (bloques → semanas con estado) desde la vista por-bloque.
 * Fuente ÚNICA para Mes (semanas del bloque actual) y Macro (timeline entero).
 * `todayIso` se inyecta (cliente) para mantener la derivación pura/testeable.
 *
 * `coachPhases` (opcional) son las fases de periodización del coach: cada bloque
 * resuelve su nombre/color/role vía `resolvePhase`. Sin fases (default []) o sin
 * phase_id, el resolver cae al enum ATR legacy → labels/colores idénticos a hoy.
 */
export function buildRoadmap(
  view: AthleteBlocksView | null,
  todayIso: string,
  coachPhases: ReadonlyArray<MethodologyPhase> = [],
): Roadmap {
  if (!view || view.blocks.length === 0) {
    return {
      blocks: [],
      currentBlock: null,
      currentWeek: null,
      totalWeeks: 0,
      macrocycleStart: view?.start_date ?? null,
      macrocycleEnd: view?.end_date ?? null,
    };
  }

  // Index las fases una vez para O(1) en resolvePhase por bloque.
  const phaseIndex = indexPhasesById(coachPhases);

  let currentWeek: RoadmapWeek | null = null;

  const blocks: RoadmapBlock[] = view.blocks.map((b) => {
    // Semanas ordenadas por week_number; first_week = la primera del bloque para
    // derivar la semana RELATIVA AL BLOQUE (idéntico al Hub/roster).
    const micros = [...b.microcycles].sort((a, c) => a.week_number - c.week_number);
    const firstWeekNumber = micros[0]?.week_number ?? 1;
    // week_count = semanas planificadas (no solo materializadas) para que el
    // "de N" no encoja en bloques aún sin todas las semanas instanciadas.
    const weekCount = Math.max(b.planned_weeks, micros.length);

    const weeks: RoadmapWeek[] = micros.map((m) => {
      const state = resolveWeekState({
        weekStartIso: m.start_date,
        weekEndIso: m.end_date,
        todayIso,
        published: m.published,
      });
      const started = m.start_date <= todayIso;
      const week: RoadmapWeek = {
        microcycle_id: m.microcycle_id,
        week_number: m.week_number,
        block_week: m.week_number - firstWeekNumber + 1,
        week_start: m.start_date,
        week_end: m.end_date,
        scheduled: m.scheduled,
        completed: m.completed,
        // % solo cuando la semana ya empezó (futuro no tiene cumplimiento honesto).
        compliance_pct: started ? compliancePct(m.scheduled, m.completed) : null,
        state,
        is_current: state === 'en_curso',
      };
      if (week.is_current) currentWeek = week;
      return week;
    });

    // Resuelve la fase del bloque: fase del coach (por phase_id) o ATR legacy.
    const resolved = resolvePhase({ type: b.type, phase_id: b.phase_id }, phaseIndex);

    return {
      block_id: b.block_id,
      type: b.type,
      phase_label: resolved.label,
      phase_role: resolved.role,
      phase_color: resolved.color,
      phase_badge_class: resolved.badgeClass,
      status: b.status,
      start_date: b.start_date,
      end_date: b.end_date,
      week_count: weekCount,
      is_assigned: b.is_assigned,
      available_week_templates: b.available_week_templates,
      is_current: view.current_block_type === b.type,
      weeks,
    };
  });

  const currentBlock = blocks.find((b) => b.is_current) ?? null;
  const totalWeeks = blocks.reduce((sum, b) => sum + b.week_count, 0);

  return {
    blocks,
    currentBlock,
    currentWeek,
    totalWeeks,
    macrocycleStart: view.start_date,
    macrocycleEnd: view.end_date,
  };
}

/** "Intensificación · sem 2 de 4" — idéntico al Hub/roster. */
export function blockWeekLabel(block: RoadmapBlock, week: RoadmapWeek): string {
  return `${block.phase_label} · sem ${week.block_week} de ${block.week_count}`;
}

/** Rango legible de una semana: "16 – 22 jun". */
export function weekRangeLabel(weekStart: string, weekEnd: string): string {
  const start = isoToNoon(weekStart);
  const end = isoToNoon(weekEnd);
  const month = (d: Date) => d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()} – ${end.getDate()} ${month(end)}`
    : `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
}

/** Rango corto de un bloque: "11 may – 14 jun". */
export function blockRangeLabel(start: string, end: string): string {
  return weekRangeLabel(start, end);
}

/** Fecha única legible: "2 ago". */
export function singleDateLabel(iso: string): string {
  const d = isoToNoon(iso);
  const month = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return `${d.getDate()} ${month}`;
}

function isoToNoon(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}
