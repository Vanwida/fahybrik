// TRADUCIR UN OBJETIVO RELATIVO AL NÚMERO DE ESTE ATLETA (card 130).
//
// La plantilla guarda «a peso de competición» para siempre. Aquí es donde esa
// frase se convierte en los kilos que le tocan a ESTA persona, y se hace AL
// LEER, nunca al guardar: si el número se congelara en la plantilla, la
// plantilla volvería a servir para un solo atleta y no habríamos arreglado nada.
//
// TRES REGLAS DE LA CASA QUE ESTE MÓDULO RESPETA
// ----------------------------------------------
// 1. `null` es una respuesta de primera clase. Un atleta sin test no tiene ritmo
//    de umbral, y la respuesta honesta es «todavía no lo sabemos», no un número
//    inventado ni un cero. Quien pinta enseña la frase y le lleva a hacer ESE
//    test.
// 2. Los KILOS de competición NO son nuestros. El reglamento es del deporte y
//    los kilos que un entrenador da por buenos son SU método: entran inyectados
//    (`stationLoad`), con el catálogo de estaciones como valor por defecto. Ese
//    catálogo devuelve `null` a propósito mientras no tenga fuente — un peso
//    inventado aquí es un atleta entrenando mal.
// 3. Nada se redondea a un número más bonito del que se sabe. Un porcentaje
//    produce decimales y se quedan en un decimal; no se «ajusta a discos»,
//    porque cuántos discos hay en esa sala no lo sabemos.

import type { HyroxStationLoad, HyroxStationSlug } from '../hyrox/stations';
import { hyroxStationLoad } from '../hyrox/stations';
import type { AthleteBenchmarks } from '../methodology/zones';
import { deriveModalityThresholds, resolveTarget } from '../methodology/zones';
import type { RaceDivision, RaceGender } from '../../schema/races';
import { referencePhrase, relativePhrase, type TargetReference } from './reference';
import type { Target } from './types';

// La frase vive en `./reference.ts` (que no importa `./types`, para que no haya
// ciclo) y se reexporta aquí, que es donde la busca quien resuelve.
export { relativePhrase } from './reference';

/** El objetivo relativo, extraído de la unión para poder tiparlo aquí. */
export type RelativeTarget = Extract<Target, { kind: 'relative' }>;

/** De dónde salen los números de ESTE atleta. */
export interface RelativeContext {
  /** Sus marcas: tests, umbrales, objetivo de carrera. */
  benchmarks: AthleteBenchmarks;
  /** Su peso, para las referencias al peso corporal. */
  bodyweightKg?: number | null;
  /** Su división y género, que es lo que decide un peso de competición. */
  division?: RaceDivision | null;
  gender?: RaceGender | null;
  /**
   * Los kilos de competición POR ESTACIÓN — método del entrenador, inyectable.
   * Por defecto el catálogo de estaciones, que hoy contesta `null` a todo
   * porque sus cargas se retiraron por falta de fuente fiable.
   */
  stationLoad?: (
    slug: HyroxStationSlug,
    division: RaceDivision,
    gender: RaceGender,
  ) => HyroxStationLoad | null;
}

export interface ResolvedRelative {
  /** El objetivo ya absoluto: lo que se manda al móvil en el campo de siempre. */
  target: Target;
  /** El porqué, en el idioma del atleta: «a peso de competición». */
  phrase: string;
  /** De qué marca salió (auditoría). */
  source: string;
  /** true cuando hubo que estimar en vez de leer una marca directa. */
  estimated: boolean;
}

