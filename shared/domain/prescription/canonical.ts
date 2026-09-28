// La forma CANÓNICA de una prescripción al guardarla.
//
// POR QUÉ EXISTE. Un entreno libre del atleta y uno que programa el coach tienen
// que ser el mismo objeto (docs/DECISIONS.md, 2026-09-28). La misma dosis llegaba
// dicha de dos maneras según quién la escribía:
//
//   · 6 × 3' de remo. El editor del coach guarda la ventana en `work_s` (así la
//     lee su formulario de series y así hace el móvil que la serie cambie sola al
//     cumplirse el tiempo). El constructor libre la guardaba como una serie con
//     duración y sin `work_s`, así que el móvil no la cerraba solo y el formulario
//     del coach la abría como si fuera por distancia.
//   · El objetivo, el descanso y la modalidad repetidos dentro de la serie y en la
//     cabecera a la vez, o solo en uno de los dos sitios, según el escritor.
//
// Aquí se decide UNA vez dónde vive cada cosa, siguiendo el sitio donde la lee el
// formulario del coach que edita ese tipo de trabajo:
//
//   1. La estructura de carrera es ADITIVA al plano (`withFlatFromStructure`).
//   2. La modalidad de una serie que repite la de la línea sobra: se quita.
//   3. UN SOLO ESFUERZO de resistencia (`intervals` / `steady` con una serie
//      representativa o ninguna, sin estructura): el objetivo y el descanso son
//      de CABECERA (ahí los editan Series y Continuo); si el trabajo es por
//      tiempo, la ventana vive en `work_s` (series) o `total_s` (continuo) y la
//      serie representativa la repite como duración — la app instalada abre un
//      libre guardado leyendo la serie, y el motor en vivo cierra la serie con
//      la ventana. La ventana manda: la serie se deriva de ella, nunca al revés,
//      así que no pueden divergir.
//   4. Cualquier otra línea con UNA serie (una estación de WOD, un EMOM): el
//      objetivo es de la SERIE (ahí lo edita la fila de la estación); una copia
//      idéntica en cabecera sobra.
//
// Idempotente: aplicarla dos veces no cambia nada. Pura, sin E/S.

import { withFlatFromStructure } from './run-structure-convert';
import type { Measure, Prescription, PrescriptionSet, Target } from './types';

/** Esquemas de UN esfuerzo continuo o repetido, y el campo donde vive su ventana. */
const BOUT_WINDOW_FIELD = {
  intervals: 'work_s',
  steady: 'total_s',
} as const satisfies Partial<Record<Prescription['scheme'], 'work_s' | 'total_s'>>;

type BoutScheme = keyof typeof BOUT_WINDOW_FIELD;

function isBoutScheme(scheme: Prescription['scheme']): scheme is BoutScheme {
  return scheme in BOUT_WINDOW_FIELD;
}

/** JSON con las claves ordenadas: dos objetivos iguales dan el mismo texto. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Igualdad estructural de dos objetivos (mismos campos, mismos valores). */
function sameTarget(a: Target | undefined, b: Target | undefined): boolean {
  return a !== undefined && b !== undefined && stableJson(a) === stableJson(b);
}

function setWithout(set: PrescriptionSet, key: 'modality' | 'target' | 'rest_s'): PrescriptionSet {
  const out = { ...set };
  delete out[key];
  return out;
}

/** 2 · La modalidad de una serie que repite la de su línea no dice nada nuevo. */
function dedupeSetModality(p: Prescription): Prescription {
  if (!p.modality || !p.sets?.some((s) => s.modality === p.modality)) return p;
  return {
    ...p,
    sets: p.sets.map((s) => (s.modality === p.modality ? setWithout(s, 'modality') : s)),
  };
}

/** 3 · Un esfuerzo de resistencia: objetivo y descanso en cabecera, ventana ↔ duración. */
function canonicalBout(p: Prescription, scheme: BoutScheme): Prescription {
  const sets = p.sets ?? [];
  if (sets.length > 1) return p; // una tabla real (pirámide 1200/1000/800): no es un esfuerzo único
  const field = BOUT_WINDOW_FIELD[scheme];
  const out: Prescription = { ...p };
  let set: PrescriptionSet | undefined = sets[0] ? { ...sets[0] } : undefined;

  if (set?.target) {
    if (!out.target) {
      out.target = set.target;
      set = setWithout(set, 'target');
    } else if (sameTarget(set.target, out.target)) {
      set = setWithout(set, 'target');
    }
  }

  if (scheme === 'intervals' && set?.rest_s !== undefined) {
    if (out.rest_s === undefined) {
      out.rest_s = set.rest_s;
      set = setWithout(set, 'rest_s');
    } else if (set.rest_s === out.rest_s) {
      set = setWithout(set, 'rest_s');
    }
  }

  const window = out[field];
  const measure = set?.measure;
  if (window !== undefined && window > 0) {
    // La ventana manda. Una serie por distancia o calorías con ventana a la vez
    // («5 km con tope de 30'») no es esta forma: se deja como está.
    if (!set) {
      set = { measure: { kind: 'duration', seconds: window } };
    } else if (!measure || measure.kind === 'duration') {
      const next: Measure =
        measure?.kind === 'duration' && measure.seconds === window
          ? measure
          : measure?.kind === 'duration' && measure.max !== undefined && measure.max >= window
            ? { kind: 'duration', seconds: window, max: measure.max }
            : { kind: 'duration', seconds: window };
      set = { ...set, measure: next };
    }
  } else if (measure?.kind === 'duration' && measure.seconds > 0) {
    out[field] = measure.seconds;
  }

  if (set) out.sets = [set];
  return out;
}

/** 4 · Una línea de una serie que no es un esfuerzo de resistencia: el objetivo es de la serie. */
function dedupeHeadTarget(p: Prescription): Prescription {
  const only = p.sets?.length === 1 ? p.sets[0] : undefined;
  if (!only?.target || !sameTarget(only.target, p.target)) return p;
  const out = { ...p };
  delete out.target;
  return out;
}

/** La prescripción tal y como se guarda. Ver la cabecera. */
export function canonicalPrescription(p: Prescription): Prescription {
  const flat = dedupeSetModality(withFlatFromStructure(p));
  if (flat.structure) return flat; // la carrera estructurada manda sobre su plano
  return isBoutScheme(flat.scheme) ? canonicalBout(flat, flat.scheme) : dedupeHeadTarget(flat);
}
