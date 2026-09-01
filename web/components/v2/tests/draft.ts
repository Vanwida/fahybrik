// #34 — client-side draft model + mappers for the coach Tests editor. Bridges the
// wire shape (CoachCalibrationTest, from the API) and the editor form, and the form
// and the write input (CoachTestResultInput). The calibration catalog + baseline
// measures come from shared (the SAME source the server validates against), so the
// two dropdowns can never offer something the API would reject.

import type {
  CoachCalibrationTest,
  CoachTestResult,
} from '@/lib/coach/coach-tests';
import type {
  StoreResultMeasure,
  StoreResultUnit,
} from '@fahybrid/shared/schema/test-battery';
import type { CoachTestResultInput } from '@fahybrid/shared/schema/coach-tests';
import { CALIBRATION_TARGETS } from '@fahybrid/shared/domain/coach/test-battery';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import type { EditorBlockInput } from '@fahybrid/shared/schema/program-templates';

/** One result being edited. A CALIBRATION result carries only a catalog target
 *  key (slug/measure/unit derived); a BASELINE result carries its own measure/unit.
 *  `optional` marks a result that never blocks the test's completion (#34). */
export type DraftResult =
  | { kind: 'calibration'; target: string; label: string; optional: boolean }
  | { kind: 'baseline'; measure: StoreResultMeasure; unit: StoreResultUnit; label: string; optional: boolean };

export interface DraftSchedule {
  /** 0 = SEMANA CERO (los días antes de que arranque el plan); 1+ = semana N. */
  week_offset: number;
  day_of_week: number;
  /** Días libres que la pieza pide detrás. Solo lo usa la semana cero al repartir. */
  rest_days_after?: number;
}

/** The full test editing draft. `id === null` ⇒ creating.
 *
 *  `content`: el bloque real de la sesión (docs/DECISIONS.md, 2026-08-08 "el
 *  editor de tests") — el MISMO EditorBlock que edita el día. `[]` en
 *  `emptyTestDraft`/al crear un test nuevo (el coach construye desde cero); al
 *  editar uno existente arranca `[]` también y se hidrata APARTE, de forma
 *  asíncrona (GET /api/coach/tests/[id]) porque `CoachCalibrationTest`/
 *  `testToDraft` son síncronos y el contenido necesita una lectura extra que los
 *   7 demás llamadores de `listCoachTests` no necesitan (ver
 *  lib/coach/coach-tests.ts `loadCoachTestContent`). */
export interface TestDraft {
  id: string | null;
  name: string;
  protocol: string;
  format: string;
  enabled: boolean;
  results: DraftResult[];
  schedule: DraftSchedule[];
  content: EditorBlock[];
}

// The single <select> in the editor encodes both kinds in one value:
//   `cal:<targetKey>`  → a calibration target
//   `base:<measure>`   → a baseline measure (unit is derived)
export function encodeResultChoice(r: DraftResult): string {
  return r.kind === 'calibration' ? `cal:${r.target}` : `base:${r.measure}`;
}

/** Map a decoded <select> value back to a DraftResult, preserving label + optional. */
export function decodeResultChoice(value: string, label: string, optional: boolean): DraftResult {
  if (value.startsWith('cal:')) {
    return { kind: 'calibration', target: value.slice(4), label, optional };
  }
  const measure = value.slice(5) as StoreResultMeasure;
  return { kind: 'baseline', measure, unit: unitForMeasure(measure), label, optional };
}

/** The natural unit for a baseline measure (time→seconds, load→kg, …). */
export function unitForMeasure(measure: StoreResultMeasure): StoreResultUnit {
  switch (measure) {
    case 'time': return 'seconds';
    case 'distance': return 'meters';
    case 'reps': return 'reps';
    case 'calories': return 'calories';
    case 'load': return 'kg';
    case 'height': return 'cm';
    default: return 'reps';
  }
}

