// «Progresar selección…» — aplica a las prescripciones TIPADAS de un rango de
// celdas un cambio semanal (informe D §4.1). Es MECANISMO: cómo se sube una
// carga, cómo se añade una serie, cómo se descarga un volumen. Los PASOS (+2,5 %
// por semana, +1 serie, −30 % de volumen) son MÉTODO del coach: llegan como
// argumento desde sus ajustes (`shared/domain/coach/progression-steps.ts`).
//
// Semana a semana: en un rango de varias semanas, la primera es la base (k = 0)
// y la semana k recibe k pasos. Así «copiar S1 en S2–S4 y progresar S1–S4
// +2,5 %» deja S1 igual, S2 +2,5, S3 +5, S4 +7,5. La descarga no se acumula:
// se aplica una vez a cada semana del rango.
//
// Qué toca cada operación (y qué NUNCA toca):
//   · carga  → objetivos `percent_rm` (+x PUNTOS: 75 → 77,5) y `kg` (×(1 + x/100),
//              redondeado a 0,5 kg). RPE, RIR, zonas, ritmos y relativos no se
//              tocan: «+2,5 %» no significa nada para ellos.
//   · series → líneas por series (`sets[]`): añade (o quita) series de trabajo
//              copiando la última; en formatos por rondas suma rondas.
//              Las series de aproximación no cuentan ni se tocan.
//   · descarga → volumen −x %: nº de series/rondas (mín. 1), y la duración o
//              distancia de un trabajo continuo. La intensidad no se toca (si el
//              coach quiere bajarla también, aplica una carga negativa).
// Una línea sin prescripción estructurada se deriva de su legado igual que la
// lee el editor; el resultado se guarda ya estructurado.

