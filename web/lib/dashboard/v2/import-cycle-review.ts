// Cycle-import review helpers. Kept out of import-review.ts so that file
// stays the week-importer view model (already at the 500-line ceiling).

import {
  buildConfirmBody,
  type ConfirmBody,
  type MicroWeekRef,
  type ReviewWeek,
} from './import-review';
import type { DayPriority } from '@fahybrid/shared/domain/day-intent';

/** Destinos sintéticos de un tramo: la confirmación crea las semanas. */
export function cycleStretchWeekRefs(weekCount: number): MicroWeekRef[] {
  return Array.from({ length: weekCount }, (_, i) => ({
    id: `stretch-${i}`,
    index: i,
    label: `Semana ${i + 1}`,
    session_count: 0,
  }));
}

export interface CycleConfirmBody {
  mode: 'cycle';
  name: string;
  source_summary: { total_items: number; detected: number };
  weeks: Array<{
    week_index: number;
    day_of_week: number;
    sessions: ConfirmBody['weeks'][number]['sessions'];
    notes?: string;
    priority?: DayPriority;
    substitute?: string;
  }>;
  synonyms: ConfirmBody['synonyms'];
}

/**
 * Confirm de un CICLO nuevo. `week_index` es la posición en el tramo
 * (0 = primera semana importada). Reusa `buildConfirmBody` para el cable
 * de sesiones y sinónimos.
 */
export function buildCycleConfirmBody(params: {
  name: string;
  source_summary: { total_items: number; detected: number };
  weeks: ReviewWeek[];
}): CycleConfirmBody {
  const indexed = params.weeks.map((w, i) => ({ ...w, target_week_id: String(i) }));
  const mapped = buildConfirmBody('0', indexed);
  return {
    mode: 'cycle',
    name: params.name,
    source_summary: params.source_summary,
    weeks: mapped.weeks.map((entry) => ({
      week_index: Number(entry.target_week_template_id),
      day_of_week: entry.day_of_week,
      sessions: entry.sessions,
      ...(entry.notes ? { notes: entry.notes } : {}),
      ...(entry.priority ? { priority: entry.priority } : {}),
      ...(entry.substitute ? { substitute: entry.substitute } : {}),
    })),
    synonyms: mapped.synonyms,
  };
}
