// shared-dose — la «dosis común» de un bloque, DERIVADA solo para presentación
// (rediseño del editor de microciclos — docs/design/contrato-rediseno-editor-
// microciclos.md, decisión 1). El dato guardado NO cambia. Cuatro veredictos,
// siempre honestos (jamás se agrupa lo que diverge, jamás se inventa un número):
//
//   shared  — todos los items comparten el esquema de trabajo (mismas series,
//             reps, descansos y tempo, comparados con los accesores canónicos
//             setMeasure()/setTarget()): la dosis se pinta UNA vez como línea del
//             bloque y cada fila lleva solo su excepción de intensidad («78-80%
//             RM») o hereda.
//   frame   — formatos de acondicionamiento (AMRAP, rondas, For Time…): el marco
//             (rondas · cap · descanso) es del bloque y cada fila pinta SU
//             trabajo (15 reps, 500 m @ 3:45/km…).
//   each    — los items divergen de verdad: cada fila pinta su dosis entera.
//   undosed — ningún item lleva dosis utilizable: aviso ámbar, nunca un invento.
//
// Los textos salen SIEMPRE de los formateadores canónicos compartidos
// (prescriptionToText / formatTarget) — aquí no nace ninguna grafía nueva.

import {
  formatTarget,
  prescriptionToText,
  setMeasure,
  setTarget,
  type Prescription,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';

export type BlockDoseView =
  | {
      kind: 'shared';
      /** La dosis del bloque, una vez («4×4 @ RIR 2 · descanso 1'30''»). */
      label: string;
      /** Lo que lee una fila sin excepción («hereda 4×4»); null si no procede. */
      inherit: string | null;
      /** Por item (mismo orden que block.items): su excepción, o null = hereda. */
      exceptions: (string | null)[];
    }
  | { kind: 'frame'; label: string; doses: string[] }
  | { kind: 'each'; doses: string[] }
  | { kind: 'undosed' };

const SETS_SCHEMES = new Set<Prescription['scheme']>(['sets', 'superset']);

/** ¿La prescripción lleva TRABAJO tipado (medida/objetivo/estructura)? La nota
 *  verbatim no cuenta como trabajo: es lo que quedó sin tipar. */
function hasWork(p: Prescription): boolean {
  if ((p.sets ?? []).some((s) => setMeasure(s) || setTarget(s) || s.rest_s !== undefined)) {
    return true;
  }
  return (
    p.total_s !== undefined ||
    p.work_s !== undefined ||
    p.rounds !== undefined ||
    p.rest_s !== undefined ||
    p.target !== undefined ||
    p.structure !== undefined
  );
}

/** Línea a revisar (import/quickline): solo sobrevive su texto verbatim. */
function isNoteOnly(p: Prescription): boolean {
  return !hasWork(p) && !!p.note;
}

// Firma del esquema de trabajo COMPLETO (sin intensidades): series, medidas,
// descansos, tempo y el marco del formato. Igualdad = misma dosis de trabajo.
function coreSignature(p: Prescription): string {
  const sets = p.sets ?? [];
  return JSON.stringify({
    scheme: p.scheme,
    rounds: p.rounds ?? null,
    work_s: p.work_s ?? null,
    rest_s: p.rest_s ?? null,
    total_s: p.total_s ?? null,
    start: p.start ?? null,
    increment: p.increment ?? null,
    measures: sets.map((s) => setMeasure(s) ?? null),
    rests: sets.map((s) => s.rest_s ?? null),
    tempos: sets.map((s) => s.tempo ?? null),
  });
}

// Firma del MARCO de un formato de acondicionamiento (sin el trabajo por fila).
function frameSignature(p: Prescription): string {
  return JSON.stringify({
    scheme: p.scheme,
    rounds: p.rounds ?? null,
    work_s: p.work_s ?? null,
    rest_s: p.rest_s ?? null,
    total_s: p.total_s ?? null,
    start: p.start ?? null,
    increment: p.increment ?? null,
    target: p.target ?? null,
  });
}

// Firma de intensidades (objetivo por serie + objetivo de bloque).
function targetsSignature(p: Prescription): string {
  return JSON.stringify({
    block: p.target ?? null,
    sets: (p.sets ?? []).map((s) => setTarget(s) ?? null),
  });
}

/** La(s) intensidad(es) propias de un item, formateadas («78-80% RM»). */
function itemTargetLabel(p: Prescription): string | null {
  const all = [...(p.sets ?? []).map(setTarget), p.target].filter(
    (t): t is Target => t !== undefined,
  );
  if (all.length === 0) return null;
  return [...new Set(all.map(formatTarget))].join('/');
}

/** Solo el trabajo («4×4», «10/10/8/8/6») vía el formateador canónico. */
function workOnlyText(p: Prescription): string {
  const sets = (p.sets ?? []).map((s) => ({ measure: setMeasure(s) }));
  if (!sets.some((s) => s.measure)) return '';
  return prescriptionToText({ scheme: 'sets', sets });
}

/** El trabajo + objetivo de UNA fila dentro de un marco compartido. */
function rowWorkText(p: Prescription): string {
  const sets = (p.sets ?? []).map((s) => {
    const m = setMeasure(s);
    const t = setTarget(s);
    return {
      ...(m ? { measure: m } : {}),
      ...(t ? { target: t } : {}),
      ...(s.tempo ? { tempo: s.tempo } : {}),
    };
  });
  if (sets.length > 0) {
    return prescriptionToText({
      scheme: 'sets',
      sets,
      ...(p.modality ? { modality: p.modality } : {}),
    });
  }
  // Sin sets: un bout continuo dentro del marco (raro) — su duración/objetivo.
  return prescriptionToText({
    scheme: 'steady',
    ...(p.total_s !== undefined ? { total_s: p.total_s } : {}),
    ...(p.target ? { target: p.target } : {}),
    ...(p.modality ? { modality: p.modality } : {}),
  });
}

function withoutNote(p: Prescription): Prescription {
  if (p.note === undefined) return p;
  const rest = { ...p };
  delete rest.note;
  return rest;
}

function withoutTargets(p: Prescription): Prescription {
  return {
    ...p,
    target: undefined,
    sets: (p.sets ?? []).map((s) => {
      const m = setMeasure(s);
      return {
        ...(m ? { measure: m } : {}),
        ...(s.rest_s !== undefined ? { rest_s: s.rest_s } : {}),
        ...(s.tempo ? { tempo: s.tempo } : {}),
      };
    }),
  };
}

function frameOnly(p: Prescription): Prescription {
  const rest = { ...p };
  delete rest.sets;
  delete rest.note;
  return rest;
}

/** El veredicto de presentación de la dosis de un bloque. Solo lectura. */
export function blockDoseView(block: EditorBlock): BlockDoseView {
  const ps = block.items.map((it) => it.prescription);
  if (ps.length === 0) return { kind: 'each', doses: [] };

  // Nada utilizable en ningún item → aviso, no un cero inventado.
  if (ps.every((p) => !hasWork(p) && !p.note)) return { kind: 'undosed' };

  const eachDoses = (): string[] =>
    ps.map((p) => (isNoteOnly(p) ? p.note ?? '' : prescriptionToText(p)));

  // Con líneas a revisar (verbatim) no se agrupa nada: cada fila su verdad.
  if (ps.some(isNoteOnly)) return { kind: 'each', doses: eachDoses() };

  const first = ps[0]!;
  const coreShared = ps.every((p) => coreSignature(p) === coreSignature(first));

  if (coreShared && hasWork(first)) {
    const inherit = workOnlyText(first) || null;
    const targetsShared = ps.every(
      (p) => targetsSignature(p) === targetsSignature(first),
    );
    if (targetsShared) {
      const label = prescriptionToText(withoutNote(first));
      if (label) {
        return { kind: 'shared', label, inherit, exceptions: ps.map(() => null) };
      }
    } else {
      const label = prescriptionToText(withoutTargets(withoutNote(first)));
      if (label) {
        return {
          kind: 'shared',
          label,
          inherit,
          exceptions: ps.map((p) => itemTargetLabel(p)),
        };
      }
    }
  }

  // Marco compartido de un formato de acondicionamiento (AMRAP/rondas/For Time):
  // el marco se pinta una vez y cada fila su trabajo propio.
  if (!SETS_SCHEMES.has(first.scheme)) {
    const frameShared = ps.every((p) => frameSignature(p) === frameSignature(first));
    const label = prescriptionToText(frameOnly(first));
    if (frameShared && label) {
      return { kind: 'frame', label, doses: ps.map((p) => rowWorkText(p)) };
    }
  }

  return { kind: 'each', doses: eachDoses() };
}