import {
  legacyItemToPrescription,
  prescriptionToParams,
  type Measure,
  type Prescription,
  type PrescriptionSet,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import type { WeekDay, WeekDayPartItem } from '@fahybrid/shared/schema/program-templates';
import { cellAt, type CellWrite, type GridBounds, type GridRange } from './grid-model';

export type ProgressOp =
  | { kind: 'load'; pct: number }
  | { kind: 'sets'; n: number }
  | { kind: 'deload'; pct: number };

const PERCENT_RM_CAP = 100;
const PERCENT_RM_STEP = 0.5;
const KG_STEP = 0.5;
const DURATION_STEP_S = 5;
const DISTANCE_STEP_M = 5;
const MAX_SETS = 60;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Carga ────────────────────────────────────────────────────────────────────

function scaleTarget(t: Target, pct: number): Target {
  if (pct === 0) return t;
  if (t.kind === 'percent_rm') {
    const f = (v: number | undefined) =>
      v === undefined ? undefined : clamp(roundTo(v + pct, PERCENT_RM_STEP), 0, PERCENT_RM_CAP);
    return pruneUndefined({ ...t, value: f(t.value), min: f(t.min), max: f(t.max) });
  }
  if (t.kind === 'kg') {
    const f = (v: number | undefined) => (v === undefined ? undefined : Math.max(0, roundTo(v * (1 + pct / 100), KG_STEP)));
    return pruneUndefined({ ...t, value: f(t.value), min: f(t.min), max: f(t.max) });
  }
  return t;
}

function pruneUndefined<T extends object>(o: T): T {
  const out = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as T;
}

function progressLoad(p: Prescription, pct: number): Prescription {
  const next: Prescription = { ...p };
  if (p.target) next.target = scaleTarget(p.target, pct);
  if (p.sets) next.sets = p.sets.map((s) => (s.target && !s.is_approach ? { ...s, target: scaleTarget(s.target, pct) } : s));
  return next;
}

// ── Series ───────────────────────────────────────────────────────────────────

function workingIndexes(sets: PrescriptionSet[]): number[] {
  return sets.flatMap((s, i) => (s.is_approach ? [] : [i]));
}

function changeSetCount(p: Prescription, target: (n: number) => number): Prescription {
  const sets = p.sets ?? [];
  const working = workingIndexes(sets);
  const next: Prescription = { ...p };
  if (working.length > 0) {
    const want = clamp(target(working.length), 1, MAX_SETS);
    if (want > working.length) {
      const last = sets[working[working.length - 1]!]!;
      next.sets = [...sets, ...Array.from({ length: want - working.length }, () => structuredClone(last))];
    } else if (want < working.length) {
      const drop = new Set(working.slice(want));
      next.sets = sets.filter((_, i) => !drop.has(i));
    }
    // En formatos por rondas (`8x400m`) las rondas y las series van a la par.
    if (p.rounds !== undefined) {
      const diff = want - working.length;
      next.rounds = Math.max(1, p.rounds + diff);
      if (p.rounds_max !== undefined) next.rounds_max = Math.max(next.rounds, p.rounds_max + diff);
    }
    return next;
  }
  if (p.rounds !== undefined) {
    const want = clamp(target(p.rounds), 1, MAX_SETS);
    next.rounds = want;
    if (p.rounds_max !== undefined) next.rounds_max = Math.max(want, p.rounds_max + (want - p.rounds));
  }
  return next;
}

// ── Descarga ─────────────────────────────────────────────────────────────────

function scaleMeasure(m: Measure, f: number): Measure {
  if (m.kind === 'duration') {
    return pruneUndefined({ ...m, seconds: Math.max(DURATION_STEP_S, roundTo(m.seconds * f, DURATION_STEP_S)), max: m.max === undefined ? undefined : roundTo(m.max * f, DURATION_STEP_S) });
  }
  if (m.kind === 'distance') {
    return pruneUndefined({ ...m, meters: Math.max(DISTANCE_STEP_M, roundTo(m.meters * f, DISTANCE_STEP_M)), max: m.max === undefined ? undefined : roundTo(m.max * f, DISTANCE_STEP_M) });
  }
  return m;
}

const CONTINUOUS_SCHEMES = new Set(['steady', 'amrap']);

function deload(p: Prescription, pct: number): Prescription {
  const f = clamp(1 - pct / 100, 0, 1);
  const working = workingIndexes(p.sets ?? []);
  // Varias series de trabajo (o rondas) → menos series/rondas.
  if (working.length > 1 || (working.length === 0 && (p.rounds ?? 0) > 1)) {
    return changeSetCount(p, (n) => Math.max(1, Math.round(n * f)));
  }
  // Un trabajo continuo (45′ Z2, 10 km, AMRAP 20′) → menos tiempo o distancia.
  const next: Prescription = { ...p };
  if (p.total_s !== undefined && CONTINUOUS_SCHEMES.has(p.scheme)) {
    next.total_s = Math.max(DURATION_STEP_S, roundTo(p.total_s * f, DURATION_STEP_S));
  }
  if (p.sets && working.length === 1) {
    next.sets = p.sets.map((s, i) => (i === working[0] && s.measure ? { ...s, measure: scaleMeasure(s.measure, f) } : s));
  }
  return next;
}

// ── Aplicación ───────────────────────────────────────────────────────────────

export function itemPrescription(item: WeekDayPartItem): Prescription {
  return (
    item.prescription_json ??
    legacyItemToPrescription({
      params_json: (item.params_json ?? null) as Record<string, unknown> | null,
      notes: item.notes ?? null,
    })
  );
}

/** Aplica la operación `steps` veces (k semanas desde la base) a una prescripción. */
export function progressPrescription(p: Prescription, op: ProgressOp, steps: number): Prescription {
  if (op.kind === 'load') return steps === 0 ? p : progressLoad(p, op.pct * steps);
  if (op.kind === 'sets') return steps === 0 ? p : changeSetCount(p, (n) => n + op.n * steps);
  return deload(p, op.pct);
}

/** Una celda entera: cada línea de cada bloque de cada entreno. */
export function progressDay(day: WeekDay, op: ProgressOp, steps: number): WeekDay {
  if (op.kind !== 'deload' && steps === 0) return day;
  return {
    ...day,
    sessions: day.sessions.map((s) => ({
      ...s,
      blocks: (s.blocks ?? []).map((b) => ({
        ...b,
        items: (b.items ?? []).map((it) => {
          const before = itemPrescription(it);
          const after = progressPrescription(before, op, steps);
          if (after === before) return it;
          return { ...it, prescription_json: after, params_json: prescriptionToParams(after) };
        }),
      })),
    })),
  };
}

/**
 * El rango seleccionado. Varias semanas: la primera es la base (k = 0) y cada
 * una suma un paso. Una sola semana: recibe UN paso (el coach está diciendo
 * «esta semana, +2,5»).
 */
export function progressRange(grid: WeekDay[][], range: GridRange, op: ProgressOp, bounds: GridBounds): CellWrite[] {
  const out: CellWrite[] = [];
  const single = range.r1 === range.r0;
  for (let row = range.r0; row <= Math.min(range.r1, bounds.rows - 1); row++) {
    const steps = single ? 1 : row - range.r0;
    for (let col = range.c0; col <= Math.min(range.c1, bounds.cols - 1); col++) {
      out.push({ row, col, day: progressDay(cellAt(grid, row, col), op, steps) });
    }
  }
  return out;
}

/** Cuántas líneas cambiaría (para el botón «Aplicar a N líneas» y el aviso). */
export function countChangedLines(before: WeekDay[][], writes: CellWrite[]): number {
  let n = 0;
  for (const w of writes) {
    const prev = cellAt(before, w.row, w.col);
    const prevItems = prev.sessions.flatMap((s) => (s.blocks ?? []).flatMap((b) => b.items ?? []));
    const nextItems = w.day.sessions.flatMap((s) => (s.blocks ?? []).flatMap((b) => b.items ?? []));
    nextItems.forEach((it, i) => {
      const p = prevItems[i];
      if (!p || JSON.stringify(itemPrescription(p)) !== JSON.stringify(itemPrescription(it))) n += 1;
    });
  }
  return n;
}
