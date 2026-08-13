// TIPO DE SESIÓN — clasificador CERRADO de una carrera, derivado de la
// ESTRUCTURA prescrita (RunStructure, #61). Nace para la pastilla Carrera del
// hub iOS (docs/superpowers/plans/2026-08-13-carrera-hub-ios.md): el
// historial necesita un chip por fila y NUNCA texto libre nuevo — ni un
// clasificador por ritmos, ni una palabra que tecleó el coach.
//
// POR QUÉ NO ES UN CAMPO YA EXISTENTE
// ------------------------------------
// El único eje ya guardado es `Prescription.scheme` (WORKOUT_FORMATS), y para
// carrera solo distingue 'steady' (un tramo) de 'intervals' (con Repeat) —
// ver shared/domain/prescription/format.ts. "Series" vs "fartlek" vs
// "cuestas" vs "progresivo" no son schemes: son FORMAS de la estructura, y
// nadie las etiquetaba hasta ahora.
//
// EL MODELO (ver web/tests/prescription/to-text-structure.test.ts — los casos
// de ahí, incluido el fartlek REAL que el coach dictó el 10-ago-2026, son el
// stress-test de este clasificador; se repiten en session-type.test.ts):
//
//   cuestas     — CUALQUIER tramo de la fase principal lleva incline_pct > 0.
//                 Manda sobre todo lo demás: un "45'' @ RPE 8-9 al 8%" es
//                 cuesta aunque su forma (duración + RPE, sin Repeat) fuera a
//                 leerse como fartlek si se mirara sin la pendiente.
//   fartlek     — hay Repeat, sin pendiente, y el tramo de trabajo se dirige
//                 por ZONA DE PULSO (hr_zone) o es un bloque de TIEMPO sin
//                 objetivo de precisión (target rpe o null). El caso real:
//                 16×(500m @ Z4 pulso / 1' trote Z2) — 500 m es distancia,
//                 pero el objetivo es FC, así que manda el eje de pulso.
//   series      — hay Repeat, sin pendiente, y el resto: objetivo de ritmo
//                 (pace/pace_zone) o reps de distancia con RPE — el track
//                 interval clásico, con o sin Repeat anidado (un anidado sin
//                 tramo de trabajo en el nivel superior no se sabe leer y cae
//                 a null, nunca se inventa "el de más adentro").
//   progresivo  — SIN Repeat, 2+ tramos de trabajo seguidos (tramo a tramo,
//                 cada uno su objetivo) — "1000@Z2 / 1000@Z3 / 1000@Z4".
//   continuo    — un único tramo de trabajo. Cubre rodaje, tempo y tirada
//                 larga por igual: distinguirlos exigiría un umbral de
//                 duración o de zona que es MÉTODO del coach (HARD RULE Nº0),
//                 no algo que este clasificador pueda decidir por su cuenta.
//
// Una estructura sin fase principal legible, o sin tramo de trabajo donde el
// modelo lo necesita, no se fuerza: null. Null es SIEMPRE honesto aquí — es
// justo el estado que la UI lista sin chip (mapa v2, sección Historial).

import {
  flattenPhase,
  isRepeat,
  isSegment,
  mainPhase,
  type Phase,
  type RunStructure,
  type Segment,
} from '../prescription/run-structure';

/** El catálogo cerrado. Cualquier fila fuera de esto es un bug del clasificador,
 *  nunca una categoría nueva inventada sobre la marcha. */
export const RUN_SESSION_TYPES = ['series', 'fartlek', 'cuestas', 'progresivo', 'continuo'] as const;
export type RunSessionType = (typeof RUN_SESSION_TYPES)[number];

/** Voz de atleta, un único sitio — igual que RUN_ZONE_LABEL / HR_ZONE_LABEL. */
export const RUN_SESSION_TYPE_LABEL_ES: Record<RunSessionType, string> = {
  series: 'Series',
  fartlek: 'Fartlek',
  cuestas: 'Cuestas',
  progresivo: 'Progresivo',
  continuo: 'Continuo',
};

function hasIncline(main: Phase): boolean {
  return flattenPhase(main).some((s) => (s.incline_pct ?? 0) > 0);
}

function firstWorkIn(main: Phase): Segment | undefined {
  return flattenPhase(main).find((s) => s.kind === 'work');
}

/**
 * Clasifica la fase principal de una estructura de carrera en uno de los cinco
 * slugs cerrados, o `null` cuando no hay estructura o no se puede leer.
 */
export function classifyRunSessionType(structure: RunStructure | null | undefined): RunSessionType | null {
  if (!structure || structure.length === 0) return null;
  const main = mainPhase(structure);
  if (!main || !Array.isArray(main.elements) || main.elements.length === 0) return null;

  // La pendiente manda sobre cualquier otra forma — con o sin Repeat.
  if (hasIncline(main)) return 'cuestas';

  const containsRepeat = main.elements.some(isRepeat);
  if (containsRepeat) {
    const work = firstWorkIn(main);
    if (!work) return null;
    if (work.target?.type === 'hr_zone') return 'fartlek';
    if (work.measure.type === 'duration' && (work.target == null || work.target.type === 'rpe')) return 'fartlek';
    return 'series';
  }

  // Sin Repeat: una pirámide autora tramo a tramo con recuperación intercalada
  // (200-400-600-800-600-400-200) es intervalos sin envoltorio, no progresión.
  const hasRecoveryAmongTop = main.elements.some((el) => isSegment(el) && el.kind === 'recovery');
  if (hasRecoveryAmongTop) return 'series';

  const workCount = main.elements.filter((el) => isSegment(el) && el.kind === 'work').length;
  if (workCount >= 2) return 'progresivo';
  return 'continuo';
}

/**
 * «6×800», «8×45''», «10×1′» — la dosis corta que nombra una fila del
 * historial cuando su forma es "N × un tramo de trabajo" (con o sin
 * recuperación al lado). Deliberadamente MÁS ESTRECHO que el clasificador de
 * arriba: una estructura anidada (3×(4×400)) o sin Repeat (progresivo,
 * continuo) no reduce limpio a "N×medida" y devuelve null antes que inventar
 * una cifra — el mismo criterio de honestidad que `classifyRunSessionType`.
 */
export function runSessionDoseLabel(structure: RunStructure | null | undefined): string | null {
  if (!structure || structure.length === 0) return null;
  const main = mainPhase(structure);
  if (!main || !Array.isArray(main.elements) || main.elements.length !== 1) return null;
  const [only] = main.elements;
  if (!only || !isRepeat(only) || !Array.isArray(only.elements) || only.elements.length === 0) return null;

  const work = only.elements.find((el): el is Segment => isSegment(el) && el.kind === 'work');
  if (!work) return null;
  return `${only.times}×${measureShort(work.measure)}`;
}

function measureShort(m: Segment['measure']): string {
  if (m.type === 'distance') return `${m.m}`;
  return m.s % 60 === 0 ? `${m.s / 60}'` : `${m.s}''`;
}