/** Redondeo a un decimal. Ni más precisión de la que hay, ni menos. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Los kilos base de una referencia de carga, y cuántos implementos son. */
function loadBase(
  ref: TargetReference,
  ctx: RelativeContext,
): { kg: number; implements?: number; source: string } | null {
  if (ref.of === 'bodyweight') {
    const bw = ctx.bodyweightKg;
    if (bw == null || bw <= 0) return null;
    return { kg: bw, source: 'bodyweight' };
  }
  if (ref.of !== 'competition_load') return null;
  // Sin división o sin género no hay peso de competición que valga: el mismo
  // trineo pesa cosas distintas en Open y en Pro. Preferimos no contestar.
  if (!ctx.division || !ctx.gender) return null;
  const lookup = ctx.stationLoad ?? hyroxStationLoad;
  const load = lookup(ref.station, ctx.division, ctx.gender);
  if (!load) return null;
  switch (load.kind) {
    case 'single':
    case 'sled':
      return { kg: load.kg, source: `competition_load:${ref.station}` };
    case 'per_implement':
      return { kg: load.kg, implements: load.implements, source: `competition_load:${ref.station}` };
    case 'damper':
      // El damper de un ergómetro es un ajuste de resistencia, no una carga:
      // no hay kilos que devolver y fingir que los hay sería mentir.
      return null;
  }
}

/** El ritmo base de una referencia de ritmo. */
function paceTarget(ref: TargetReference, ctx: RelativeContext): ResolvedRelative | null {
  if (ref.of === 'race_pace') {
    // Sólo correr tiene hoy ancla de ritmo de CARRERA (el objetivo de los 8 km
    // dividido entre la distancia). Para remo y ski el atleta no guarda todavía
    // un objetivo de carrera por estación: se puede DECIR y aún no se puede
    // traducir, y eso se contesta con la verdad.
    if (ref.modality !== 'run') return null;
    const r = resolveTarget('race pace', ctx.benchmarks);
    if (!r) return null;
    return { target: r.target, phrase: referencePhrase(ref), source: r.source, estimated: r.estimated };
  }
  if (ref.of !== 'threshold_pace') return null;
  // El umbral de bici es potencia (FTP), no ritmo: no está en esta lista y no
  // se fuerza a serlo.
  const th = deriveModalityThresholds(ctx.benchmarks).find((m) => m.modality === ref.modality);
  if (!th) return null;
  return {
    target: { kind: 'pace', unit: th.pace_unit, value_s: Math.round(th.threshold_s) },
    phrase: referencePhrase(ref),
    source: th.source,
    estimated: th.estimated,
  };
}

/**
 * El objetivo relativo → el objetivo absoluto de ESTE atleta, o `null` si le
 * falta la marca. Pura: no toca base de datos ni reloj.
 */
export function resolveRelativeTarget(t: RelativeTarget, ctx: RelativeContext): ResolvedRelative | null {
  const paced = paceTarget(t.ref, ctx);
  if (paced) return paced;
  // Una referencia de ritmo que no resuelve NO cae al camino de la carga: son
  // cosas distintas y devolver kilos ahí sería absurdo.
  if (t.ref.of === 'race_pace' || t.ref.of === 'threshold_pace') return null;

  const base = loadBase(t.ref, ctx);
  if (!base) return null;

  let lo = base.kg;
  let hi: number | undefined;
  if (t.percent !== undefined) {
    lo = (base.kg * t.percent) / 100;
    if (t.percent_max !== undefined) hi = (base.kg * t.percent_max) / 100;
  } else if (t.delta_kg !== undefined) {
    lo = base.kg + t.delta_kg;
    if (t.delta_kg_max !== undefined) hi = base.kg + t.delta_kg_max;
  }
  // Un delta grande hacia abajo puede cruzar el cero. Cero kilos es el suelo
  // real; no existe carga negativa.
  lo = Math.max(0, round1(lo));
  if (hi !== undefined) hi = Math.max(0, round1(hi));

  const target: Target =
    hi !== undefined && hi > lo
      ? { kind: 'kg', min: lo, max: hi, ...(base.implements ? { implement_count: base.implements } : {}) }
      : { kind: 'kg', value: lo, ...(base.implements ? { implement_count: base.implements } : {}) };

  return { target, phrase: relativePhrase(t), source: base.source, estimated: false };
}