function resultToDraft(r: CoachTestResult): DraftResult {
  if (r.derives !== 'none') {
    const target = CALIBRATION_TARGETS.find((t) => t.slug === r.slug && t.derives === r.derives);
    if (target) return { kind: 'calibration', target: target.key, label: r.label, optional: r.optional };
  }
  return { kind: 'baseline', measure: r.measure, unit: r.unit, label: r.label, optional: r.optional };
}

/** A new default result (a 5K-control run-zones calibration — the most common). */
export function defaultDraftResult(): DraftResult {
  const first = CALIBRATION_TARGETS[0]!;
  return { kind: 'calibration', target: first.key, label: '', optional: false };
}

export function emptyTestDraft(): TestDraft {
  return {
    id: null,
    name: '',
    protocol: '',
    format: 'test',
    enabled: true,
    results: [defaultDraftResult()],
    schedule: [{ week_offset: 1, day_of_week: 3 }],
    content: [],
  };
}

export function testToDraft(t: CoachCalibrationTest): TestDraft {
  return {
    id: t.id,
    name: t.name,
    protocol: t.protocol ?? '',
    format: t.format,
    enabled: t.enabled,
    results: t.results.map(resultToDraft),
    schedule: t.schedules.map((s) => ({
      week_offset: s.week_offset,
      day_of_week: s.day_of_week,
      rest_days_after: s.rest_days_after,
    })),
    // Se hidrata aparte (ver el docblock de TestDraft.content) — TestsView lo
    // rellena con un GET /api/coach/tests/[id] justo después de abrir el panel.
    content: [],
  };
}

export function draftResultToInput(d: DraftResult): CoachTestResultInput {
  const optional = d.optional ? { optional: true as const } : {};
  if (d.kind === 'calibration') {
    const label = d.label.trim();
    return label
      ? { kind: 'calibration', target: d.target, label, ...optional }
      : { kind: 'calibration', target: d.target, ...optional };
  }
  return { kind: 'baseline', measure: d.measure, unit: d.unit, label: d.label.trim(), ...optional };
}

/**
 * `EditorBlock[]` (client view-model) → `EditorBlockInput[]` (el shape de
 * escritura, compartido con el editor de día). NO se reutiliza
 * `sessionsToWire` de `editor/day-editor-io.ts`: ese helper solo manda los
 * campos que el PUT del día usa hoy (uid/title/format/methodology_group_id/
 * source_block_id/items) y omite `optional`/`coach_note` aunque el schema los
 * acepta — para un test, que puede ser el único bloque de la sesión, conviene
 * la forma completa. Adaptador PEQUEÑO y propio de este editor, no una
 * conversión genérica duplicada: no hay ninguna función exportada que haga
 * exactamente esto (editor-serialize.ts convierte a `WeekDayPart`/slots_json,
 * un shape DISTINTO al de esta escritura).
 *
 * `circuit` (rounds/pacing/descansos, docs/DECISIONS.md 2026-08-08): pasa tal
 * cual — un test HYROX-style lo necesita para no perder su config de bloque al
 * volver a guardar tras reabrir el editor (`loadCoachTestContent` ya lo
 * hidrata en la carga, ver lib/coach/coach-tests.ts).
 */
export function draftContentToInput(content: EditorBlock[]): EditorBlockInput[] {
  return content.map((b) => ({
    uid: b.uid,
    title: b.title,
    // EditorBlock.format is a plain string (client view-model); the wire schema
    // narrows to the templateFormat enum — same cast day-editor's serializePart
    // uses (editor-serialize.ts) for the same reason.
    format: b.format as EditorBlockInput['format'],
    methodology_group_id: b.methodology_group_id ?? null,
    ...(b.group != null ? { group: b.group } : {}),
    source_block_id: b.source_block_id ?? null,
    ...(b.coach_note ? { coach_note: b.coach_note } : {}),
    optional: b.optional ?? false,
    ...(b.circuit ? { circuit: b.circuit } : {}),
    items: b.items.map((it) => ({
      uid: it.uid,
      exercise_id: it.exercise_id,
      exercise_name: it.exercise_name,
      prescription: it.prescription,
      ...(it.notes && it.notes.trim() ? { notes: it.notes.trim() } : {}),
    })),
  }));
}
