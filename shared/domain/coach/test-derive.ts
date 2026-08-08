// test-derive — QUÉ MIDE un test, deducido de lo que el coach ya construyó.
//
// Un test se monta con el MISMO editor que cualquier entreno: eliges el
// ejercicio y rellenas los campos numéricos (distancia, tiempo, calorías,
// reps, carga). Pedirle además al coach que declare "qué mide" en una lista
// aparte era decir dos veces lo mismo — y abría la puerta a que las dos se
// contradijeran (declarar "tiempo" en un bloque prescrito por tiempo, donde
// el tiempo es el DATO, no el resultado).
//
// LA REGLA, que es física, no una convención nuestra: en un esfuerzo máximo
// se mide la variable que NO has fijado.
//   · fijas la distancia (1000 m) ....... mides el TIEMPO
//   · fijas el tiempo (10 min) .......... mides la DISTANCIA
//   · fijas las calorías (40 cal) ....... mides el TIEMPO
//   · no fijas nada y buscas el máximo .. mides la CARGA (1RM)
//
// Y CALIBRA solo cuando el contenido coincide con un protocolo cuya fórmula
// existe de verdad: las zonas de ritmo se derivan ancladas en 5K de carrera,
// 2K de remo y 1K de ski — un 1000 m de remo del coach es una marca válida y
// comparable consigo misma, pero NO recalcula zonas, porque la fórmula no
// está anclada ahí. Decir lo contrario sería inventar. Ver CALIBRATION_TARGETS
// (test-battery.ts) y docs/DECISIONS.md.

import type { Prescription } from '../prescription/types';
import type {
  StoreResultSpec,
  StoreResultMeasure,
  StoreResultUnit,
} from '../../schema/test-battery';
import {
  BENCH_RUN_5K,
  BENCH_ROW_2K,
  BENCH_SKI_1K,
} from './benchmark-slugs';
import { EXERCISE_TO_1RM_BENCHMARK } from '../strength/exercises';

/** Una línea del contenido, reducida a lo que la deducción necesita. */
export interface DerivableItem {
  exercise_name: string;
  /** Slug del catálogo — solo lo necesita el 1RM (mapear a su benchmark). */
  exercise_slug?: string | null;
  prescription: Prescription;
}

/** Lo que un bloque mide, ya resuelto y listo para enseñar al coach. */
export interface DerivedMeasure {
  measure: StoreResultMeasure;
  unit: StoreResultUnit;
  /** Cara-coach, tal cual se pinta: «Se mide el tiempo». */
  label: string;
}

const MEASURE_LABEL: Record<StoreResultMeasure, string> = {
  time: 'el tiempo',
  distance: 'la distancia',
  load: 'la carga',
  reps: 'las repeticiones',
  calories: 'las calorías',
  hrr: 'la recuperación de pulso',
  hr: 'el pulso',
};

const ERG_OR_RUN = new Set(['run', 'row', 'ski', 'bike']);

/** El primer `measure` que declara una prescripción (todas sus series comparten
 *  forma en un test: es un esfuerzo único, no una pirámide). */
function fixedKind(p: Prescription): 'distance' | 'duration' | 'calories' | 'reps' | null {
  const m = p.sets?.[0]?.measure;
  if (m) {
    if (m.kind === 'distance' && m.meters > 0) return 'distance';
    if (m.kind === 'duration' && m.seconds > 0) return 'duration';
    if (m.kind === 'calories' && m.value > 0) return 'calories';
    if (m.kind === 'reps' && m.value > 0) return 'reps';
  }
  if (p.total_s && p.total_s > 0) return 'duration';
  return null;
}

/** Metros fijados por la prescripción, si los hay (para casar con un protocolo). */
function fixedMeters(p: Prescription): number | null {
  const m = p.sets?.[0]?.measure;
  return m && m.kind === 'distance' && m.meters > 0 ? m.meters : null;
}

/**
 * Qué mide UNA línea, deducido de lo que fija. `null` cuando no fija nada
 * medible (una movilidad, un bloque a medio construir) — entonces no hay
 * resultado que prometer, y eso es honesto, no un fallo.
 */
