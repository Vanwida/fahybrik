// De una SESIÓN asignada a UNA estructura de carrera lista para el reloj.
//
// EL PROBLEMA QUE RESUELVE
// -----------------------
// El detalle de asignación devuelve la sesión como bloques → líneas, y CADA línea
// de carrera lleva su propia `RunStructure` (calentamiento, principal y vuelta a la
// calma suelen ser tres líneas distintas). Un fichero de fabricante, en cambio, es
// UN entreno con UNA fase de cada rol. Aquí se hace ese puente sin perder trabajo:
// se concatenan las fases por ROL, en orden de bloque y de línea. Ningún tramo se
// descarta y el orden dentro de cada rol se respeta.
//
// POR QUÉ SE ABSOLUTIZA LA ZONA DE RITMO AQUÍ
// -------------------------------------------
// `buildWatchWorkout` resuelve una `pace_zone` desde los BENCHMARKS del atleta
// (su 5k, su 10k…). Pero lo que el atleta VE en la app es la banda del detalle de
// asignación, que sale de su PERFIL DE ZONAS almacenado (`athlete_zone_profiles`)
// — el test real, que manda sobre el benchmark de onboarding y puede ser más
// reciente. Si el reloj pitase contra una banda y la app mostrase otra, estaríamos
// mintiendo en uno de los dos sitios. Así que las zonas de ritmo ya resueltas se
// colapsan a banda ABSOLUTA antes de construir el entreno neutro: reloj y app
// guían siempre contra el mismo número.
//
// La zona de PULSO no se toca: el detalle de asignación resuelve todo a banda de
// ritmo (es un resolvedor de carrera), así que su `resolved` no sirve para una
// `hr_zone`. Esa sigue su camino normal y la resuelve `buildWatchWorkout` desde
// los benchmarks de pulso, o se queda abierta con la etiqueta en el nombre.

import type {
  Element,
  Phase,
  PhaseRole,
  Prescription,
  RunStructure,
  Segment,
} from '@fahybrid/shared/domain/prescription';
import { isRepeat, legacyToStructure } from '@fahybrid/shared/domain/prescription';

/** Orden normativo de las fases en una `RunStructure`. */
const PHASE_ORDER: readonly PhaseRole[] = ['warmup', 'main', 'cooldown'];

/**
 * Lo ÚNICO que necesitamos de una sesión para sacar su carrera: sus bloques, sus
 * líneas, y la prescripción de cada línea.
 *
 * Tipado ESTRUCTURAL a propósito. Existen dos `AssignmentDetailWorkout` distintos
 * en el repo — el de `shared/schema/workouts` (inferido de Zod, `exercise_id` como
 * string) y el que devuelve `loadAssignmentDetail` (`exercise_id` numérico) — y
 * atarnos a cualquiera de los dos obligaría a convertir en el otro sin ganar nada:
 * aquí no se lee ni un solo id. Pedir la forma mínima los acepta a ambos y deja
 * claro cuál es la dependencia real.
 */
export interface RunStructureSource {
  blocks: readonly {
    items: readonly {
      prescription_json?: Prescription | null;
    }[];
  }[];
}

/**
 * Las estructuras de carrera de una sesión, en orden de bloque y luego de línea.
 * Vacío cuando la sesión no tiene ninguna línea de carrera que pueda viajar a un
 * reloj de fabricante.
 *
 * POR QUÉ NO BASTA CON LEER `structure`
 * -------------------------------------
 * La gramática estructurada (#61) existe, pero la biblioteca real no está escrita
 * con ella: de los 429 segmentos que hay HOY en producción, exactamente UNO la usa,
 * y ese no está asignado a ningún atleta. Leer solo `structure` dejaría la feature
 * entera en cero sesiones reales — construida, verde en tests, y sin llegar a nadie.
 *
 * Por eso vamos por `legacyToStructure`, que devuelve la `structure` cuando existe
 * y, cuando no, la deriva de los campos planos (`scheme`/`rounds`/`work_s`/`rest_s`/
 * `sets`) en los que SÍ está escrito el contenido del coach. Una línea que no da una
 * estructura válida (le falta la medida o el objetivo) se descarta en vez de viajar
 * a medias: un tramo incompleto en la muñeca es peor que no mandarlo.
 */
export function collectRunStructures(workout: RunStructureSource | null): RunStructure[] {
  if (!workout) return [];
  const out: RunStructure[] = [];
  for (const block of workout.blocks) {
    for (const item of block.items) {
      const prescription = item.prescription_json;
      if (!prescription) continue;
      const structure = legacyToStructure(prescription);
      if (structure && structure.length > 0) out.push(structure);
    }
  }
  return out;
}

/**
 * Funde N estructuras en UNA, agrupando por rol de fase. Devuelve null cuando no
 * hay ningún tramo. Las fases vacías se omiten en vez de emitirse vacías.
 */
export function mergeRunStructures(structures: RunStructure[]): RunStructure | null {
  const byRole = new Map<PhaseRole, Element[]>();
  for (const structure of structures) {
    for (const phase of structure) {
      const bucket = byRole.get(phase.role);
      if (bucket) bucket.push(...phase.elements);
      else byRole.set(phase.role, [...phase.elements]);
    }
  }

  const merged: Phase[] = [];
  for (const role of PHASE_ORDER) {
    const elements = byRole.get(role);
    if (elements && elements.length > 0) merged.push({ role, elements });
  }
  return merged.length > 0 ? merged : null;
}

/**
 * Colapsa una `pace_zone` YA resuelta a su banda absoluta de ritmo. Se deja intacto
 * todo lo demás — incluida una zona sin resolver (el atleta no ha testeado) y una
 * banda abierta por arriba (`slow_s` nulo), que no se puede cerrar sin inventarse
 * el extremo lento.
 */
function absolutizeSegment(segment: Segment): Segment {
  if (segment.target?.type !== 'pace_zone') return segment;
  const resolved = segment.resolved;
  // `per_500m` sería una banda de ergómetro: nunca puede convertirse en un ritmo
  // por kilómetro. Fuera de `per_km` no se toca.
  if (!resolved || resolved.pace_unit !== 'per_km' || resolved.slow_s === null) return segment;
  return {
    ...segment,
    target: { type: 'pace', min_s: resolved.fast_s, max_s: resolved.slow_s },
  };
}

function absolutizeElements(elements: Element[]): Element[] {
  return elements.map((el) =>
    isRepeat(el) ? { ...el, elements: absolutizeElements(el.elements) } : absolutizeSegment(el),
  );
}

/** Aplica `absolutizeSegment` a todo el árbol. */
export function absolutizeResolvedZones(structure: RunStructure): RunStructure {
  return structure.map((phase) => ({ ...phase, elements: absolutizeElements(phase.elements) }));
}

/**
 * La estructura única y lista para codificar de una sesión, o null si la sesión no
 * es de carrera estructurada.
 */
export function runStructureForSession(workout: RunStructureSource | null): RunStructure | null {
  const merged = mergeRunStructures(collectRunStructures(workout));
  return merged ? absolutizeResolvedZones(merged) : null;
}