export function derivedMeasureFor(item: DerivableItem): DerivedMeasure | null {
  const p = item.prescription;
  const modality = p.modality ?? undefined;
  const kind = fixedKind(p);

  // Cardio / ergo: la variable libre es la que se mide.
  if (modality && ERG_OR_RUN.has(modality)) {
    if (kind === 'distance' || kind === 'calories') {
      return { measure: 'time', unit: 'seconds', label: MEASURE_LABEL.time };
    }
    if (kind === 'duration') {
      return { measure: 'distance', unit: 'meters', label: MEASURE_LABEL.distance };
    }
    return null;
  }

  // Fuerza: el máximo es la carga. Las reps prescritas son el protocolo
  // (subir en series hasta el tope), no el resultado.
  if (modality === 'strength') {
    return { measure: 'load', unit: 'kg', label: MEASURE_LABEL.load };
  }

  // Funcional / core / lo demás: si va contra el reloj, el tiempo; si fija el
  // reloj, las reps hechas dentro.
  if (kind === 'reps' || kind === 'distance') {
    return { measure: 'time', unit: 'seconds', label: MEASURE_LABEL.time };
  }
  if (kind === 'duration') {
    // Fijas el reloj en un movimiento funcional (4 min de wall balls) → lo que se
    // acumula son REPETICIONES. La unidad es 'reps', no metros: escribirlo mal
    // guardaba la marca del atleta con la unidad de otra cosa.
    return { measure: 'reps', unit: 'reps', label: MEASURE_LABEL.reps };
  }
  return null;
}

/** El benchmark cuya FÓRMULA de zonas está anclada en este contenido exacto, o
 *  null. Solo tres: 5K carrera, 2K remo, 1K ski (CALIBRATION_TARGETS). */
function zoneAnchorSlug(item: DerivableItem): string | null {
  const modality = item.prescription.modality;
  const meters = fixedMeters(item.prescription);
  if (meters == null) return null;
  if (modality === 'run' && meters === 5000) return BENCH_RUN_5K;
  if (modality === 'row' && meters === 2000) return BENCH_ROW_2K;
  if (modality === 'ski' && meters === 1000) return BENCH_SKI_1K;
  return null;
}

/** Cara-coach: qué calibra esta línea, o null si solo se guarda como marca.
 *  Lo usa el panel para decirlo SIN preguntarlo. Las zonas solo salen cuando el
 *  contenido es exactamente el protocolo en el que la fórmula está anclada. */
export function calibrationLabelFor(item: DerivableItem): string | null {
  const zone = zoneAnchorSlug(item);
  if (zone === BENCH_RUN_5K) return 'tus zonas de carrera';
  if (zone === BENCH_ROW_2K) return 'tus zonas de remo';
  if (zone === BENCH_SKI_1K) return 'tus zonas de ski';
  if (item.prescription.modality === 'strength' && liftBenchmarkSlug(item)) return 'tu 1RM';
  return null;
}

/** El benchmark de 1RM del levantamiento, cuando el ejercicio es uno de los
 *  seis que el motor sabe resolver (%RM → kg). */
function liftBenchmarkSlug(item: DerivableItem): string | null {
  const slug = item.exercise_slug;
  if (!slug) return null;
  return EXERCISE_TO_1RM_BENCHMARK[slug] ?? null;
}

/** Slug estable para una marca propia del coach (no calibra, se guarda y se
 *  compara consigo misma en el tiempo). Determinista: el mismo contenido
 *  produce el mismo slug, así que reeditar el test no rompe el historial. */
function baselineSlug(testSlug: string, item: DerivableItem, index: number): string {
  const name = item.exercise_name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return `${testSlug}_${name || 'marca'}_${index}`.slice(0, 60);
}

/**
 * El contrato de resultados de un test, DEDUCIDO de su contenido. Una entrada
 * por línea medible, en orden. Vacío cuando el contenido no fija nada medible.
 *
 * Calibra (derives != 'none') solo cuando el contenido coincide EXACTO con un
 * protocolo cuya fórmula existe; el resto se guarda como marca del atleta.
 */
export function deriveStoreResults(
  testSlug: string,
  items: readonly DerivableItem[],
): StoreResultSpec[] {
  const out: StoreResultSpec[] = [];
  const seen = new Set<string>();

  items.forEach((item, i) => {
    const derived = derivedMeasureFor(item);
    if (!derived) return;

    const zoneSlug = zoneAnchorSlug(item);
    const liftSlug = derived.measure === 'load' ? liftBenchmarkSlug(item) : null;

    let spec: StoreResultSpec;
    if (zoneSlug) {
      const modality = item.prescription.modality as 'run' | 'row' | 'ski';
      spec = {
        slug: zoneSlug,
        measure: 'time',
        unit: 'seconds',
        derives: `${modality}_zones` as StoreResultSpec['derives'],
        modality,
        label: item.exercise_name,
      };
    } else if (liftSlug) {
      spec = {
        slug: liftSlug,
        measure: 'load',
        unit: 'kg',
        derives: 'strength_max',
        modality: 'strength',
        label: item.exercise_name,
      };
    } else {
      spec = {
        slug: baselineSlug(testSlug, item, i),
        measure: derived.measure,
        unit: derived.unit,
        derives: 'none',
        label: item.exercise_name,
      };
    }

    if (seen.has(spec.slug)) return; // dos líneas del mismo lift → una sola marca
    seen.add(spec.slug);
    out.push(spec);
  });

  return out;
}
